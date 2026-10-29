import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/* shortcut: the Windows forms — a drive alias, a stray `:` before `\` or a drive letter,
   `\\?\` — are not read, since no session here runs on Windows; read them if one does. */
export const resolveCallCwd = (named: string, sessionCwd: string): string => {
  let at = /^:(?=[/~]|\.\.?[/\\])/.test(named) ? named.slice(1) : named;
  if (at.startsWith('@/') || at === '@~' || at.startsWith('@~/')) at = at.slice(1);
  at = at.replace(UNICODE_SPACES, ' ');
  if (at.toLowerCase().startsWith('file://')) {
    try {
      at = fileURLToPath(at);
    } catch {}
  }
  const home = homedir();
  const expanded =
    at === '~' || at.startsWith('~/') || at.startsWith('~\\')
      ? home + at.slice(1)
      : at.startsWith('~')
        ? join(home, at.slice(1))
        : at;
  return /^\/+$/.test(expanded) ? sessionCwd : resolve(sessionCwd, expanded);
};

export const callDirectory = (input: Record<string, unknown>, sessionCwd: string): string => {
  const named = input.cwd;
  return typeof named === 'string' && named !== '' ? resolveCallCwd(named, sessionCwd) : sessionCwd;
};
