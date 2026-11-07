type Usage = {
  input?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

type Message = {
  usage?: Usage;
};

export type Context = {
  isIdle?: () => boolean;
  abort?: () => void;
  setTimeout?: (fn: () => void, ms: number) => unknown;
};

export type Extension = {
  on(event: 'assistant_message', handler: (event: { message: Message }, context: Context) => void): void;
  sendMessage?: (
    payload: { customType: string; content: string; display?: boolean; attribution?: string },
    options?: { deliverAs?: string; triggerTurn?: boolean },
  ) => unknown;
};

const MIN_PROMPT_TOKENS = 40_000;
const REWRITE_SHARE = 0.5;
const STOP_AT = 3;
const IDLE_POLL_MS = 500;
const IDLE_TRIES = 40;

export const freshShare = (usage: Usage): { share: number; prompt: number } => {
  const prompt = (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
  const fresh = (usage.input ?? 0) + (usage.cacheWrite ?? 0);
  return { share: prompt === 0 ? 0 : fresh / prompt, prompt };
};

export const sawCache = (usage: Usage): boolean => (usage.cacheRead ?? 0) > 0 || (usage.cacheWrite ?? 0) > 0;

const leaveNote = (pi: Extension, context: Context, note: string): void => {
  const send = () => {
    pi.sendMessage?.(
      { customType: 'cache-guard', content: note, display: true, attribution: 'agent' },
      { deliverAs: 'nextTurn', triggerTurn: false },
    );
  };
  const wait = (tries: number) => {
    if (context.isIdle?.() === true) {
      send();
      return;
    }
    if (tries > 0) context.setTimeout?.(() => wait(tries - 1), IDLE_POLL_MS);
  };
  wait(IDLE_TRIES);
};

export default function cacheGuard(pi: Extension): void {
  let armed = false;
  let rewrites = 0;
  pi.on('assistant_message', (event, context) => {
    const usage = event.message.usage;
    if (usage === undefined) return;
    if (!armed) {
      armed = sawCache(usage);
      return;
    }
    const { share, prompt } = freshShare(usage);
    rewrites = prompt >= MIN_PROMPT_TOKENS && share >= REWRITE_SHARE ? rewrites + 1 : 0;
    if (rewrites < STOP_AT) return;
    rewrites = 0;
    context.abort?.();
    leaveNote(
      pi,
      context,
      `cache-guard: stopped this run — ${Math.round(share * 100)}% of a ${prompt.toLocaleString()}-token prompt came back as fresh tokens, ${STOP_AT} turns running.`,
    );
  });
}
