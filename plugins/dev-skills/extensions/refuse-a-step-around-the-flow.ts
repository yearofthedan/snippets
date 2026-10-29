import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { callDirectory } from './lib/call-cwd.ts';
import { wordsPerCommand } from './lib/shell-words.ts';

type ToolCall = { toolName: string; input: Record<string, unknown> };
type Context = { cwd: string };
type ToolCallResult = { block: true; reason: string } | undefined;

export type Extension = {
  on(
    event: 'tool_call',
    handler: (event: ToolCall, context: Context) => ToolCallResult | Promise<ToolCallResult>,
  ): void;
};

const STORY_BRANCH = /^[0-9]+-/;

const GIT_OPTIONS_THAT_TAKE_A_VALUE: Record<string, true> = {
  '-c': true,
  '--config-env': true,
  '--git-dir': true,
  '--work-tree': true,
  '--namespace': true,
  '--exec-path': true,
};
const PUSH_OPTIONS_THAT_TAKE_A_VALUE: Record<string, true> = {
  '-o': true,
  '--push-option': true,
  '--repo': true,
  '--receive-pack': true,
  '--exec': true,
};
const FORCE_FLAGS: Record<string, true> = {
  '--force': true,
  '--force-with-lease': true,
};
const PUSHES_OTHER_REFS: Record<string, true> = {
  '--all': true,
  '--mirror': true,
  '--tags': true,
};
const REMOVES_A_REF: Record<string, true> = { '--delete': true, '-d': true };

const git = (cwd: string, args: string[]): { failed: boolean; out: string } => {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return { failed: result.status !== 0, out: result.stdout ?? '' };
};

const executable = (path: string): boolean => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const repositoryRoot = (cwd: string): string | undefined => {
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  const at = root.out.trim();
  return root.failed || at === '' ? undefined : at;
};

/* shortcut: the gate reads working-title's `./do` wrapper and `scripts/` task layout; read another layout if a repo with a different task runner adopts this extension. */
const hasDoTask = (root: string, task: string): boolean =>
  executable(join(root, 'do')) && executable(join(root, 'scripts', task));

const currentBranch = (cwd: string): string | undefined => {
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const name = branch.out.trim();
  return branch.failed || name === '' || name === 'HEAD' ? undefined : name;
};

const gitInvocation = (
  words: string[],
  cwd: string,
): { subcommand: string; args: string[]; cwd: string } | undefined => {
  let dir = cwd;
  let index = 1;
  while (index < words.length) {
    const word = words[index] ?? '';
    if (word === '-C') {
      const next = words[index + 1];
      if (next === undefined) return undefined;
      dir = resolve(dir, next);
      index += 2;
      continue;
    }
    if (Object.hasOwn(GIT_OPTIONS_THAT_TAKE_A_VALUE, word)) {
      index += 2;
      continue;
    }
    if (word.startsWith('-')) {
      index += 1;
      continue;
    }
    return { subcommand: word, args: words.slice(index + 1), cwd: dir };
  }
  return undefined;
};

const holdsUncommittedWork = (cwd: string, path: string): boolean => {
  const status = git(cwd, ['status', '--porcelain', '--', path]);
  if (status.failed) return true;
  return status.out
    .split('\n')
    .some((line) => line.trim() !== '' && !line.startsWith('??') && !line.startsWith('!!'));
};

const overwriteRefusal = (subcommand: string, args: string[], cwd: string): string | undefined => {
  const named: string[] = [];
  let worktree = subcommand === 'checkout';
  let staged = false;
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index] ?? '';
    if (word === '--') {
      named.push(...args.slice(index + 1));
      break;
    }
    if (word.startsWith('-')) {
      const bundle = word.startsWith('--') ? '' : word.slice(1);
      staged = staged || word === '--staged' || bundle.includes('S');
      worktree = worktree || word === '--worktree' || bundle.includes('W');
      continue;
    }
    named.push(word);
  }
  if (!worktree && staged) return undefined;
  const dirty = named.filter((path) => holdsUncommittedWork(cwd, path));
  if (dirty.length === 0) return undefined;
  const names = dirty.map((path) => `\`${path}\``).join(', ');
  return `${names} ${dirty.length === 1 ? 'has' : 'have'} uncommitted changes that \`git ${subcommand}\` would overwrite. Commit them first, or ask the builder.`;
};

const SWITCH_FLAGS: Record<string, true> = {
  '-b': true,
  '-B': true,
  '-c': true,
  '-C': true,
  '--orphan': true,
  '--detach': true,
};

