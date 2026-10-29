import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import refuseAnEditInTheMainWorktree, {
  type Extension,
} from './refuse-an-edit-in-the-main-worktree.ts';

type Call = { toolName: string; input: Record<string, unknown> };
type Session = { cwd: string; agent: { kind: string } };

type Handler = (event: Call, context: Session) => unknown;

const handler = (): Handler => {
  let registered: Handler | undefined;
  const pi: Extension = {
    on: (_event, next) => {
      registered = next as Handler;
    },
  };
  refuseAnEditInTheMainWorktree(pi);
  if (registered === undefined) throw new Error('the extension registered no handler');
  return registered;
};

const subagent = { kind: 'sub' };
const mainSession = { kind: 'main' };

const repository = (): { main: string; linked: string } => {
  const main = mkdtempSync(join(tmpdir(), 'refuse-an-edit-in-the-main-worktree-'));
  execFileSync('git', ['init', '-q', '-b', '75-a-line', main]);
  writeFileSync(join(main, '.gitignore'), 'ignored/\n');
  writeFileSync(join(main, 'notes.txt'), 'as committed\n');
  mkdirSync(join(main, 'ignored'), { recursive: true });
  writeFileSync(join(main, 'ignored/notes.md'), 'kept out of git\n');
  execFileSync('git', ['-C', main, 'add', '-A']);
  execFileSync('git', [
    '-C',
    main,
    '-c',
    'user.email=t@example.com',
    '-c',
    'user.name=t',
    'commit',
    '-qm',
    'base',
  ]);
  const linked = `${main}-linked`;
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', linked, '-b', '75-another-line']);
  return { main, linked };
};

const aWrite = (path: string): Call => ({ toolName: 'write', input: { path, content: 'hi' } });

const anEditOf = (input: string, ...paths: string[]): Call => ({
  toolName: 'edit',
  input: paths.length === 1 ? { input, path: paths[0], paths } : { input, paths },
});

const anEdit = (...paths: string[]): Call => anEditOf('', ...paths);

const refused = (event: Call, session: Session): boolean => handler()(event, session) !== undefined;

const reasonFor = (event: Call, session: Session): string =>
  (handler()(event, session) as { reason?: string } | undefined)?.reason ?? '';

const { main, linked } = repository();
const outside = join(mkdtempSync(join(tmpdir(), 'not-a-repository-')), 'notes.md');

