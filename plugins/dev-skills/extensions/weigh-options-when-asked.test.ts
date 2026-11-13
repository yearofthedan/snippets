import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import weighOptionsWhenAsked, { type ContextResult, type Extension, type Message } from './weigh-options-when-asked.ts';

type Handler = (event: unknown, context: { agent: { kind: string } }) => unknown;

const session = (kind = 'main') => {
  const handlers = new Map<string, Handler>();
  const recorder = { on: (event: string, handler: Handler) => handlers.set(event, handler) };
  /* shortcut: the recorder stands in for OMP's overloaded `on`, which one plain function cannot satisfy for TypeScript; type each event's handler once a fourth extension needs a shared fake. */
  weighOptionsWhenAsked(recorder as unknown as Extension);
  const context = { agent: { kind } };
  const messages: Message[] = [{ role: 'user', content: [{ type: 'text', text: 'the message' }] }];
  return {
    builder: (prompt: string) => handlers.get('before_agent_start')?.({ prompt }, context),
    request: () => handlers.get('context')?.({ messages }, context) as ContextResult,
    messages,
  };
};

const injectsTheSkill = (prompt: string): boolean => {
  const s = session();
  s.builder(prompt);
  return /<system-reminder>[\s\S]*# Weighing options[\s\S]*<\/system-reminder>/.test(JSON.stringify(s.request()?.messages.at(-1)));
};

describe('weighOptionsWhenAsked', () => {
  it('puts the skill text after the request when the builder asks for a judgement', () => {
    for (const prompt of [
      'do you think the aria-current checks should be a custom expectation?',
      'should we split the file?',
      'which is better, a helper or a matcher?',
      'is it worth a scenario?',
      'what would you do here?',
    ])
      assert.equal(injectsTheSkill(prompt), true, prompt);
  });

  it('stays out of a message that asks for a fact or gives an instruction', () => {
    for (const prompt of ['what does the weighing options description say?', 'run the tests', 'why did it stop?', "let's try it"])
      assert.equal(injectsTheSkill(prompt), false, prompt);
  });

  it('leaves what came before byte-identical for the cache', () => {
    const s = session();
    s.builder('should we keep it?');
    assert.deepEqual(s.request()?.messages.slice(0, s.messages.length), s.messages);
  });

  it('keeps the skill on every request of the turn and drops it on the next message', () => {
    const s = session();
    s.builder('should we keep it?');
    assert.notEqual(s.request(), undefined);
    assert.notEqual(s.request(), undefined);
    s.builder('go ahead');
    assert.equal(s.request(), undefined);
  });

  it('reads past a reminder appended to the message', () => {
    assert.equal(injectsTheSkill('run it\n<system-reminder>should we capture this?</system-reminder>'), false);
  });

  it('leaves a subagent alone', () => {
    const s = session('sub');
    s.builder('should we keep it?');
    assert.equal(s.request(), undefined);
  });
});
