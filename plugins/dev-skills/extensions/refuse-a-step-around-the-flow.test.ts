import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import refuseAStepAroundTheFlow, { type Extension } from './refuse-a-step-around-the-flow.ts';

type Handler = (
  event: { toolName: string; input: Record<string, unknown> },
  context: { cwd: string },
) => unknown;

const handler = (): Handler => {
  let registered: Handler | undefined;
  const pi: Extension = {
    on: (_event, next) => {
      registered = next as Handler;
    },
  };
  refuseAStepAroundTheFlow(pi);
  if (registered === undefined) throw new Error('the extension registered no handler');
  return registered;
};

type Tree = {
  branch?: string;
  dirty?: string[];
  untracked?: string[];
  preCommit?: 'installed' | 'missing' | 'not executable';
  hooksPath?: string;
  tasks?: string[] | false;
  pnpm?: boolean;
};

const executable = (path: string): void => {
  writeFileSync(path, '#!/bin/sh\nexit 0\n');
  chmodSync(path, 0o755);
};

const repository = ({
  branch = '73-fix-a-dodgy-restore',
  dirty = [],
  untracked = [],
  preCommit = 'installed',
  hooksPath,
  tasks = ['ready', 'check'],
  pnpm = true,
}: Tree = {}): string => {
  const dir = mkdtempSync(join(tmpdir(), 'refuse-a-step-around-the-flow-'));
  execFileSync('git', ['init', '-q', '-b', branch, dir]);
  writeFileSync(join(dir, 'notes.txt'), 'as committed\n');
  mkdirSync(join(dir, 'plan'), { recursive: true });
  writeFileSync(join(dir, 'plan/beats.md'), 'as committed\n');
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', [
    '-C',
    dir,
    '-c',
    'user.email=t@example.com',
    '-c',
    'user.name=t',
    'commit',
    '-qm',
    'base',
  ]);
  if (tasks !== false) {
    executable(join(dir, 'do'));
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    for (const task of tasks) executable(join(dir, 'scripts', task));
  }
  if (pnpm) writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
  const hooks = join(dir, hooksPath ?? '.git/hooks');
  if (hooksPath !== undefined)
    execFileSync('git', ['-C', dir, 'config', 'core.hooksPath', hooksPath]);
  if (preCommit !== 'missing') {
    mkdirSync(hooks, { recursive: true });
    const hook = join(hooks, 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 0\n');
    chmodSync(hook, preCommit === 'installed' ? 0o755 : 0o644);
  }
  for (const path of dirty) writeFileSync(join(dir, path), 'a change not committed\n');
  for (const path of untracked) writeFileSync(join(dir, path), 'new\n');
  return dir;
};

const repositoryToSwitchIn = (): { main: string; linked: string } => {
  const main = repository();
  execFileSync('git', ['-C', main, 'branch', '73-another-line']);
  execFileSync('git', ['-C', main, 'update-ref', 'refs/remotes/origin/73-a-remote-line', 'HEAD']);
  const linked = `${main}-linked`;
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', linked, '-b', '73-a-linked-line']);
  writeFileSync(join(linked, 'notes.txt'), 'a change not committed\n');
  return { main, linked };
};

const refused = (command: string, sessionCwd: string, namedCwd?: string): boolean =>
  handler()(
    { toolName: 'bash', input: namedCwd === undefined ? { command } : { command, cwd: namedCwd } },
    { cwd: sessionCwd },
  ) !== undefined;

const reasonFor = (command: string, cwd: string): string =>
  (handler()({ toolName: 'bash', input: { command } }, { cwd }) as { reason?: string } | undefined)
    ?.reason ?? '';

