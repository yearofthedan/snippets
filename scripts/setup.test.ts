import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const setup = join(import.meta.dirname, 'setup');

const machine = ({ installed = [] as string[], marketplaces = [] as string[], outdated = [] as string[] } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'setup-'));
  writeFileSync(join(dir, 'list.json'), JSON.stringify({ npm: [], marketplace: installed.map((id) => ({ id, scope: 'user' })) }));
  writeFileSync(join(dir, 'marketplaces'), marketplaces.map((source) => `  name  ${source}\n`).join(''));
  writeFileSync(join(dir, 'dry-run'), outdated.map((line) => `[dry-run] Would upgrade ${line}\n`).join(''));
  writeFileSync(
    join(dir, 'omp'),
    `#!/bin/sh
echo "$*" >> "${dir}/calls"
case "$*" in
  "plugin list --json") cat "${dir}/list.json" ;;
  "plugin marketplace list") cat "${dir}/marketplaces" ;;
  "plugin upgrade --dry-run") cat "${dir}/dry-run" ;;
esac
`,
  );
  chmodSync(join(dir, 'omp'), 0o755);
  writeFileSync(join(dir, 'calls'), '');
  const run = spawnSync('/bin/sh', [setup], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
  return { ...run, calls: readFileSync(join(dir, 'calls'), 'utf8').split('\n').filter(Boolean) };
};

const both = ['ponytail@ponytail', 'dev-skills@snippets'];
const sources = ['DietrichGebert/ponytail', 'yearofthedan/snippets'];

describe('setup', () => {
  it('adds both marketplaces and installs both plugins on a fresh machine', () => {
    const { status, calls, stdout } = machine();
    assert.equal(status, 0);
    for (const call of [
      'plugin marketplace add DietrichGebert/ponytail',
      'plugin install ponytail@ponytail',
      'plugin marketplace add yearofthedan/snippets',
      'plugin install dev-skills@snippets',
    ])
      assert.ok(calls.includes(call), call);
    assert.equal(stdout.match(/Start a new OMP session/g)?.length, 1);
  });

  it('refreshes each catalog and upgrades only the plugin that is behind', () => {
    const { status, calls, stdout } = machine({
      installed: both,
      marketplaces: sources,
      outdated: ['dev-skills@snippets (user): 0.6.2 -> 0.7.2'],
    });
    assert.equal(status, 0);
    assert.ok(calls.includes('plugin marketplace update ponytail'));
    assert.ok(calls.includes('plugin marketplace update snippets'));
    assert.ok(calls.includes('plugin upgrade dev-skills@snippets'));
    assert.ok(!calls.includes('plugin upgrade ponytail@ponytail'));
    assert.ok(!calls.some((call) => call.startsWith('plugin install') || call.startsWith('plugin marketplace add')));
    assert.match(stdout, /Upgraded dev-skills: 0\.6\.2 -> 0\.7\.2\./);
    assert.match(stdout, /Ponytail is up to date\./);
    assert.match(stdout, /Start a new OMP session/);
  });

  it('changes nothing and asks for no new session when both are current', () => {
    const { status, calls, stdout } = machine({ installed: both, marketplaces: sources });
    assert.equal(status, 0);
    assert.ok(!calls.some((call) => /^plugin (install|upgrade [^-])/.test(call)));
    assert.doesNotMatch(stdout, /Start a new OMP session/);
  });

  it('says what is missing when omp is not on PATH', () => {
    const run = spawnSync('/bin/sh', [setup], { encoding: 'utf8', env: { PATH: mkdtempSync(join(tmpdir(), 'empty-')) } });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /omp is not on your PATH/);
  });
});
