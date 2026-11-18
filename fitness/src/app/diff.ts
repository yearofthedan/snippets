import { createHash } from 'node:crypto';
import type { Config } from '../model/config.ts';
import { type Delta, diff } from '../model/diff.ts';
import type { Finding } from '../model/rules.ts';
import { checkProject } from './check.ts';
import type { Analyzer, FindingsCache, Repository } from './ports.ts';

export interface DiffRequest {
  base: string;
  /** Undefined compares against the working tree. */
  head?: string;
  /** The working tree's project directory. */
  root: string;
  config: Config;
  /** Part of the cache key, so a new release of the tool never reuses old findings. */
  toolVersion: string;
}

/** Checks both sides with the working tree's config, so a delta reflects code changes rather than rule changes. */
export const diffProject = (
  { base, head, root, config, toolVersion }: DiffRequest,
  { analyzer, repository, cache }: { analyzer: Analyzer; repository: Repository; cache: FindingsCache },
): Delta => {
  const configHash = createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 16);
  const atCommit = (ref: string): Finding[] => {
    const commit = repository.commit(ref);
    const key = `${toolVersion}-${configHash}-${commit}-${repository.projectPath().replaceAll('/', '_')}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const checkout = repository.checkout(commit);
    try {
      const findings = checkProject(analyzer, checkout.projectRoot, config);
      cache.set(key, findings);
      return findings;
    } finally {
      checkout.dispose();
    }
  };
  return diff(atCommit(base), head === undefined ? checkProject(analyzer, root, config) : atCommit(head));
};