describe('a git restore or checkout', () => {
  const dirty = repository({ dirty: ['notes.txt', 'plan/beats.md'] });
  const clean = repository();
  const untracked = repository({ untracked: ['fresh.txt'] });
  const twoC = repository();
  const throughTwoC = `git -C ${dirname(twoC)} -C ${basename(twoC)} restore notes.txt`;

  for (const command of [
    'git restore notes.txt',
    'git checkout notes.txt',
    'git restore plan',
    'git restore .',
    'git restore --worktree notes.txt',
    'git restore --staged --worktree notes.txt',
    'git restore -SW notes.txt',
    'git restore -- notes.txt',
    "git restore '*.txt'",
    'git restore :/',
  ]) {
    it(`refuses ${command}, which would overwrite a change`, () => {
      assert.equal(refused(command, dirty), true);
    });
  }

  it('refuses git restore behind -C into the repository holding the change', () => {
    assert.equal(refused(`git -C ${dirty} restore notes.txt`, clean), true);
  });

  for (const [command, path] of [
    ['git restore notes.txt', 'notes.txt'],
    ['git restore notes.txt plan/beats.md', 'plan/beats.md'],
  ] as const) {
    it(`names ${command} in the reason it gives`, () => {
      assert.ok(reasonFor(command, dirty).includes(path));
    });
  }

  for (const [command, cwd] of [
    ['git restore --staged notes.txt', dirty],
    ['git status', dirty],
    ['git restore notes.txt', clean],
    ['git restore fresh.txt', untracked],
  ] as [string, string][]) {
    it(`passes ${command} where the tree holds nothing for it`, () => {
      assert.equal(refused(command, cwd), false);
    });
  }

  it('passes git restore where two -C options lead to the repository', () => {
    assert.equal(refused(throughTwoC, clean), false);
  });

  it('refuses git restore in a directory git cannot be asked about', () => {
    assert.equal(refused('git restore notes.txt', mkdtempSync(join(tmpdir(), 'not-a-repository-'))), true);
  });
});

describe('a git push', () => {
  const clean = repository();
  const onMain = repository({ branch: 'main' });
  const onASpike = repository({ branch: 'spike' });
  const detached = repository();
  execFileSync('git', ['-C', detached, 'checkout', '-q', '--detach']);

  for (const [command, cwd] of [
    ['git push', onMain],
    ['git push', onASpike],
    ['git push origin main', clean],
    ['git push origin 74-another-line', clean],
    ['git push --force', clean],
    ['git push -f origin 73-fix-a-dodgy-restore', clean],
    ['git push --force-with-lease', clean],
    ['git push origin +73-fix-a-dodgy-restore', clean],
    ['git push --delete origin 73-fix-a-dodgy-restore', clean],
    ['git push --all', clean],
    ['git push --mirror', clean],
    ['git push --tags', clean],
    ['git push', detached],
    ['echo hi > "" ; git push --force origin main', clean],
    ['git push 2>/dev/null --force origin main', clean],
    ['GIT_TRACE=1 git push --force origin main', clean],
    ['git push \\\n--force', clean],
    ['command git push --force origin main', clean],
    ['builtin git push --force origin main', clean],
    ['exec git push --force origin main', clean],
  ] as [string, string][]) {
    it(`refuses ${command}`, () => {
      assert.equal(refused(command, cwd), true);
    });
  }

  for (const [command, wanted] of [
    ['git push origin main', 'main'],
    ['git push --delete origin 73-fix-a-dodgy-restore', 'removal is the builder'],
  ] as const) {
    it(`says why, for ${command}`, () => {
      assert.ok(reasonFor(command, clean).includes(wanted));
    });
  }

  for (const [command, cwd] of [
    ['git push', clean],
    ['git push -u origin HEAD', clean],
    ['git push origin 73-fix-a-dodgy-restore', clean],
    ['git commit -m "stop: git push --force blocked"', clean],
    ['command git push -u origin HEAD', clean],
    ['builtin git push -u origin HEAD', clean],
    ['exec git push -u origin HEAD', clean],
  ] as [string, string][]) {
    it(`passes ${command}`, () => {
      assert.equal(refused(command, cwd), false);
    });
  }

  for (const command of [
    'git push -u origin HEAD 2>&1',
    'git push -u origin HEAD 2>&1 | tail -3',
    `git -C ${clean} push -u origin HEAD 2>&1 | tail -3`,
    'git push -u origin HEAD > "a log file"',
    'git push --force-if-includes',
  ]) {
    it(`passes ${command}`, () => {
      assert.equal(refused(command, clean), false);
    });
  }
});

