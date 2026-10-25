import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import lessons, { type Entry, type Extension, type StopResult, inboxReminder } from './lessons.ts';

type Session = { start: (entries: Entry[]) => void; stop: (entries: Entry[], active?: boolean) => StopResult };

type Handler = (event: { stop_hook_active?: boolean }, context: { sessionManager: { getBranch: () => Entry[] } }) => unknown;

const session = (): Session => {
  const handlers = new Map<string, Handler>();
  const recorder = { on: (event: string, handler: Handler) => handlers.set(event, handler) };
  /* shortcut: the recorder stands in for OMP's overloaded `on`, which one plain function cannot satisfy for TypeScript; type each event's handler once a second extension needs a shared fake. */
  lessons(recorder as unknown as Extension);
  const call = (event: string, entries: Entry[], active = false) =>
    handlers.get(event)?.({ stop_hook_active: active }, { sessionManager: { getBranch: () => entries } });
  return {
    start: (entries) => void call('session_start', entries),
    stop: (entries, active) => call('session_stop', entries, active) as StopResult,
  };
};

const prompt = (id: string, text: string): Entry => ({ id, type: 'message', message: { role: 'user', content: [{ type: 'text', text }] } });
const steer = (id: string, text: string): Entry => ({ id, type: 'message', message: { role: 'user', content: [{ type: 'text', text }], steering: true } });
const reply = (id: string): Entry => ({ id, type: 'message', message: { role: 'assistant', content: [], stopReason: 'stop' } });
const interrupted = (id: string): Entry => ({
  id,
  type: 'message',
  message: { role: 'assistant', content: [], stopReason: 'aborted', errorMessage: 'Interrupted by user' },
});

describe('the capture nudge', () => {
  it('names a steer from this session, and where to capture it', () => {
    const current = session();
    current.start([]);
    const result = current.stop([prompt('1', 'build it'), steer('2', 'no, use the existing parser'), reply('3')]);
    assert.equal(result?.continue, true);
    assert.match(result?.additionalContext ?? '', /steered: "no, use the existing parser"/);
    assert.match(result?.additionalContext ?? '', /lessons\/inbox\.md/);
  });

  it('says nothing when the builder only prompted', () => {
    const current = session();
    current.start([]);
    assert.equal(current.stop([prompt('1', 'build it'), reply('2')]), undefined);
  });

  it('nudges about a signal once', () => {
    const current = session();
    current.start([]);
    const entries = [prompt('1', 'build it'), steer('2', 'stop that'), reply('3')];
    assert.notEqual(current.stop(entries), undefined);
    assert.equal(current.stop([...entries, prompt('4', 'next'), reply('5')]), undefined);
  });

  it('leaves alone the signals a resumed session already held', () => {
    const current = session();
    const earlier = [prompt('1', 'build it'), steer('2', 'stop that'), reply('3')];
    current.start(earlier);
    assert.equal(current.stop([...earlier, prompt('4', 'next'), reply('5')]), undefined);
  });

  it('waits out an interrupt, then names it after the next reply', () => {
    const current = session();
    current.start([]);
    const stopped = [prompt('1', 'build it'), interrupted('2')];
    assert.equal(current.stop(stopped), undefined);
    const result = current.stop([...stopped, prompt('3', 'do this instead'), reply('4')]);
    assert.match(result?.additionalContext ?? '', /interrupted you/);
  });

  it('does not nudge the continuation it asked for', () => {
    const current = session();
    current.start([]);
    assert.equal(current.stop([steer('1', 'stop that'), reply('2')], true), undefined);
  });
});

describe('the assess reminder', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  const inbox = (...dates: string[]) => dates.map((date) => `## ${date} · working-title · #1\n- what happened\n`).join('\n');

  it('stays quiet below both thresholds', () => {
    assert.equal(inboxReminder(inbox('2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'), now), undefined);
    assert.equal(inboxReminder(inbox('2026-10-19'), now), undefined);
    assert.equal(inboxReminder('', now), undefined);
  });

  it('speaks at five incidents waiting', () => {
    assert.match(
      inboxReminder(inbox('2026-10-21', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'), now) ?? '',
      /^5 lesson incidents are waiting, the oldest from 2026-10-21/,
    );
  });

  it('speaks once the oldest incident is a week old', () => {
    assert.match(inboxReminder(inbox('2026-10-24', '2026-10-18'), now) ?? '', /the oldest from 2026-10-18/);
  });
});
