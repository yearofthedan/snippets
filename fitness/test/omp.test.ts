import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fitness, { type Extension } from '../integrations/omp/fitness.ts';

type Handler = Parameters<Extension['on']>[1];

const extension = (stdout: string, code = 0, env: Record<string, string> = { FITNESS_BASE: 'main...' }) => {
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
  fitness(pi, env);
  return { calls, fire: (toolName: string, isError = false) => handler?.({ toolName, isError }, { cwd: '/repo' }) };
};

describe('omp extension', () => {
  it('diffs after an edit and returns the reporter output as additional context', async () => {
    const { calls, fire } = extension('{"additionalContext":"new: src/a.ts:1"}\n');
    assert.deepEqual(await fire('edit'), { additionalContext: 'new: src/a.ts:1' });
    assert.deepEqual(calls, [{ command: 'fitness', args: ['diff', 'main...', '--reporter', 'omp'], cwd: '/repo' }]);
  });

  it('runs a command with arguments, such as pnpm exec', async () => {
    const { calls, fire } = extension('', 0, { FITNESS_COMMAND: 'pnpm exec fitness' });
    await fire('write');
    assert.deepEqual(calls.map((call) => [call.command, call.args]), [['pnpm', ['exec', 'fitness', 'diff', 'HEAD', '--reporter', 'omp']]]);
  });

  it('passes a ruleset', async () => {
    const { calls, fire } = extension('', 0, { FITNESS_RULESET: 'edit' });
    await fire('edit');
    assert.deepEqual(calls[0].args, ['diff', 'HEAD', '--ruleset', 'edit', '--reporter', 'omp']);
  });

  it('skips tools that change no files, failed edits, empty deltas and broken runs', async () => {
    assert.equal(await extension('{}').fire('read'), undefined);
    assert.equal(await extension('{}').fire('write', true), undefined);
    assert.equal(await extension('').fire('write'), undefined);
    assert.equal(await extension('oops', 2).fire('ast_edit'), undefined);
  });
});
