import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FindingsCache } from '../app/ports.ts';
import type { Finding } from '../model/rules.ts';

/** Keeps findings under the repository's git directory, out of the working tree. */
export const gitDirCache = (projectRoot: string): FindingsCache => {
  const gitDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  const dir = join(resolve(projectRoot, gitDir), 'fitness-cache');
  return {
    get(key) {
      try {
        return JSON.parse(readFileSync(join(dir, `${key}.json`), 'utf8')) as Finding[];
      } catch {
        return undefined;
      }
    },
    set(key, findings) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${key}.json`), JSON.stringify(findings));
    },
  };
};
