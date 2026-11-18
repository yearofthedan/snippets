import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';

const cli = join(import.meta.dirname, '../src/cli.ts');
let repo: string;
let project: string;

const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
const fitness = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: project, encoding: 'utf8' });

/** A repo whose project sits in a subdirectory, with one commit of the hex fixture and then a change. */
before(() => {
  repo = mkdtempSync(join(tmpdir(), 'fitness-test-'));
  project = join(repo, 'app');
  cpSync(join(import.meta.dirname, 'fixtures/hex'), project, { recursive: true });
  git('init', '--quiet');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'base');

  const handle = join(project, 'src/app/handle.ts');
  writeFileSync(handle, readFileSync(handle, 'utf8').replace("return 'B';", "if (strict) return 'B-';\n    return 'B';"));
  writeFileSync(join(project, 'src/domain/audit.ts'), "import { handle } from '../app/handle.ts';\n\nexport const audit = handle;\n");
});

describe('fitness diff', () => {
  it('reports only new and worsened findings against the working tree', () => {
    const run = fitness('diff', 'HEAD', '--json');
    assert.equal(run.status, 0, run.stderr);
    const delta = JSON.parse(run.stdout);
    assert.deepEqual(delta.added.map((f: { key: string }) => f.key), ['dependency-direction:src/domain/audit.ts->src/app/handle.ts']);
    assert.deepEqual(delta.worsened.map((f: { key: string; was: number; value: number }) => [f.key, f.was, f.value]), [
      ['cognitive-complexity:src/app/handle.ts:grade', 10, 12],
    ]);
  });

  it('compares two commits', () => {
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'head');
    const run = fitness('diff', 'HEAD~1..HEAD', '--fail');
    assert.equal(run.status, 1);
    assert.match(run.stdout, /1 new finding, 1 worsened, 0 resolved\./);
    assert.match(run.stdout, /Domain module src\/domain\/audit.ts imports app src\/app\/handle.ts\. This breaks the dependency direction, so the domain should depend on a port it owns for what it needs \(handle\)/);
  });

  it('prints a hook response only when there is a delta', () => {
    const changed = JSON.parse(fitness('diff', 'HEAD~1..HEAD', '--hook').stdout);
    assert.equal(changed.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(changed.hookSpecificOutput.additionalContext, /new: src\/domain\/audit.ts:1/);
    assert.equal(fitness('diff', 'HEAD', '--hook').stdout, '');
  });

  it('compares from the merge base with three dots', () => {
    const run = fitness('diff', 'HEAD~1...HEAD', '--json');
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).added.length, 1);
  });

  it('refuses a malformed range', () => {
    const run = fitness('diff', 'HEAD~1..HEAD..HEAD');
    assert.equal(run.status, 2);
    assert.match(run.stderr, /is not a range/);
  });

  it('resolves the project path when reached through a symlink', () => {
    const link = join(mkdtempSync(join(tmpdir(), 'fitness-link-')), 'repo');
    symlinkSync(repo, link);
    const config = join(link, 'app/fitness.config.json');
    const run = spawnSync(process.execPath, [cli, 'diff', 'HEAD~1..HEAD', '--json', '--config', config], { cwd: project, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).added.length, 1);
  });

  it('counts a base from before the project existed as having no findings', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'fitness-fresh-'));
    const run = (args: string[], cwd = fresh) => execFileSync('git', args, { cwd, encoding: 'utf8' });
    run(['init', '--quiet']);
    writeFileSync(join(fresh, 'README.md'), 'before\n');
    run(['add', '.']);
    run(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'before']);
    cpSync(join(import.meta.dirname, 'fixtures/hex'), join(fresh, 'app'), { recursive: true });
    run(['add', '.']);
    run(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'add app']);
    const diffed = spawnSync(process.execPath, [cli, 'diff', 'HEAD~1..HEAD', '--json'], { cwd: join(fresh, 'app'), encoding: 'utf8' });
    assert.equal(diffed.status, 0, diffed.stderr);
    assert.equal(JSON.parse(diffed.stdout).added.length, 7);
    assert.equal(run(['worktree', 'list']).trim().split('\n').length, 1);
  });

  it('leaves no worktrees behind', () => {
    assert.equal(git('worktree', 'list').trim().split('\n').length, 1);
  });
});

describe('fitness check', () => {
  it('exits 1 with --fail when there are findings', () => {
    assert.equal(fitness('check', '--fail').status, 1);
  });

  it('reports a config error', () => {
    writeFileSync(join(project, 'bad.json'), '{"kinds": {"a": {"match": "src/**", "dependsOn": ["b"]}}}');
    const run = fitness('check', '--config', 'bad.json');
    assert.equal(run.status, 2);
    assert.match(run.stderr, /fitness config: kinds.a.dependsOn: no kind called b/);
  });
});