describe('an edit or a write in a subagent', () => {
  const mainCases: [what: string, call: Call, cwd: string, named: string][] = [
    ['a relative write in the main worktree', aWrite('notes.txt'), main, join(main, 'notes.txt')],
    [
      'a relative write of a file not yet on disk',
      aWrite('plan/beats.md'),
      main,
      join(main, 'plan/beats.md'),
    ],
    ['an edit naming a main-worktree file', anEdit('notes.txt'), main, join(main, 'notes.txt')],
    [
      'an absolute main-worktree path named from the linked worktree',
      aWrite(join(main, 'notes.txt')),
      linked,
      join(main, 'notes.txt'),
    ],
  ];

  for (const [what, event, cwd] of mainCases) {
    it(`refuses ${what}`, () => {
      assert.equal(refused(event, { cwd, agent: subagent }), true);
    });
  }

  for (const [what, event, cwd, named] of mainCases) {
    it(`names the path and says absolute for ${what}`, () => {
      const reason = reasonFor(event, { cwd, agent: subagent });
      assert.ok(reason.includes(named));
      assert.ok(reason.includes('absolute'));
    });
  }

  it('names each refused path when a call carries several', () => {
    const reason = reasonFor(anEdit('notes.txt', 'ignored/notes.md'), {
      cwd: main,
      agent: subagent,
    });
    assert.ok(reason.includes(join(main, 'notes.txt')));
    assert.ok(!reason.includes(join(main, 'ignored/notes.md')));
  });

  it('refuses an edit whose move destination lands in the main worktree', () => {
    const file = join(linked, 'notes.txt');
    const event = anEditOf(`[${file}#ABCD]\nMV notes.txt`, file);
    assert.ok(reasonFor(event, { cwd: main, agent: subagent }).includes(join(main, 'notes.txt')));
  });

  it('reads a quoted move destination', () => {
    const file = join(linked, 'notes.txt');
    const event = anEditOf(`[${file}#ABCD]\nMV "plan/beats.md"`, file);
    assert.ok(
      reasonFor(event, { cwd: main, agent: subagent }).includes(join(main, 'plan/beats.md')),
    );
  });

  it('passes an edit whose move destination is in the linked worktree', () => {
    const file = join(linked, 'notes.txt');
    const event = anEditOf(`[${file}#ABCD]\nMV ${join(linked, 'moved.txt')}`, file);
    assert.equal(refused(event, { cwd: main, agent: subagent }), false);
  });

  for (const [what, indent] of [
    ['a space', ' '],
    ['a tab', '\t'],
  ] as const) {
    it(`refuses a move destination led by ${what}`, () => {
      const file = join(linked, 'notes.txt');
      const event = anEditOf(`[${file}#ABCD]\n${indent}MV notes.txt`, file);
      assert.ok(reasonFor(event, { cwd: main, agent: subagent }).includes(join(main, 'notes.txt')));
    });
  }

  for (const line of ['MV:notes.txt', 'MV: notes.txt']) {
    it(`refuses a move written ${line}`, () => {
      const file = join(linked, 'notes.txt');
      const event = anEditOf(`[${file}#ABCD]\n${line}`, file);
      assert.ok(reasonFor(event, { cwd: main, agent: subagent }).includes(join(main, 'notes.txt')));
    });
  }

  it('reads a single-quoted move destination', () => {
    const file = join(linked, 'notes.txt');
    const event = anEditOf(`[${file}#ABCD]\nMV '${join(linked, 'notes.txt')}'`, file);
    assert.equal(refused(event, { cwd: main, agent: subagent }), false);
  });

  it('refuses a file:// path in the main worktree', () => {
    assert.equal(
      refused(aWrite(`file://${join(main, 'notes.txt')}`), { cwd: main, agent: subagent }),
      true,
    );
  });

  it('unwraps a path pasted as a read header before checking it', () => {
    const reason = reasonFor(aWrite(`[${join(main, 'notes.txt')}#AB12]`), {
      cwd: main,
      agent: subagent,
    });
    assert.ok(reason.includes(join(main, 'notes.txt')));
    assert.ok(!reason.includes('#AB12'));
  });

  it('passes a read header for the linked worktree', () => {
    assert.equal(
      refused(aWrite(`[${join(linked, 'notes.txt')}#AB12]`), { cwd: main, agent: subagent }),
      false,
    );
  });

  for (const [what, event, cwd] of mainCases) {
    it(`passes ${what} from the main session`, () => {
      assert.equal(refused(event, { cwd, agent: mainSession }), false);
    });
  }

  for (const [what, event, cwd] of [
    ['a write in the linked worktree', aWrite('notes.txt'), linked],
    ['an ignored file in the main worktree', aWrite('ignored/notes.md'), main],
    [
      'an ignored file named absolutely from the linked worktree',
      aWrite(join(main, 'ignored/notes.md')),
      linked,
    ],
    ['a path outside any repository', aWrite(outside), main],
    ['an internal URL', aWrite('local://notes.md'), main],
  ] as [string, Call, string][]) {
    it(`passes ${what}`, () => {
      assert.equal(refused(event, { cwd, agent: subagent }), false);
    });
  }

  it('passes a call that writes no file', () => {
    assert.equal(
      refused({ toolName: 'read', input: { path: 'notes.txt' } }, { cwd: main, agent: subagent }),
      false,
    );
  });
});

const aShellWrite = (command: string, cwd: string): Call => ({
  toolName: 'bash',
  input: { command, cwd },
});

