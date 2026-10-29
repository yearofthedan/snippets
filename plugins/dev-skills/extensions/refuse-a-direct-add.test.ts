import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import refuseADirectAdd, { type Extension } from './refuse-a-direct-add.ts';

type Handler = (
  event: { toolName: string; input: Record<string, unknown> },
  context: { cwd: string },
) => unknown;

const handler = (): Handler => {
  let registered: Handler | undefined;
  const pi: Extension = {
    on: (_event, next) => {
      registered = next as Handler;
    },
  };
  refuseADirectAdd(pi);
  if (registered === undefined) throw new Error('the extension registered no handler');
  return registered;
};

const executable = (path: string): void => {
  writeFileSync(path, '#!/bin/sh\n');
  chmodSync(path, 0o755);
};

const repository = (dirty = false, tooling = true, pnpm = true): string => {
  const dir = mkdtempSync(join(tmpdir(), 'refuse-a-direct-add-'));
  execFileSync('git', ['init', '-q', dir]);
  writeFileSync(join(dir, 'package.json'), '{}\n');
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', [
    '-C',
    dir,
    '-c',
    'user.email=t@example.com',
    '-c',
    'user.name=t',
    'commit',
    '-qm',
    'base',
  ]);
  if (tooling) {
    executable(join(dir, 'do'));
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    executable(join(dir, 'scripts/add'));
  }
  if (pnpm) writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
  if (dirty) writeFileSync(join(dir, 'package.json'), '{"devDependencies":{"lodash":"4.17.20"}}\n');
  return dir;
};

const refused = (command: string, sessionCwd: string, namedCwd?: string): boolean =>
  handler()(
    { toolName: 'bash', input: namedCwd === undefined ? { command } : { command, cwd: namedCwd } },
    { cwd: sessionCwd },
  ) !== undefined;

const reasonFor = (command: string, cwd: string): string =>
  (handler()({ toolName: 'bash', input: { command } }, { cwd }) as { reason?: string } | undefined)
    ?.reason ?? '';

const repositoryWithAnUntrackedManifest = (): string => {
  const dir = repository();
  mkdirSync(join(dir, 'packages/x'), { recursive: true });
  writeFileSync(join(dir, 'packages/x/package.json'), '{}\n');
  return dir;
};

const clean = repository();

describe('refuseADirectAdd', () => {
  it('refuses pnpm add', () => {
    assert.equal(refused('pnpm add lodash', clean), true);
  });

  it('refuses pnpm add whatever flags it carries', () => {
    assert.equal(refused('pnpm add -D lodash --ignore-scripts', clean), true);
  });

  it('refuses pnpm add behind an option that takes a value', () => {
    assert.equal(refused('pnpm -C packages/x add lodash', clean), true);
  });

  it('refuses pnpm add behind a filter', () => {
    assert.equal(refused('pnpm --filter web add lodash', clean), true);
  });

  it('refuses pnpm i naming a package', () => {
    assert.equal(refused('pnpm i lodash', clean), true);
  });

  it('refuses pnpm install naming a package', () => {
    assert.equal(refused('pnpm install lodash', clean), true);
  });

  it('refuses pnpm update', () => {
    assert.equal(refused('pnpm update', clean), true);
  });

  it('refuses pnpm dlx', () => {
    assert.equal(refused('pnpm dlx cowsay', clean), true);
  });

  it('refuses npx', () => {
    assert.equal(refused('npx cowsay', clean), true);
  });

  it('refuses another package manager', () => {
    assert.equal(refused('yarn add lodash', clean), true);
  });

  it('refuses a pnpm add behind another command', () => {
    assert.equal(refused('cd /tmp && pnpm add lodash', clean), true);
  });

  it('refuses pnpm install where the manifest differs from HEAD', () => {
    assert.equal(refused('pnpm install', repository(true)), true);
  });

  it('refuses pnpm install where a nested manifest is untracked', () => {
    assert.equal(refused('pnpm install', repositoryWithAnUntrackedManifest()), true);
  });

  it('refuses pnpm install where the directory the call names holds a change', () => {
    assert.equal(refused('pnpm install', clean, repository(true)), true);
  });

  it('passes pnpm install where the directory the call names matches HEAD', () => {
    assert.equal(refused('pnpm install', repository(true), clean), false);
  });

  it('passes pnpm install behind an option that takes a value', () => {
    assert.equal(refused('pnpm install -C packages/x', clean), false);
  });

  it('passes pnpm install behind a filter with --frozen-lockfile', () => {
    assert.equal(refused('pnpm install --filter web --frozen-lockfile', clean), false);
  });

  it('says a one-off run is not audited', () => {
    assert.ok(reasonFor('npx cowsay', clean).includes('not audited'));
  });

  it('passes pnpm install where the manifest matches HEAD', () => {
    assert.equal(refused('pnpm install', clean), false);
  });

  it('passes pnpm install --frozen-lockfile where the manifest differs from HEAD', () => {
    assert.equal(refused('pnpm install --frozen-lockfile', repository(true)), false);
  });

  it('passes pnpm test', () => {
    assert.equal(refused('pnpm test', clean), false);
  });

  it('passes ./do add', () => {
    assert.equal(refused('./do add -D lodash', clean), false);
  });

  it('passes git add', () => {
    assert.equal(refused('git add .', clean), false);
  });

  it('passes a command whose quoted argument mentions a pnpm add', () => {
    assert.equal(refused('git commit -m "stop: pnpm add blocked && npx blocked"', clean), false);
  });
});

describe('the ./do gate', () => {
  it('refuses where the repository has an executable ./do and scripts/add', () => {
    assert.equal(refused('pnpm add lodash', repository()), true);
  });

  it('stays silent in a repository without the tooling', () => {
    assert.equal(refused('pnpm add lodash', repository(false, false)), false);
  });

  it('stays silent where git cannot be asked about the directory', () => {
    assert.equal(refused('pnpm install', mkdtempSync(join(tmpdir(), 'not-a-repository-'))), false);
  });
});

describe('the pnpm wording', () => {
  it('names the pnpm shop where pnpm-lock.yaml is at the root', () => {
    assert.ok(reasonFor('yarn add lodash', repository(false, true, true)).includes('pnpm shop'));
  });

  it('drops the pnpm name where no pnpm-lock.yaml is at the root', () => {
    const reason = reasonFor('yarn add lodash', repository(false, true, false));
    assert.ok(!reason.includes('pnpm'));
    assert.ok(reason.includes('Adding a dependency goes through `./do add`'));
  });
});
