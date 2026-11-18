import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { components } from '../src/model/components.ts';
import { classify, ConfigError, parseConfig } from '../src/model/config.ts';
import { diff } from '../src/model/diff.ts';
import { check, type Finding } from '../src/model/rules.ts';

describe('parseConfig', () => {
  it('applies shared thresholds under per-kind ones', () => {
    const config = parseConfig({
      thresholds: { maxLines: 100 },
      kinds: { domain: { match: 'src/domain/**', thresholds: { maxComplexity: 5 } } },
    });
    assert.deepEqual(config.kinds[0].thresholds, { maxLines: 100, maxFunctionLines: 40, maxComplexity: 5 });
    assert.deepEqual(config.kinds[0].dependsOn, []);
  });

  it('refuses a dependsOn that names no kind', () => {
    assert.throws(() => parseConfig({ kinds: { app: { match: 'src/**', dependsOn: ['domain'] } } }), ConfigError);
  });

  it('refuses an unknown threshold', () => {
    assert.throws(() => parseConfig({ thresholds: { maxLoc: 1 }, kinds: { app: { match: 'src/**' } } }), /unknown threshold maxLoc/);
  });

  it('classifies by the first kind that matches', () => {
    const config = parseConfig({ kinds: { ports: { match: 'src/domain/ports/**' }, domain: { match: 'src/domain/**' } } });
    assert.equal(classify(config, 'src/domain/ports/repo.ts')?.name, 'ports');
    assert.equal(classify(config, 'src/domain/order.ts')?.name, 'domain');
    assert.equal(classify(config, 'src/other.ts'), undefined);
  });
});

describe('components', () => {
  const unit = (name: string, kind: 'function' | 'type') => ({ name, kind, line: 1, endLine: 1 });

  it('joins functions through a shared type and drops groups without a counted unit', () => {
    const graph = {
      units: [unit('a', 'function'), unit('T', 'type'), unit('b', 'function'), unit('c', 'function'), unit('Unused', 'type')],
      links: [[0, 1], [2, 1]] as [number, number][],
    };
    assert.deepEqual(
      components(graph, ['function']).map((group) => group.map((u) => u.name)),
      [['a', 'T', 'b'], ['c']],
    );
  });
});

describe('diff', () => {
  const finding = (key: string, value: number) => ({ key, value }) as Finding;

  it('separates new, worsened and resolved findings', () => {
    const delta = diff(
      [finding('kept', 2), finding('worse', 3), finding('gone', 1)],
      [finding('kept', 2), finding('worse', 4), finding('fresh', 1)],
    );
    assert.deepEqual(delta.added.map((f) => f.key), ['fresh']);
    assert.deepEqual(delta.worsened.map((f) => [f.key, f.was]), [['worse', 3]]);
    assert.deepEqual(delta.resolved.map((f) => f.key), ['gone']);
  });
});

describe('dependency direction', () => {
  const module = (file: string, to?: string) => ({
    file,
    lines: 1,
    imports: to ? [{ from: file, to, specifier: to, names: ['x'], typeOnly: false, line: 2 }] : [],
    units: { units: [], links: [] },
    functions: [],
  });

  it('advises moving the code when neither kind may depend on the other', () => {
    const config = parseConfig({ kinds: { billing: { match: 'src/billing/**' }, shipping: { match: 'src/shipping/**' } } });
    const [finding] = check(config, { modules: [module('src/billing/a.ts', 'src/shipping/b.ts'), module('src/shipping/b.ts')] });
    assert.equal(
      finding.message,
      'Billing module src/billing/a.ts imports shipping src/shipping/b.ts. Billing may depend only on itself, ' +
        'so move what it needs into billing (x), or allow billing -> shipping in the config if the dependency is intended.',
    );
  });
});
