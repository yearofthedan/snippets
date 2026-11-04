import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import refuseAnEditBeforeAnAnswer, { type Extension } from './refuse-an-edit-before-an-answer.ts';

type Handler = (event: unknown, context: { agent: { kind: string } }) => unknown;

const session = (kind = 'main') => {
  const handlers = new Map<string, Handler>();
  const recorder = { on: (event: string, handler: Handler) => handlers.set(event, handler) };
  /* shortcut: the recorder stands in for OMP's overloaded `on`, which one plain function cannot satisfy for TypeScript; type each event's handler once a third extension needs a shared fake. */
  refuseAnEditBeforeAnAnswer(recorder as unknown as Extension);
  const context = { agent: { kind } };
  return {
    builder: (prompt: string) => handlers.get('before_agent_start')?.({ prompt }, context),
    replies: (...content: unknown[]) => handlers.get('assistant_message')?.({ message: { content } }, context),
    refuses: (toolName: string, input: Record<string, unknown> = { path: 'src/a.ts' }) =>
      handlers.get('tool_call')?.({ toolName, input }, context) !== undefined,
  };
};

const text = (value: string) => ({ type: 'text', text: value });
const toolCall = { type: 'toolCall', name: 'edit' };

describe('refuseAnEditBeforeAnAnswer', () => {
  it('refuses an edit after a question, before any reply text', () => {
    const s = session();
    s.builder('is that correct?');
    assert.equal(s.refuses('edit'), true);
  });

  it('passes the edit once a reply holds text', () => {
    const s = session();
    s.builder('is that correct?');
    s.replies(text('No: it reads the wrong field.'), toolCall);
    assert.equal(s.refuses('edit'), false);
  });

  it('is not answered by a reply of tool calls or blank text', () => {
    const s = session();
    s.builder('is that correct?');
    s.replies(text('  '), toolCall);
    assert.equal(s.refuses('ast_edit'), true);
  });

  it('passes an edit after a message that asks nothing', () => {
    const s = session();
    s.builder('yep and yep');
    assert.equal(s.refuses('write'), false);
  });

  it('reads past a reminder appended to the message', () => {
    const s = session();
    s.builder('why did it stop?\n<system-reminder>Today: 2026-11-04.</system-reminder>');
    assert.equal(s.refuses('edit'), true);
  });

  it('clears when the next message asks nothing', () => {
    const s = session();
    s.builder('why did it stop?');
    s.builder('go ahead');
    assert.equal(s.refuses('edit'), false);
  });

  it('lets a reply written to a session URL through, but not an AST edit', () => {
    const s = session();
    s.builder('why did it stop?');
    assert.equal(s.refuses('write', { path: 'out://answer.md' }), false);
    assert.equal(s.refuses('write', { path: 'xd://ast_edit' }), true);
  });

  it('leaves a subagent alone', () => {
    const s = session('sub');
    s.builder('does the brief say where the test lands?');
    assert.equal(s.refuses('edit'), false);
  });
});
