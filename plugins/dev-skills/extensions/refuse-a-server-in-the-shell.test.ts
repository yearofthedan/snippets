import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import refuseAServerInTheShell, { type Extension } from './refuse-a-server-in-the-shell.ts';

type Handler = (event: { toolName: string; input: Record<string, unknown> }) => unknown;

const handler = (): Handler => {
  let registered: Handler | undefined;
  const pi: Extension = {
    on: (_event, next) => {
      registered = next as Handler;
    },
  };
  refuseAServerInTheShell(pi);
  if (registered === undefined) throw new Error('the extension registered no handler');
  return registered;
};

const refused = (input: Record<string, unknown>, toolName = 'bash'): boolean =>
  handler()({ toolName, input }) !== undefined;

const preview = './do preview --port 4180 --strictPort';

describe('refuseAServerInTheShell', () => {
  it('refuses a call that waits for readiness with no name', () => {
    assert.equal(refused({ command: preview, ready: { port: 4180, timeout: 90 }, name: null }), true);
  });

  it('refuses a pty call that never times out with no name', () => {
    assert.equal(refused({ command: preview, pty: true, timeout: 0 }), true);
  });

  it('passes the same call once it is named a service', () => {
    assert.equal(refused({ command: preview, pty: true, ready: { port: 4180 }, timeout: 0, name: 'preview' }), false);
  });

  it('passes a call with no deadline outside a pty, which moves to the background', () => {
    assert.equal(refused({ command: './do check', timeout: 0 }), false);
  });

  it('passes an interactive pty call that times out', () => {
    assert.equal(refused({ command: 'git add -p', pty: true, timeout: 120 }), false);
  });

  it('passes a command that only names a server', () => {
    assert.equal(refused({ command: 'grep -rn preview scripts' }), false);
  });

  it('leaves tools other than bash alone', () => {
    assert.equal(refused({ ready: { port: 4180 } }, 'eval'), false);
  });
});
