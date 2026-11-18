import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import type { Repository } from '../app/ports.ts';

/** The git repository holding projectRoot. Checkouts are detached worktrees that share the project's node_modules. */
export const gitRepository = (projectRoot: string): Repository => {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  // git reports the top level with symlinks resolved, so resolve the project root the same way before comparing.
  const top = realpathSync(git('rev-parse', '--show-toplevel'));
  const project = realpathSync(projectRoot);
  const projectPath = relative(top, project).split(sep).join('/');
  return {
    projectPath: () => projectPath,
    commit: (ref) => git('rev-parse', '--verify', `${ref}^{commit}`),
    mergeBase: (a, b) => git('merge-base', a, b),
    checkout(commit, requiredFile) {
      const dir = mkdtempSync(join(tmpdir(), 'fitness-'));
      const dispose = () => {
        try {
          git('worktree', 'remove', '--force', dir);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      };
      try {
        git('worktree', 'add', '--detach', '--quiet', dir, commit);
        const root = join(dir, projectPath);
        if (!existsSync(join(root, requiredFile))) return { dispose };
        for (const from of new Set([project, top])) {
          const modules = join(from, 'node_modules');
          const to = join(dir, relative(top, from), 'node_modules');
          if (existsSync(modules) && !existsSync(to)) symlinkSync(modules, to, 'dir');
        }
        return { projectRoot: root, dispose };
      } catch (error) {
        try {
          dispose();
        } catch {
          // The original failure is the one to report.
        }
        throw error;
      }
    },
  };
};

/** The project's path inside its git repository, or empty when it is the root or not in a repository. */
export const projectPathOf = (projectRoot: string): string => {
  try {
    return gitRepository(projectRoot).projectPath();
  } catch {
    return '';
  }
};