describe('the directory the call runs in', () => {
  const main = repository({ branch: 'main' });
  const linked = `${main}-linked`;
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', linked, '-b', '73-a-linked-line']);

  it('passes a push from the worktree the call names, not the session', () => {
    assert.equal(refused('git push -u origin HEAD', main, linked), false);
  });

  it('refuses a push on the branch of the worktree the call names', () => {
    assert.equal(refused('git push -u origin HEAD', linked, main), true);
  });

  it('reads a push after cd against the worktree the cd names', () => {
    assert.equal(refused(`cd ${linked} && git push -u origin HEAD`, main), false);
    assert.equal(refused(`cd ${main} && git push -u origin HEAD`, linked), true);
  });

  it('resolves a relative cd against the directory the call runs in', () => {
    assert.equal(refused(`cd ${basename(linked)} && git push -u origin HEAD`, dirname(linked)), false);
    assert.equal(refused(`cd ${basename(main)} && git push -u origin HEAD`, dirname(main)), true);
  });
});

describe('gh pr ready', () => {
  const clean = repository();

  for (const command of ['gh pr ready 77', 'gh pr ready', 'git push && gh pr ready 77']) {
    it(`refuses ${command}`, () => {
      assert.equal(refused(command, clean), true);
    });
  }

  it('names ./do ready', () => {
    assert.ok(reasonFor('gh pr ready 77', clean).includes('./do ready'));
  });

  for (const command of [
    'gh pr ready 77 --undo',
    './do ready 77',
    'gh pr view 77 --json body',
    'gh pr checks 77',
  ]) {
    it(`passes ${command}`, () => {
      assert.equal(refused(command, clean), false);
    });
  }
});

describe('a branch switch', () => {
  const { main, linked } = repositoryToSwitchIn();

  for (const command of [
    'git switch 73-another-line',
    'git switch -c 73-new',
    'git switch -',
    'git checkout 73-another-line',
    'git checkout -',
    'git checkout 73-a-remote-line',
    'git checkout -b 73-new',
    'git checkout --detach 73-another-line',
  ]) {
    it(`refuses ${command} in the main worktree`, () => {
      assert.equal(refused(command, main), true);
    });
  }

  it('names the worktree the planned pull request starts in', () => {
    assert.ok(reasonFor('git switch 73-another-line', main).includes('git worktree add'));
  });

  for (const command of [
    'git switch 73-another-line',
    'git checkout 73-another-line',
    'git checkout -b 73-new',
    'git checkout 73-a-remote-line',
  ]) {
    it(`passes ${command} in a linked worktree`, () => {
      assert.equal(refused(command, linked), false);
    });
  }

  for (const command of [
    'git worktree add ../73-new -b 73-new origin/main',
    'git checkout notes.txt',
    'git checkout -- notes.txt',
    'git checkout HEAD -- notes.txt',
    'git switch --help',
  ]) {
    it(`passes ${command} in the main worktree`, () => {
      assert.equal(refused(command, main), false);
    });
  }

  it('passes behind -C, read against the worktree it names', () => {
    assert.equal(refused(`git -C ${linked} switch 73-another-line`, main), false);
  });
});

