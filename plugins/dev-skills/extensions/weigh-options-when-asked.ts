import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Message = { role?: string; content?: unknown };
type Context = { agent?: { kind?: string } };
export type ContextResult = { messages: Message[] } | undefined;
export type Extension = {
  on(event: 'before_agent_start', handler: (event: { prompt?: unknown }, context: Context) => void): void;
  on(event: 'context', handler: (event: { messages: Message[] }, context: Context) => ContextResult): void;
};

const REMINDERS = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
/* shortcut: a judgement asked in other words ("thoughts on X?", "A or B?") is not caught; widen the pattern once a session is seen to recommend on such a question without the skill. */
const ASKS_FOR_A_JUDGEMENT =
  /\b(do you think|what do you think|should (we|i)|which (one |option )?(is|would be|do you) |(is|would) it (be )?(worth|better)|would you (recommend|go|pick|choose)|do you recommend|what would you)/i;

export default function weighOptionsWhenAsked(pi: Extension): void {
  const skill = readFileSync(join(import.meta.dirname, '..', 'skills', 'weighing-options', 'SKILL.md'), 'utf8');
  const note = {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `<system-reminder>The builder's latest message asks for a judgement. Answer it by the steps of the weighing-options skill, below.\n\n${skill}</system-reminder>`,
      },
    ],
  };
  let asked = false;
  const main = (context: Context): boolean => context.agent?.kind !== 'sub';

  pi.on('before_agent_start', (event, context) => {
    if (main(context))
      asked = typeof event.prompt === 'string' && ASKS_FOR_A_JUDGEMENT.test(event.prompt.replace(REMINDERS, ''));
  });

  pi.on('context', (event, context) => (main(context) && asked ? { messages: [...event.messages, note] } : undefined));
}
