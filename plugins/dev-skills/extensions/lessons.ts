import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

type Message = {
  role?: string;
  content?: unknown;
  steering?: boolean;
  stopReason?: string;
  errorMessage?: string;
};
export type Entry = { id?: string; type?: string; message?: Message };
type Context = {
  agent?: { kind?: string };
  sessionManager?: { getBranch?: () => Entry[] };
  ui?: { notify?: (text: string, level: string) => void };
};
type StopEvent = { stop_hook_active?: boolean };
export type StopResult = { continue: true; additionalContext: string } | undefined;
export type Extension = {
  on(event: 'session_start', handler: (event: unknown, context: Context) => void): void;
  on(event: 'session_stop', handler: (event: StopEvent, context: Context) => StopResult): void;
};

const INBOX_WAITING = 5;
const INBOX_OLDEST_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .filter((block) => block?.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join(' ')
      : '';

type Signal = { id: string; says: string };

const signalsIn = (entries: Entry[]): Signal[] =>
  entries.flatMap((entry) => {
    const message = entry.message;
    if (entry.id === undefined || message === undefined) return [];
    if (message.role === 'user' && message.steering === true) {
      const text = textOf(message.content).replace(/\s+/g, ' ').trim();
      return [{ id: entry.id, says: `steered: "${text.length > 120 ? `${text.slice(0, 117)}...` : text}"` }];
    }
    if (message.role === 'assistant' && message.errorMessage === 'Interrupted by user') {
      return [{ id: entry.id, says: 'interrupted you' }];
    }
    return [];
  });

export const inboxReminder = (inboxText: string, now: Date): string | undefined => {
  const dates = [...inboxText.matchAll(/^## (\d{4}-\d{2}-\d{2})/gm)].map(([, date]) => date);
  if (dates.length === 0) return undefined;
  const oldest = dates.toSorted()[0];
  const days = Math.floor((now.getTime() - Date.parse(oldest)) / DAY_MS);
  if (dates.length < INBOX_WAITING && days < INBOX_OLDEST_DAYS) return undefined;
  return `${dates.length} lesson incidents are waiting, the oldest from ${oldest}: run /skill:lessons to assess them.`;
};

export default function lessons(pi: Extension): void {
  const seen = new Set<string>();
  /* shortcut: a named profile (`omp --profile`) keeps its agent directory elsewhere, so its sessions read and nudge
     towards the default one; resolve the active directory once a profile is used for real work. */
  const agentDirectory = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.omp', 'agent');
  const inbox = join(agentDirectory, 'lessons', 'inbox.md');

  pi.on('session_start', (_event, context) => {
    if (context.agent?.kind === 'sub') return;
    for (const signal of signalsIn(context.sessionManager?.getBranch?.() ?? [])) seen.add(signal.id);
    if (!existsSync(inbox)) return;
    const reminder = inboxReminder(readFileSync(inbox, 'utf8'), new Date());
    if (reminder !== undefined) context.ui?.notify?.(reminder, 'info');
  });

  pi.on('session_stop', (event, context) => {
    if (event.stop_hook_active === true) return undefined;
    const entries = context.sessionManager?.getBranch?.() ?? [];
    const lastReply = entries.findLast((entry) => entry.message?.role === 'assistant');
    if (lastReply?.message?.stopReason === 'aborted') return undefined;
    const fresh = signalsIn(entries).filter((signal) => !seen.has(signal.id));
    if (fresh.length === 0) return undefined;
    for (const signal of fresh) seen.add(signal.id);
    return {
      continue: true,
      additionalContext: [
        'Since the last check, the builder:',
        ...fresh.map((signal) => `- ${signal.says}`),
        `If any of these corrected your work, capture an incident for each as skill://lessons says, appended to \`${inbox}\`.`,
        'If none did, finish without mentioning this check.',
      ].join('\n'),
    };
  });
}
