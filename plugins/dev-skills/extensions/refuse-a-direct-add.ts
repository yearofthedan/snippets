import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { join } from 'node:path';
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

const addThroughTheTask =
  'Adding a dependency goes through `./do add`, which audits what the resolution brings in before anything is installed.';
const notAudited =
  'Running a package for one go is not audited. A tool worth having is a dependency added with `./do add`.';
const notPnpm = 'This repository is a pnpm shop: a dependency is added with `./do add`.';

const RESOLVES_SOMETHING_NEW: Record<string, true> = {
  add: true,
  i: true,
  install: true,
  update: true,
  up: true,
  dlx: true,
};
const ONE_OFF_RUNNERS: Record<string, true> = { npx: true, pnpx: true };
const OTHER_PACKAGE_MANAGERS: Record<string, true> = { npm: true, yarn: true, bun: true };
const OPTIONS_THAT_TAKE_A_VALUE: Record<string, true> = {
  '-C': true,
  '--dir': true,
  '-F': true,
  '--filter': true,
};

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

const manifestMatchesHead = (cwd: string): boolean => {
  const status = git(cwd, ['status', '--porcelain', '--', '*package.json']);
  return !status.failed && status.out.trim() === '';
};

const namesAPackage = (rest: string[], subcommand: string): boolean => {
  for (let index = 0; index < rest.length; index += 1) {
    const word = rest[index] ?? '';
    if (word === subcommand) continue;
    if (Object.hasOwn(OPTIONS_THAT_TAKE_A_VALUE, word)) {
      index += 1;
      continue;
    }
    if (!word.startsWith('-')) return true;
  }
  return false;
};

const refusal = (words: string[], cwd: string): string | undefined => {
  const root = repositoryRoot(cwd);
  if (root === undefined || !hasDoTask(root, 'add')) return undefined;
  const program = words[0]?.split('/').pop() ?? '';
  if (Object.hasOwn(ONE_OFF_RUNNERS, program)) return notAudited;
  if (Object.hasOwn(OTHER_PACKAGE_MANAGERS, program))
    return existsSync(join(root, 'pnpm-lock.yaml')) ? notPnpm : addThroughTheTask;
  if (program !== 'pnpm') return undefined;

  const rest = words.slice(1);
  const subcommand = rest.find((word) => Object.hasOwn(RESOLVES_SOMETHING_NEW, word));
  if (subcommand === undefined) return undefined;
  if (subcommand === 'dlx') return notAudited;

  if (subcommand === 'install' || subcommand === 'i') {
    if (rest.includes('--frozen-lockfile')) return undefined;
    if (!namesAPackage(rest, subcommand) && manifestMatchesHead(cwd)) return undefined;
  }

  return addThroughTheTask;
};

export default function refuseADirectAdd(pi: Extension): void {
  pi.on('tool_call', (event, context) => {
    if (event.toolName !== 'bash') return undefined;
    const command = event.input.command;
    if (typeof command !== 'string') return undefined;
    const callCwd = callDirectory(event.input, context.cwd);
    for (const words of wordsPerCommand(command)) {
      const reason = refusal(words, callCwd);
      if (reason !== undefined) return { block: true, reason };
    }
    return undefined;
  });
}