describe('a shell write in a subagent', () => {
  const writesIntoTheMainWorktree: [what: string, command: string][] = [
    ['a redirect', 'echo hi > notes.txt'],
    ['an append', 'echo hi >> notes.txt'],
    ['tee', 'tee notes.txt'],
    ['tee -a', 'echo hi | tee -a notes.txt'],
    ['a heredoc', "cat > notes.txt <<'EOF'\nhi\nEOF"],
    ['&>', 'echo hi &> notes.txt'],
    ['&>>', 'echo hi &>> notes.txt'],
    ['>|', 'echo hi >| notes.txt'],
    ['2>', 'echo hi 2> notes.txt'],
  ];

  for (const [what, command] of writesIntoTheMainWorktree) {
    it(`refuses ${what} into the main worktree`, () => {
      assert.equal(refused(aShellWrite(command, main), { cwd: main, agent: subagent }), true);
    });
  }

  for (const [what, command] of writesIntoTheMainWorktree) {
    it(`names the main-worktree path for ${what}`, () => {
      assert.ok(
        reasonFor(aShellWrite(command, main), { cwd: main, agent: subagent }).includes(
          join(main, 'notes.txt'),
        ),
      );
    });
  }

  for (const [what, command] of writesIntoTheMainWorktree) {
    it(`passes ${what} into the linked worktree`, () => {
      assert.equal(refused(aShellWrite(command, linked), { cwd: linked, agent: subagent }), false);
    });
  }

  it('refuses the file >& writes when the word after it is no descriptor', () => {
    assert.ok(
      reasonFor(aShellWrite('echo hi >&out.txt', main), { cwd: main, agent: subagent }).includes(
        join(main, 'out.txt'),
      ),
    );
  });

  it('refuses a >& whose word is more than a descriptor', () => {
    assert.ok(
      reasonFor(aShellWrite('echo hi >& 2notes.txt', main), { cwd: main, agent: subagent }).includes(
        join(main, '2notes.txt'),
      ),
    );
  });

  it('passes a target in an ignored path', () => {
    assert.equal(
      refused(aShellWrite('echo hi > ignored/notes.md', main), { cwd: main, agent: subagent }),
      false,
    );
  });

  for (const [what, command] of [
    ['a file-descriptor copy', 'git status 2>&1'],
    ['a file-descriptor copy written with a space', 'echo hi >& 2'],
    ['a process substitution', 'tee >(cat) < a'],
    ['a write of /dev/null', './do check > /dev/null'],
  ] as const) {
    it(`passes ${what}, which writes no file`, () => {
      assert.equal(refused(aShellWrite(command, main), { cwd: main, agent: subagent }), false);
    });
  }

  for (const [, command] of writesIntoTheMainWorktree) {
    it(`passes ${command} from the main session`, () => {
      assert.equal(refused(aShellWrite(command, main), { cwd: main, agent: mainSession }), false);
    });
  }

  for (const [what, command] of [
    ['a variable', 'echo hi > "$TMPDIR/out.txt"'],
    ['a command substitution', './do check > "$(mktemp)"'],
    ['a backtick', 'echo hi > "`mktemp`"'],
    ['a tee file with a command substitution', 'echo hi | tee "$(mktemp)"'],
  ] as const) {
    it(`passes a target holding ${what}, which it cannot resolve`, () => {
      assert.equal(refused(aShellWrite(command, main), { cwd: main, agent: subagent }), false);
    });
  }

  const bodies = ['> a quoted line', 'echo hi > out.txt', 'the probe -> the ADR'];
  const aHeredoc = (target: string, body: string): string =>
    `cat > ${target} <<'EOF'\n${body}\nEOF`;

  for (const body of bodies) {
    it(`reads no target from the body line ${body} of a heredoc`, () => {
      const command = aHeredoc(join(linked, 'notes.md'), body);
      assert.equal(refused(aShellWrite(command, main), { cwd: main, agent: subagent }), false);
    });
  }

  it('refuses a heredoc whose own target is in the main worktree', () => {
    const command = aHeredoc('notes.txt', '> a quoted line');
    assert.ok(
      reasonFor(aShellWrite(command, main), { cwd: main, agent: subagent }).includes(
        join(main, 'notes.txt'),
      ),
    );
  });

  it('ends a <<- body at its tab-indented delimiter', () => {
    const command = `cat > ${join(linked, 'notes.md')} <<-'EOF'\n\tEOF\necho hi > notes.txt`;
    assert.ok(
      reasonFor(aShellWrite(command, main), { cwd: main, agent: subagent }).includes(
        join(main, 'notes.txt'),
      ),
    );
  });

  for (const [what, command] of [
    ['a tee on the next line', 'echo hi\ntee notes.txt'],
    [
      'a tee on the line after a heredoc ends',
      `cat > ${join(linked, 'notes.md')} <<'EOF'\nbody\nEOF\ntee notes.txt`,
    ],
  ] as const) {
    it(`refuses ${what}, which a newline does not end`, () => {
      assert.ok(
        reasonFor(aShellWrite(command, main), { cwd: main, agent: subagent }).includes(
          join(main, 'notes.txt'),
        ),
      );
    });
  }
});
