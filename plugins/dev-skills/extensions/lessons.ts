import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Message = { role?: string; content?: unknown };
type Context = {
  agent?: { kind?: string };
  ui?: { notify?: (text: string, level: string) => void };
};
export type ContextResult = { messages: Message[] } | undefined;
export type Extension = {
  on(event: 'session_start', handler: (event: unknown, context: Context) => void): void;
  on(event: 'context', handler: (event: { messages: Message[] }, context: Context) => ContextResult): void;
};

const INBOX_WAITING = 5;
const INBOX_OLDEST_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const inboxReminder = (inboxText: string, now: Date): string | undefined => {
  const dates = [...inboxText.matchAll(/^## (\d{4}-\d{2}-\d{2})/gm)].map(([, date]) => date);
  if (dates.length === 0) return undefined;
  const oldest = dates.toSorted()[0];
  const days = Math.floor((now.getTime() - Date.parse(oldest)) / DAY_MS);
  if (dates.length < INBOX_WAITING && days < INBOX_OLDEST_DAYS) return undefined;
  return `${dates.length} lesson incidents are waiting, the oldest from ${oldest}: run /skill:lessons to assess them.`;
};

export default function lessons(pi: Extension): void {
  /* shortcut: a named profile (`omp --profile`) keeps its agent directory elsewhere, so its sessions read and point
     at the default one; resolve the active directory once a profile is used for real work. */
  const agentDirectory = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.omp', 'agent');
  const inbox = join(agentDirectory, 'lessons', 'inbox.md');
  const note = {
    type: 'text',
    text: `If this message corrects or contradicts your earlier work, capture an incident in \`${inbox}\` as skill://lessons says before you reply.`,
  };

  pi.on('session_start', (_event, context) => {
    if (context.agent?.kind === 'sub' || !existsSync(inbox)) return;
    const reminder = inboxReminder(readFileSync(inbox, 'utf8'), new Date());
    if (reminder !== undefined) context.ui?.notify?.(reminder, 'info');
  });

  pi.on('context', (event, context) => {
    if (context.agent?.kind === 'sub') return undefined;
    const at = event.messages.findLastIndex((message) => message.role === 'user');
    if (at === -1) return undefined;
    const latest = event.messages[at];
    const content = typeof latest.content === 'string' ? [{ type: 'text', text: latest.content }] : latest.content;
    if (!Array.isArray(content)) return undefined;
    return { messages: event.messages.with(at, { ...latest, content: [...content, note] }) };
  });
}