const isMainWorktree = (cwd: string): boolean => {
  const paths = git(cwd, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir']);
  const [directory, common] = paths.out.trim().split('\n');
  return !paths.failed && directory !== undefined && directory === common;
};

const namesABranch = (cwd: string, word: string): boolean =>
  !git(cwd, ['rev-parse', '--verify', '-q', `${word}^{commit}`]).failed ||
  git(cwd, ['for-each-ref', '--count=1', `refs/remotes/*/${word}`]).out.trim() !== '';

const switchRefusal = (subcommand: string, args: string[], cwd: string): string | undefined => {
  if (args.includes('--help') || args.includes('-h')) return undefined;
  const words = args.includes('--') ? [] : args;
  const switches =
    subcommand === 'switch' ||
    words.some((word) => word === '-' || Object.hasOwn(SWITCH_FLAGS, word)) ||
    words.some((word) => !word.startsWith('-') && namesABranch(cwd, word));
  if (!switches) return undefined;
  if (!isMainWorktree(cwd)) return undefined;
  return 'This is the main worktree, which the builder and other sessions share: a branch switch here moves their work. Do the work in a worktree of its own: `git worktree add ../<branch> -b <branch> origin/main`.';
};

const gitReason = (
  subcommand: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
): string | undefined => {
  if (subcommand === 'switch') return switchRefusal(subcommand, args, cwd);
  if (subcommand === 'checkout') {
    return switchRefusal(subcommand, args, cwd) ?? overwriteRefusal(subcommand, args, cwd);
  }
  if (subcommand === 'restore') return overwriteRefusal(subcommand, args, cwd);
  if (subcommand === 'push') return pushRefusal(args, cwd, repositoryRoot(cwd));
  if (subcommand === 'commit') {
    const root = repositoryRoot(cwd);
    const hasCheck = root !== undefined && hasDoTask(root, 'check');
    const check = hasCheck ? '`./do check`' : 'the pre-commit hook';
    const skip = `A commit runs the pre-commit hook${hasCheck ? ', which runs `./do check`' : ''}: skipping it with \`--no-verify\` or \`-n\` commits what the checks have not passed. Fix what fails, or stop and ask the builder.`;
    return commitRefusal(args, skip) ?? hooksOffRefusal(env, check) ?? hooklessRefusal(cwd, check);
  }
  return undefined;
};

const targetOf = (refspec: string, current: string | undefined): string | undefined => {
  const [source = '', destination] = refspec.replace(/^\+/, '').split(':');
  const branch = (destination === undefined ? source : destination).replace(/^refs\/heads\//, '');
  if (branch === '') return undefined;
  return branch === 'HEAD' ? current : branch;
};

const pushRefusal = (args: string[], cwd: string, root: string | undefined): string | undefined => {
  if (root === undefined || !executable(join(root, 'do'))) return undefined;
  const positionals: string[] = [];
  let forced = false;
  let otherRefs = '';
  let removal = '';
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index] ?? '';
    if (word === '--') {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (Object.hasOwn(PUSH_OPTIONS_THAT_TAKE_A_VALUE, word)) {
      index += 1;
      continue;
    }
    const flag = word.split('=')[0] ?? '';
    if (Object.hasOwn(FORCE_FLAGS, flag)) forced = true;
    if (Object.hasOwn(PUSHES_OTHER_REFS, flag)) otherRefs = flag;
    if (Object.hasOwn(REMOVES_A_REF, flag)) removal = flag;
    const short = word.startsWith('-') && !word.startsWith('--') ? word.slice(1) : '';
    if (short !== '') {
      if (short.includes('f')) forced = true;
      if (short.includes('d')) removal = '-d';
    }
    if (word.startsWith(':')) removal = '--delete';
    if (word.startsWith('+')) forced = true;
    if (!word.startsWith('-')) positionals.push(word);
  }
  if (removal !== '') {
    return `\`${removal}\` removes a ref on the remote. A push adds to the story branch; a removal is the builder's call.`;
  }
  if (otherRefs !== '') {
    return `\`${otherRefs}\` moves refs beyond the story branch. A push carries the current branch alone.`;
  }
  if (forced) {
    return "A push goes without force: rewriting what the remote carries is the builder's call, not a step to slip in.";
  }
  const current = currentBranch(cwd);
  const asked = positionals.slice(1);
  const targets = asked.length === 0 ? [current] : asked.map((it) => targetOf(it, current));
  const elsewhere = targets.find((target) => target !== current);
  if (current !== undefined && STORY_BRANCH.test(current) && elsewhere === undefined)
    return undefined;
  const would = targets[0] === undefined ? 'no branch' : `\`${targets[0]}\``;
  return `A push goes only to the story branch, named \`<issue number>-…\`, without force. This one would push ${would}.`;
};

const COMMIT_OPTIONS_THAT_TAKE_A_VALUE: Record<string, true> = {
  '--message': true,
  '--file': true,
  '--reuse-message': true,
  '--reedit-message': true,
  '--template': true,
  '--author': true,
  '--date': true,
  '--cleanup': true,
  '--trailer': true,
  '--fixup': true,
  '--squash': true,
};
const COMMIT_SHORT_OPTIONS_THAT_TAKE_A_VALUE = 'mFCct';
const COMMIT_SHORT_OPTIONS_WITH_AN_ATTACHED_VALUE = 'uS';

/* shortcut: reads the flag alone; a hook path changed by `-c core.hooksPath` or `git config`
   passes, until an agent is seen to reach for one. */
const commitRefusal = (args: string[], skip: string): string | undefined => {
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index] ?? '';
    if (word === '--') return undefined;
    if (word.length >= '--no-veri'.length && '--no-verify'.startsWith(word)) return skip;
    if (Object.hasOwn(COMMIT_OPTIONS_THAT_TAKE_A_VALUE, word)) {
      index += 1;
      continue;
    }
    if (!word.startsWith('-') || word.startsWith('--')) continue;
    for (let at = 1; at < word.length; at += 1) {
      const flag = word[at] ?? '';
      if (flag === 'n') return skip;
      if (COMMIT_SHORT_OPTIONS_THAT_TAKE_A_VALUE.includes(flag)) {
        if (at === word.length - 1) index += 1;
        break;
      }
      if (COMMIT_SHORT_OPTIONS_WITH_AN_ATTACHED_VALUE.includes(flag)) break;
    }
  }
  return undefined;
};

