import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fitness, { type Extension } from '../integrations/omp/fitness.ts';

type Handler = Parameters<Extension['on']>[1];

const extension = (stdout: string, code = 0) => {
  const calls: { command: string; args: string[]; cwd?: string }[] = [];
  let handler: Handler | undefined;
  const pi: Extension = {
    on: (_event, h) => {
      handler = h;
    },
    exec: async (command, args, options) => {
      calls.push({ command, args, cwd: options?.cwd });
      return { stdout, stderr: '', code };
    },
  };
  fitness(pi, { FITNESS_BASE: 'main...' });
  return { calls, fire: (toolName: string, isError = false) => handler?.({ toolName, isError }, { cwd: '/repo' }) };
};

describe('omp extension', () => {
  it('diffs after an edit and returns the reporter output as additional context', async () => {
    const { calls, fire } = extension('{"additionalContext":"new: src/a.ts:1"}\n');
    assert.deepEqual(await fire('edit'), { additionalContext: 'new: src/a.ts:1' });
    assert.deepEqual(calls, [{ command: 'fitness', args: ['diff', 'main...', '--reporter', 'omp'], cwd: '/repo' }]);
  });

  it('skips tools that change no files, failed edits, empty deltas and broken runs', async () => {
    assert.equal(await extension('{}').fire('read'), undefined);
    assert.equal(await extension('{}').fire('write', true), undefined);
    assert.equal(await extension('').fire('write'), undefined);
    assert.equal(await extension('oops', 2).fire('ast_edit'), undefined);
  });
});
