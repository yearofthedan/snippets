import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import type { Repository } from '../app/ports.ts';

/** The git repository holding projectRoot. Checkouts are detached worktrees that share the project's node_modules. */
export const gitRepository = (projectRoot: string): Repository => {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const top = git('rev-parse', '--show-toplevel');
  const projectPath = relative(top, projectRoot).split(sep).join('/');
  return {
    projectPath: () => projectPath,
    commit: (ref) => git('rev-parse', '--verify', `${ref}^{commit}`),
    checkout(commit) {
      const dir = mkdtempSync(join(tmpdir(), 'fitness-'));
      git('worktree', 'add', '--detach', '--quiet', dir, commit);
      const root = join(dir, projectPath);
      for (const from of new Set([projectRoot, top])) {
        const modules = join(from, 'node_modules');
        const to = join(dir, relative(top, from), 'node_modules');
        if (existsSync(modules) && !existsSync(to)) symlinkSync(modules, to, 'dir');
      }
      return {
        projectRoot: root,
        dispose() {
          git('worktree', 'remove', '--force', dir);
          rmSync(dir, { recursive: true, force: true });
        },
      };
    },
  };
};