const HOOKS_OFF = ['HUSKY', 'VP_GIT_HOOKS', 'VITE_GIT_HOOKS'];

const hooksOffRefusal = (env: Record<string, string>, check: string): string | undefined => {
  const off = HOOKS_OFF.find((name) => env[name] === '0');
  return off === undefined
    ? undefined
    : `\`${off}=0\` turns the pre-commit hook off, so the commit would land without ${check}. Commit without it.`;
};

const environmentOf = (words: string[]): { env: Record<string, string>; rest: string[] } => {
  const env: Record<string, string> = {};
  let start = 0;
  if (words[0]?.split('/').pop() === 'env') start = 1;
  for (; start < words.length; start += 1) {
    const assignment = /^([A-Za-z_]\w*)=(.*)$/s.exec(words[start] ?? '');
    if (assignment === null) break;
    env[assignment[1] ?? ''] = assignment[2] ?? '';
  }
  return { env, rest: words.slice(start) };
};

const hookPath = (cwd: string): string | undefined => {
  const hooks = git(cwd, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks']);
  const at = hooks.out.trim();
  return hooks.failed || at === '' ? undefined : join(at, 'pre-commit');
};

const mainWorktreeRoot = (cwd: string): string | undefined => {
  const list = git(cwd, ['worktree', 'list', '--porcelain']);
  if (list.failed) return undefined;
  const first = list.out.split('\n').find((line) => line.startsWith('worktree '));
  return first === undefined ? undefined : first.slice('worktree '.length);
};

const hooksAreSetUp = (cwd: string): boolean => {
  const configured = git(cwd, ['config', '--get', 'core.hooksPath']);
  if (!configured.failed && configured.out.trim() !== '') return true;
  const root = mainWorktreeRoot(cwd);
  const hook = root === undefined ? undefined : hookPath(root);
  return hook !== undefined && executable(hook);
};

const hooklessRefusal = (cwd: string, check: string): string | undefined => {
  const hook = hookPath(cwd);
  if (hook === undefined || executable(hook) || !hooksAreSetUp(cwd)) return undefined;
  const root = repositoryRoot(cwd);
  const how =
    root !== undefined && existsSync(join(root, 'pnpm-lock.yaml'))
      ? 'Run `pnpm install` in the worktree, which installs the hooks, then commit.'
      : "Install the repository's git hooks in the worktree, then commit.";
  return `This worktree has no pre-commit hook git can run (\`${hook}\`), so the commit would land without ${check}. ${how}`;
};

const notReadyYet =
  'A pull request is marked ready with `./do ready <pr>`, which checks the tree, CI on the head commit and the body first.';

export default function refuseAStepAroundTheFlow(pi: Extension): void {
  pi.on('tool_call', (event, context) => {
    if (event.toolName !== 'bash') return undefined;
    const command = event.input.command;
    if (typeof command !== 'string') return undefined;
    const callCwd = callDirectory(event.input, context.cwd);
    for (const found of wordsPerCommand(command)) {
      const { env, rest: words } = environmentOf(found);
      const program = words[0]?.split('/').pop() ?? '';
      if (program === 'gh') {
        const ready = words.indexOf('pr') >= 0 && words[words.indexOf('pr') + 1] === 'ready';
        const root = repositoryRoot(callCwd);
        if (ready && !words.includes('--undo') && root !== undefined && hasDoTask(root, 'ready'))
          return { block: true, reason: notReadyYet };
        continue;
      }
      if (program !== 'git') continue;
      const invocation = gitInvocation(words, callCwd);
      if (invocation === undefined) continue;
      const { subcommand, args, cwd } = invocation;
      const reason = gitReason(subcommand, args, cwd, env);
      if (reason !== undefined) return { block: true, reason };
    }
    return undefined;
  });
}
