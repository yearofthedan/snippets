type Usage = {
  input?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

type Message = {
  usage?: Usage;
};

export type Context = {
  agent?: { kind?: string };
  ui?: { notify?: (text: string, level: string) => void };
  abort?: () => void;
};

export type Extension = {
  on(event: 'assistant_message', handler: (event: { message: Message }, context: Context) => void): void;
};

const MIN_PROMPT_TOKENS = 40_000;
const REWRITE_SHARE = 0.5;
const WARN_AT = 2;
const ABORT_AT = 3;

/* shortcut: main-session turns only, so a subagent's own rewrites are unseen; watch the session tree when subagents run long. */

export const freshShare = (usage: Usage): { share: number; prompt: number } => {
  const prompt = (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
  const fresh = (usage.input ?? 0) + (usage.cacheWrite ?? 0);
  return { share: prompt === 0 ? 0 : fresh / prompt, prompt };
};

export default function cacheGuard(pi: Extension): void {
  let rewrites = 0;
  pi.on('assistant_message', (event, context) => {
    if (context.agent?.kind !== 'main') return;
    const usage = event.message.usage;
    if (usage === undefined) return;
    const { share, prompt } = freshShare(usage);
    rewrites = prompt >= MIN_PROMPT_TOKENS && share >= REWRITE_SHARE ? rewrites + 1 : 0;
    if (rewrites < WARN_AT) return;
    const line = `cache-guard: ${Math.round(share * 100)}% of a ${prompt.toLocaleString()}-token prompt came back as fresh tokens, ${rewrites} turns running.`;
    const stop = rewrites >= ABORT_AT ? ' Stopping the run — disable with disabledExtensions: [extension-module:cache-guard].' : '';
    context.ui?.notify?.(`${line}${stop}`, 'warning');
    if (rewrites >= ABORT_AT) context.abort?.();
  });
}
