import { createHash } from 'node:crypto';
import type { Config } from '../model/config.ts';
import { type Delta, diff } from '../model/diff.ts';
import type { Finding } from '../model/rule.ts';
import { checkProject } from './check.ts';
import type { Analyzer, FindingsCache, Repository } from './ports.ts';

export interface Range {
  base: string;
  /** Undefined compares against the working tree. */
  head?: string;
  /** `base...head`: compare from where head left base, as git does. */
  fromMergeBase: boolean;
}

export class InvalidRange extends Error {}

/** Parses `base`, `base..head` or `base...head`. Refs may contain single dots, as tags like v1.2 do. */
export const parseRange = (range: string): Range => {
  const match = /^(.+?)(\.\.\.|\.\.)(.*)$/.exec(range);
  const [base, separator, head] = match ? match.slice(1) : [range, '', ''];
  if (!base || base.includes('..') || head.includes('..')) throw new InvalidRange(`${range} is not a range: expected <base>, <base>..<head> or <base>...<head>`);
  return { base, ...(head ? { head } : {}), fromMergeBase: separator === '...' };
};

export interface DiffRequest {
  range: Range;
  /** The working tree's project directory. */
  root: string;
  config: Config;
  /** Part of the cache key: a digest of the config file and the project's own rules it imports. */
  configDigest?: string;
  /** Part of the cache key, so a new release of the tool never reuses old findings. */
  toolVersion: string;
}

/** Checks both sides with the working tree's config, so a delta reflects code changes rather than rule changes. */
export const diffProject = (
  { range, root, config, configDigest = '', toolVersion }: DiffRequest,
  { analyzer, repository, cache }: { analyzer: Analyzer; repository: Repository; cache: FindingsCache },
): Delta => {
  const configHash = createHash('sha256').update(JSON.stringify(config)).update(configDigest).digest('hex').slice(0, 16);
  const atCommit = (ref: string): Finding[] => {
    const commit = repository.commit(ref);
    const key = `${toolVersion}-${configHash}-${commit}-${repository.projectPath().replaceAll('/', '_')}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const checkout = repository.checkout(commit, config.tsconfig);
    try {
      // A commit from before the project existed has nothing to report.
      const findings = checkout.projectRoot ? checkProject(analyzer, checkout.projectRoot, config) : [];
      cache.set(key, findings);
      return findings;
    } finally {
      checkout.dispose();
    }
  };
  const { head } = range;
  const base = range.fromMergeBase ? repository.mergeBase(range.base, head ?? 'HEAD') : range.base;
  return diff(atCommit(base), head === undefined ? checkProject(analyzer, root, config) : atCommit(head));
};