describe('a git commit', () => {
  const clean = repository();

  for (const command of [
    'git commit --no-verify -m "72: a change"',
    'git commit -n -m "72: a change"',
    'git commit -anm "72: a change"',
    'git commit -m "72: a change" --no-verify',
    'git add -A && git commit -n -m "72: a change"',
    `git -C ${clean} commit --no-verify -m "72: a change"`,
    'git commit --no-veri -m "72: a change"',
    'git commit --no-verif -m "72: a change"',
    'DISABLE_MODEL_CHECK=1 git commit -n -m "72: a change"',
    'VP_GIT_HOOKS=0 git commit -m "72: a change"',
    'HUSKY=0 git commit -m "72: a change"',
    'env VITE_GIT_HOOKS=0 git commit -m "72: a change"',
  ]) {
    it(`refuses ${command}`, () => {
      assert.equal(refused(command, clean), true);
    });
  }

  it('names the checks it would skip', () => {
    assert.ok(reasonFor('git commit -n -m "72: a change"', clean).includes('./do check'));
  });

  it('reads the hook from where core.hooksPath points, not .git/hooks', () => {
    const elsewhere = repository({ preCommit: 'missing', hooksPath: '.vite-hooks/_' });
    writeFileSync(join(elsewhere, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(elsewhere, '.git/hooks/pre-commit'), 0o755);
    assert.equal(refused('git commit -m "72: a change"', elsewhere), true);
    assert.equal(
      refused('git commit -m "72: a change"', repository({ hooksPath: '.vite-hooks/_' })),
      false,
    );
  });

  for (const [what, cwd] of [
    ['missing', repository({ preCommit: 'missing', hooksPath: '.githooks' })],
    ['not executable', repository({ preCommit: 'not executable', hooksPath: '.githooks' })],
  ] as const) {
    it(`refuses a commit where the pre-commit hook is ${what} and the repository sets hooks up`, () => {
      assert.equal(refused('git commit -m "72: a change"', cwd), true);
    });
  }

  it('passes a commit in a plain repository that uses no git hooks', () => {
    assert.equal(refused('git commit -m "72: a change"', repository({ preCommit: 'missing', tasks: false })), false);
  });

  it('refuses a commit in a worktree of a repository that has hooks but where this worktree has none', () => {
    const main = repository({ hooksPath: '.githooks' });
    const linked = `${main}-linked`;
    execFileSync('git', ['-C', main, 'worktree', 'add', '-q', linked, '-b', '73-a-linked-line']);
    assert.equal(refused('git commit -m "72: a change"', linked), true);
    assert.equal(refused('git commit -m "72: a change"', main), false);
  });

  it('names pnpm install where the pre-commit hook is missing', () => {
    assert.ok(
      reasonFor(
        'git commit -m "72: a change"',
        repository({ preCommit: 'missing', hooksPath: '.githooks' }),
      ).includes('pnpm install'),
    );
  });

  it('reads the hook from the worktree -C names', () => {
    const missing = repository({ preCommit: 'missing', hooksPath: '.githooks' });
    assert.equal(refused(`git -C ${missing} commit -m "72: a change"`, clean), true);
    assert.equal(refused(`git -C ${clean} commit -m "72: a change"`, missing), false);
  });

  for (const command of [
    'git commit -m "72: a change"',
    'git commit -am "72: a change"',
    'git commit -mn',
    'git commit -m "72: refuse --no-verify"',
    'git commit -uno -m "72: a change"',
    "git commit --allow-empty -m '72: a title' --trailer 'Agent-Model: x'",
    'DISABLE_MODEL_CHECK=1 git commit -m "72: a change"',
    'git commit --no-verbose -m "72: a change"',
    'VP_GIT_HOOKS=1 git commit -m "72: a change"',
  ]) {
    it(`passes ${command}`, () => {
      assert.equal(refused(command, clean), false);
    });
  }
});

describe('the tooling gates', () => {
  it('files a gh pr ready refusal only where ./do has a ready task', () => {
    assert.equal(refused('gh pr ready 77', repository()), true);
    assert.equal(refused('gh pr ready 77', repository({ tasks: ['check'] })), false);
    assert.equal(refused('gh pr ready 77', repository({ tasks: false })), false);
  });

  it('files the story-branch push rule only where ./do exists', () => {
    const onMain = repository({ branch: 'main', tasks: false });
    assert.equal(refused('git push', onMain), false);
    assert.equal(refused('git push origin main', onMain), false);
    const onABranch = repository({ branch: 'spike', tasks: false });
    assert.equal(refused('git push origin spike', onABranch), false);
  });

  it('names ./do check only where the repository has it', () => {
    assert.ok(
      reasonFor('git commit -n -m "72: a change"', repository()).includes('`./do check`'),
    );
    const without = reasonFor(
      'git commit -n -m "72: a change"',
      repository({ tasks: ['ready'] }),
    );
    assert.ok(!without.includes('./do check'));
    assert.ok(without.includes('the pre-commit hook'));
  });

  it('names pnpm install only where pnpm-lock.yaml is at the root', () => {
    assert.ok(
      reasonFor(
        'git commit -m "72: a change"',
        repository({ preCommit: 'missing', hooksPath: '.githooks', pnpm: true }),
      ).includes('pnpm install'),
    );
    const without = reasonFor(
      'git commit -m "72: a change"',
      repository({ preCommit: 'missing', hooksPath: '.githooks', pnpm: false }),
    );
    assert.ok(!without.includes('pnpm'));
    assert.ok(without.includes("Install the repository's git hooks"));
  });
});

describe('a tool call', () => {
  it('passes when it is not bash', () => {
    assert.equal(handler()({ toolName: 'read', input: {} }, { cwd: repository() }), undefined);
  });
});
