import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import cacheGuard, { type Context, type Extension, freshShare, sawCache } from './cache-guard.ts';

type Usage = { input?: number; cacheRead?: number; cacheWrite?: number };
type Event = { message: { usage?: Usage } };
type Handler = (event: Event, context: Context) => void;
type Sent = { payload: { customType: string; content: string }; options?: { deliverAs?: string; triggerTurn?: boolean } };

const start = (idle = true) => {
  let handler: Handler | undefined;
  const sent: Sent[] = [];
  let aborts = 0;
  const pi: Extension = {
    on: (_event, next) => {
      handler = next as Handler;
    },
    sendMessage: (payload, options) => {
      sent.push({ payload, options });
    },
  };
  cacheGuard(pi);
  if (handler === undefined) throw new Error('the extension registered no handler');
  const context: Context = {
    isIdle: () => idle,
    abort: () => {
      aborts += 1;
    },
    setTimeout: (fn) => {
      fn();
    },
  };
  return {
    turn: (usage: Usage) => handler?.({ message: { usage } }, context),
    sent,
    aborts: () => aborts,
  };
};

const rewritten = (): Usage => ({ input: 2, cacheRead: 17_280, cacheWrite: 90_720 });
const healthy = (): Usage => ({ input: 110, cacheRead: 19_921, cacheWrite: 0 });

describe('the fresh share', () => {
  it('reads a re-written prompt as nearly all fresh', () => {
    const { share, prompt } = freshShare(rewritten());
    assert.equal(prompt, 108_002);
    assert.equal(Math.round(share * 100), 84);
  });

  it('reads a reused prompt as cached', () => {
    assert.ok(freshShare(healthy()).share < 0.01);
  });

  it('counts a provider that reports no cache writes on a miss', () => {
    assert.equal(freshShare({ input: 94_000, cacheRead: 0, cacheWrite: 0 }).share, 1);
  });
});

describe('arming', () => {
  it('needs a turn that reported a cache read or a write', () => {
    assert.equal(sawCache({ input: 100_000, cacheRead: 0, cacheWrite: 0 }), false);
    assert.equal(sawCache({ input: 2, cacheRead: 100, cacheWrite: 0 }), true);
    assert.equal(sawCache({ input: 2, cacheRead: 0, cacheWrite: 100 }), true);
  });

  it('never stops a provider that reports no cache at all', () => {
    const guard = start();
    for (let index = 0; index < 6; index += 1) guard.turn({ input: 100_000, cacheRead: 0, cacheWrite: 0 });
    assert.equal(guard.aborts(), 0);
    assert.equal(guard.sent.length, 0);
  });

  it('does not count the turn that armed it', () => {
    const guard = start();
    guard.turn({ input: 2, cacheRead: 0, cacheWrite: 90_000 });
    guard.turn(rewritten());
    guard.turn(rewritten());
    assert.equal(guard.aborts(), 0);
  });
});

describe('the stop', () => {
  it('stops on the third consecutive rewrite and leaves one note', () => {
    const guard = start();
    guard.turn(healthy());
    guard.turn(rewritten());
    guard.turn(rewritten());
    assert.equal(guard.aborts(), 0);
    guard.turn(rewritten());
    assert.equal(guard.aborts(), 1);
    assert.equal(guard.sent.length, 1);
    assert.match(
      guard.sent[0]?.payload.content ?? '',
      /^cache-guard: stopped this run — 84% of a 108,002-token prompt came back as fresh tokens, 3 turns running\.$/,
    );
    assert.equal(guard.sent[0]?.payload.customType, 'cache-guard');
    assert.equal(guard.sent[0]?.options?.deliverAs, 'nextTurn');
    assert.equal(guard.sent[0]?.options?.triggerTurn, false);
  });

  it('clears the count when a turn is reused', () => {
    const guard = start();
    guard.turn(healthy());
    guard.turn(rewritten());
    guard.turn(rewritten());
    guard.turn(healthy());
    guard.turn(rewritten());
    guard.turn(rewritten());
    assert.equal(guard.aborts(), 0);
  });

  it('leaves no note when the session never goes idle', () => {
    const guard = start(false);
    guard.turn(healthy());
    guard.turn(rewritten());
    guard.turn(rewritten());
    guard.turn(rewritten());
    assert.equal(guard.aborts(), 1);
    assert.equal(guard.sent.length, 0);
  });
});
