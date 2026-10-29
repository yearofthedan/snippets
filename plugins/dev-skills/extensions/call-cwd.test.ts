import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveCallCwd } from './lib/call-cwd.ts';

describe('resolveCallCwd', () => {
  const cases: [string, string][] = [
    ['~/notes', join(homedir(), 'notes')],
    ['~', homedir()],
    ['~someone', join(homedir(), 'someone')],
    ['@/tmp/elsewhere', '/tmp/elsewhere'],
    ['@~/notes', join(homedir(), 'notes')],
    ['file:///tmp/elsewhere', '/tmp/elsewhere'],
    ['FILE:///tmp/elsewhere', '/tmp/elsewhere'],
    ['file://host/tmp/notes', '/session/file:/host/tmp/notes'],
    [':/tmp/elsewhere', '/tmp/elsewhere'],
    ['/tmp/a\u00A0b', '/tmp/a b'],
    ['/tmp/elsewhere', '/tmp/elsewhere'],
    ['plan', '/session/plan'],
    ['/', '/session'],
    ['@my-file.txt', '/session/@my-file.txt'],
    ['@~someone', '/session/@~someone'],
    [':plan', '/session/:plan'],
  ];

  for (const [named, wanted] of cases) {
    it(`reads a call naming ${named} as ${wanted}`, () => {
      assert.equal(resolveCallCwd(named, '/session'), wanted);
    });
  }
});
