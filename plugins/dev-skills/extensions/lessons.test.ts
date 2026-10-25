import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import lessons, { type ContextResult, type Extension, type Message, inboxReminder } from './lessons.ts';

type Handler = (event: { messages: Message[] }, context: { agent: { kind: string } }) => unknown;

const contextHandler = (kind = 'main') => {
  const handlers = new Map<string, Handler>();
  const recorder = { on: (event: string, handler: Handler) => handlers.set(event, handler) };
  /* shortcut: the recorder stands in for OMP's overloaded `on`, which one plain function cannot satisfy for TypeScript; type each event's handler once a second extension needs a shared fake. */
  lessons(recorder as unknown as Extension);
  return (messages: Message[]) => handlers.get('context')?.({ messages }, { agent: { kind } }) as ContextResult;
};

const text = (value: string) => [{ type: 'text', text: value }];
const notes = (message: Message | undefined) =>
  JSON.stringify(message?.content ?? '').match(/corrects or contradicts your earlier work/g)?.length ?? 0;

describe('the capture note', () => {
  it('rides on the builder’s latest message only, naming the inbox', () => {
    const messages = [
      { role: 'user', content: text('build it') },
      { role: 'assistant', content: text('built') },
      { role: 'user', content: text('no, use the existing parser') },
      { role: 'assistant', content: text('reading the parser') },
      { role: 'toolResult', content: text('parser.ts') },
    ];
    const result = contextHandler()(messages);
    assert.equal(notes(result?.messages[0]), 0);
    assert.equal(notes(result?.messages[2]), 1);
    assert.match(JSON.stringify(result?.messages[2]), /no, use the existing parser/);
    assert.match(JSON.stringify(result?.messages[2]), /lessons\/inbox\.md/);
    assert.deepEqual(result?.messages.slice(3), messages.slice(3));
  });

  it('leaves the conversation it was given unchanged', () => {
    const messages = [{ role: 'user', content: text('build it') }];
    const before = structuredClone(messages);
    contextHandler()(messages);
    assert.deepEqual(messages, before);
  });

  it('keeps a message written as a plain string', () => {
    const result = contextHandler()([{ role: 'user', content: 'build it' }]);
    assert.match(JSON.stringify(result?.messages[0]), /"text":"build it"/);
    assert.equal(notes(result?.messages[0]), 1);
  });

  it('stays out of a subagent’s conversation', () => {
    assert.equal(contextHandler('sub')([{ role: 'user', content: text('the brief') }]), undefined);
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
