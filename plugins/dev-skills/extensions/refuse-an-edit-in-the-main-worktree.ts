import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveCallCwd, callDirectory } from './lib/call-cwd.ts';
import { UNRESOLVED, wordsPerCommand, writeTargetsPerCommand } from './lib/shell-words.ts';

type ToolCall = { toolName: string; input: Record<string, unknown> };
type Context = {
  cwd: string;
  agent?: { kind?: string };
};
type ToolCallResult = { block: true; reason: string } | undefined;

export type Extension = {
  on(
    event: 'tool_call',
    handler: (event: ToolCall, context: Context) => ToolCallResult | Promise<ToolCallResult>,
  ): void;
};

const URL_SCHEME = /^(?!file:\/\/)[a-z][a-z0-9+.-]*:\/\//i;

const git = (cwd: string, args: string[]): { failed: boolean; out: string } => {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return { failed: result.status !== 0, out: result.stdout ?? '' };
};

const isMainWorktree = (cwd: string): boolean => {
  const paths = git(cwd, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir']);
  const [directory, common] = paths.out.trim().split('\n');
  return !paths.failed && directory !== undefined && directory === common;
};

const nearestDirectory = (path: string): string => {
  let at = existsSync(path) && statSync(path).isDirectory() ? path : dirname(path);
  while (!existsSync(at)) {
    const parent = dirname(at);
    if (parent === at) return at;
    at = parent;
  }
  return at;
};

const ignoredByGit = (cwd: string, path: string): boolean =>
  !git(cwd, ['check-ignore', '-q', '--', path]).failed;

const landsInTheMainWorktree = (path: string): boolean => {
  const directory = nearestDirectory(path);
  return isMainWorktree(directory) && !ignoredByGit(directory, path);
};

const pathsOf = (input: Record<string, unknown>): string[] => {
  const { path, paths } = input;
  if (Array.isArray(paths) && paths.every((it) => typeof it === 'string')) return paths;
  return typeof path === 'string' ? [path] : [];
};

const moveDestinations = (input: Record<string, unknown>): string[] =>
  typeof input.input === 'string'
    ? [...input.input.matchAll(/^[ \t]*MV(?:[ \t]*:[ \t]*|[ \t]+)(\S.*?)[ \t]*$/gm)].map(
        ([, destination]) => destination.replace(/^(["'])(.*)\1$/, '$2'),
      )
    : [];

const unwrapped = (path: string): string => /^\[(.+?)(#[0-9A-Fa-f]{4})?\]$/.exec(path)?.[1] ?? path;

const teeFiles = (command: string): string[] =>
  wordsPerCommand(command)
    .filter((words) => words[0]?.split('/').pop() === 'tee')
    .flatMap((words) =>
      words.slice(1).filter((word) => !word.startsWith('-') && !UNRESOLVED.test(word)),
    );

/* shortcut: a `cd` inside the command is not followed, so a target written relative to a directory the command moves to is read against the call's own directory; follow `cd` once a session is seen to write one that way. */
const shellWriteTargets = (input: Record<string, unknown>): string[] => {
  const command = input.command;
  if (typeof command !== 'string') return [];
  return [...writeTargetsPerCommand(command).flat(), ...teeFiles(command)];
};

export default function refuseAnEditInTheMainWorktree(pi: Extension): void {
  pi.on('tool_call', (event, context) => {
    const edits = event.toolName === 'edit' || event.toolName === 'write';
    const shells = event.toolName === 'bash';
    if (!edits && !shells) return undefined;
    if (context.agent?.kind !== 'sub') return undefined;
    const cwd = callDirectory(event.input, context.cwd);
    const named = shells
      ? shellWriteTargets(event.input)
      : [...pathsOf(event.input), ...moveDestinations(event.input)];
    const refused = named
      .map(unwrapped)
      .filter((path) => !URL_SCHEME.test(path))
      .map((path) => resolveCallCwd(path, cwd))
      .filter((path) => !path.startsWith('/dev/'))
      .filter(landsInTheMainWorktree);
    if (refused.length === 0) return undefined;
    const names = refused.map((path) => `\`${path}\``).join(', ');
    return {
      block: true,
      reason: `${names} ${refused.length === 1 ? 'is' : 'are'} in the main worktree, which the builder and other sessions share. Give the path absolute, under the worktree your dispatch names.`,
    };
  });
}
