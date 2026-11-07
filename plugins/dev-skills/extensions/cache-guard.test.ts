import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import cacheGuard, { type Context, type Extension, freshShare } from './cache-guard.ts';

type Usage = { input?: number; cacheRead?: number; cacheWrite?: number };
type Event = { message: { usage?: Usage } };
type Handler = (event: Event, context: Context) => void;

const handler = (): Handler => {
  let registered: Handler | undefined;
  const pi: Extension = {
    on: (_event, next) => {
      registered = next as Handler;
    },
  };
  cacheGuard(pi);
  if (registered === undefined) throw new Error('the extension registered no handler');
  return registered;
};

const context = () => {
  const seen: string[] = [];
  let aborts = 0;
  const stub: Context = {
    agent: { kind: 'main' },
    ui: { notify: (text) => seen.push(text) },
    abort: () => {
      aborts += 1;
    },
  };
  return { stub, seen, aborts: () => aborts };
};

const turn = (next: Handler, message: Event['message'], stub: Context): void => next({ message }, stub);

const rewritten = { usage: { input: 2, cacheRead: 17094, cacheWrite: 91555 } };
const healthy = { usage: { input: 110, cacheRead: 19921, cacheWrite: 0 } };

describe('the fresh share', () => {
  it('reads a re-written prompt as nearly all fresh', () => {
    const { share, prompt } = freshShare(rewritten.usage);
    assert.equal(prompt, 108651);
    assert.equal(Math.round(share * 100), 84);
  });

  it('reads a reused prompt as cached', () => {
    assert.ok(freshShare(healthy.usage).share < 0.01);
  });

  it('counts a provider that reports no cache writes on a miss', () => {
    assert.equal(freshShare({ input: 94000, cacheRead: 0, cacheWrite: 0 }).share, 1);
  });

  it('ignores a prompt under the floor', () => {
    assert.ok(freshShare({ input: 5000, cacheRead: 0, cacheWrite: 2000 }).prompt < 40_000);
  });
});

describe('the guard', () => {
  it('stays quiet through healthy turns', () => {
    const next = handler();
    const { stub, seen, aborts } = context();
    for (let index = 0; index < 4; index += 1) turn(next, healthy, stub);
    assert.equal(seen.length, 0);
    assert.equal(aborts(), 0);
  });

  it('warns on the second re-write and stops on the third', () => {
    const next = handler();
    const { stub, seen, aborts } = context();
    turn(next, rewritten, stub);
    assert.equal(seen.length, 0);
    turn(next, rewritten, stub);
    assert.equal(seen.length, 1);
    assert.equal(aborts(), 0);
    turn(next, rewritten, stub);
    assert.equal(seen.length, 2);
    assert.equal(aborts(), 1);
    assert.match(seen.at(-1) ?? '', /^cache-guard: 84% of a 108,651-token prompt came back as fresh tokens, 3 turns running\..*Stopping the run/);
  });

  it('forgets the run as soon as one turn is reused', () => {
    const next = handler();
    const { stub, seen, aborts } = context();
    turn(next, rewritten, stub);
    turn(next, rewritten, stub);
    const warned = seen.length;
    turn(next, healthy, stub);
    turn(next, rewritten, stub);
    turn(next, rewritten, stub);
    assert.equal(seen.length, warned + 1);
    assert.equal(aborts(), 0);
  });

  it('ignores a short prompt that is fully re-sent', () => {
    const next = handler();
    const { stub, seen, aborts } = context();
    for (let index = 0; index < 4; index += 1) turn(next, { usage: { input: 5000, cacheWrite: 2000 } }, stub);
    assert.equal(seen.length, 0);
    assert.equal(aborts(), 0);
  });

  it('stays out of a subagent', () => {
    const next = handler();
    const { stub, seen, aborts } = context();
    for (let index = 0; index < 3; index += 1) turn(next, rewritten, { ...stub, agent: { kind: 'sub' } });
    assert.equal(seen.length, 0);
    assert.equal(aborts(), 0);
  });

  it('ignores a turn with no usage', () => {
    const next = handler();
    const { stub, seen, aborts } = context();
    for (let index = 0; index < 6; index += 1) next({ message: {} }, stub);
    assert.equal(seen.length, 0);
    assert.equal(aborts(), 0);
  });
});
