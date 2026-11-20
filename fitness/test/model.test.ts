import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { components } from '../src/model/components.ts';
import { check } from '../src/model/check.ts';
import { classify, type Config, ConfigError, parseConfig } from '../src/model/config.ts';
import { diff } from '../src/model/diff.ts';
import { type Finding, type Rule, registry, wholeNumberOptions } from '../src/model/rule.ts';
import { builtinRegistry, builtinRules } from '../src/model/rules/index.ts';

const moduleWith = (file: string, to?: string) => ({
  file,
  lines: 1,
  imports: to ? [{ from: file, to, specifier: to, names: ['x'], typeOnly: false, line: 2 }] : [],
  units: { units: [], links: [] },
  functions: [],
});

const parse = (raw: unknown) => parseConfig(raw, builtinRegistry);
const optionsOf = (config: Config, rule: string) => config.kinds[0].rules.find((enabled) => enabled.rule.id === rule)?.options;

describe('parseConfig', () => {
  it("layers a kind's rule options over shared ones over each rule's defaults", () => {
    const config = parse({
      rules: { 'module-cohesion': { maxLines: 100 }, 'cognitive-complexity': { max: 10 } },
      kinds: { domain: { match: 'src/domain/**', rules: { 'cognitive-complexity': { max: 5 } } } },
    });
    assert.deepEqual(optionsOf(config, 'module-cohesion'), { maxLines: 100 });
    assert.deepEqual(optionsOf(config, 'function-cohesion'), { maxLines: 40 });
    assert.deepEqual(optionsOf(config, 'cognitive-complexity'), { max: 5 });
    assert.deepEqual(config.kinds[0].dependsOn, []);
  });

  it('turns rules off and back on per kind', () => {
    const config = parse({
      rules: { 'function-cohesion': false },
      kinds: {
        tests: { match: 'test/**', rules: { 'cognitive-complexity': false } },
        app: { match: 'src/**', rules: { 'function-cohesion': true } },
      },
    });
    const ids = (index: number) => config.kinds[index].rules.map((enabled) => enabled.rule.id);
    assert.deepEqual(ids(0), ['dependency-direction', 'no-cross-kind-reexport', 'module-cohesion']);
    assert.deepEqual(ids(1), ['dependency-direction', 'no-cross-kind-reexport', 'module-cohesion', 'function-cohesion', 'cognitive-complexity']);
  });

  it('runs a rule registered beside the built-in ones', () => {
    const custom: Rule<{ limit: number }> = {
      id: 'max-imports',
      defaults: { limit: 10 },
      parseOptions: wholeNumberOptions({ limit: 10 }),
      check: ({ module, options }) =>
        module.imports.length >= options.limit
          ? [{ rule: 'max-imports', key: `max-imports:${module.file}`, file: module.file, line: 1, value: module.imports.length, message: 'too many' }]
          : [],
    };
    const config = parseConfig(
      { rules: { 'max-imports': { limit: 1 } }, kinds: { all: { match: '**', rules: { 'dependency-direction': false } } } },
      registry([...builtinRules, custom as Rule]),
    );
    const findings = check(config, { modules: [moduleWith('a.ts', 'b.ts'), moduleWith('b.ts')] });
    assert.deepEqual(findings.map((f) => f.key), ['max-imports:a.ts']);
  });

  it('refuses a dependsOn that names no kind', () => {
    assert.throws(() => parse({ kinds: { app: { match: 'src/**', dependsOn: ['domain'] } } }), ConfigError);
  });

  it('refuses a rule that is not registered, and options a rule does not take', () => {
    assert.throws(() => parse({ rules: { 'max-loc': {} }, kinds: { app: { match: 'src/**' } } }), /rules: no rule called max-loc/);
    assert.throws(
      () => parse({ kinds: { app: { match: 'src/**', rules: { 'module-cohesion': { maxLoc: 1 } } } } }),
      /kinds.app.rules.module-cohesion: unknown key maxLoc/,
    );
  });

  it('refuses an unknown key at the top level or in a kind', () => {
    assert.throws(() => parse({ exlude: [], kinds: { app: { match: 'src/**' } } }), /config: unknown key exlude/);
    assert.throws(() => parse({ kinds: { app: { match: 'src/**', depends: [] } } }), /kinds.app: unknown key depends/);
  });

  it('refuses a limit below 1 and a tsconfig that is not a string', () => {
    assert.throws(() => parse({ rules: { 'module-cohesion': { maxLines: 0 } }, kinds: { app: { match: 'src/**' } } }), /at least 1/);
    assert.throws(() => parse({ tsconfig: 5, kinds: { app: { match: 'src/**' } } }), /tsconfig: expected a string/);
  });

  it('classifies by the first kind that matches', () => {
    const config = parse({ kinds: { ports: { match: 'src/domain/ports/**' }, domain: { match: 'src/domain/**' } } });
    assert.equal(classify(config, 'src/domain/ports/repo.ts')?.name, 'ports');
    assert.equal(classify(config, 'src/domain/order.ts')?.name, 'domain');
    assert.equal(classify(config, 'src/other.ts'), undefined);
  });
});

describe('plugins', () => {
  const imports: Rule<{ limit: number }> = {
    id: 'max-imports',
    docs: 'https://example.com/max-imports',
    defaults: { limit: 10 },
    parseOptions: wholeNumberOptions({ limit: 10 }),
    check: ({ module, options }) =>
      module.imports.length >= options.limit
        ? [{ rule: 'max-imports', key: `max-imports:${module.file}`, file: module.file, line: 1, value: module.imports.length, message: 'too many' }]
        : [],
  };
  const bare: Rule = { id: 'bare', check: () => [] };
  const withPlugins = (plugins: unknown, rules: unknown = {}) =>
    parse({ plugins, rules, kinds: { all: { match: '**', rules: { 'dependency-direction': false } } } });

  it('runs plugin rules under their namespace, with their options validated', () => {
    const config = withPlugins({ wt: { rules: [imports] } }, { 'wt/max-imports': { limit: 1 } });
    const findings = check(config, { modules: [moduleWith('a.ts', 'b.ts'), moduleWith('b.ts')] });
    assert.deepEqual(findings, [
      { rule: 'wt/max-imports', key: 'wt/max-imports:a.ts', file: 'a.ts', line: 1, value: 1, message: 'too many', docs: 'https://example.com/max-imports' },
    ]);
    assert.throws(() => withPlugins({ wt: { rules: [imports] } }, { 'wt/max-imports': { limit: 0 } }), /rules.wt\/max-imports.limit: expected a whole number/);
    assert.throws(() => withPlugins({ wt: { rules: [imports] } }, { 'max-imports': {} }), /rules: no rule called max-imports/);
  });

  it('gives no docs link to a rule without one, and refuses options to a rule that declares none', () => {
    const config = withPlugins({ wt: { rules: [{ ...bare, check: () => [{ rule: 'bare', key: 'k', file: 'a.ts', line: 1, value: 1, message: 'm' }] }] } });
    assert.equal(check(config, { modules: [moduleWith('a.ts')] })[0].docs, undefined);
    assert.ok(withPlugins({ wt: { rules: [bare] } }, { 'wt/bare': false }));
    assert.throws(() => withPlugins({ wt: { rules: [bare] } }, { 'wt/bare': { max: 1 } }), /rules.wt\/bare: unknown key max/);
  });

  it('refuses duplicate ids, bad names and a plugin given as a path', () => {
    assert.throws(() => withPlugins({ wt: { rules: [bare, bare] } }), /two rules have the id wt\/bare/);
    assert.ok(withPlugins({ wt: { rules: [bare] }, other: { rules: [bare] } }));
    assert.throws(() => withPlugins({ 'w/t': { rules: [bare] } }), /plugins.w\/t: a namespace is/);
    assert.throws(() => withPlugins({ wt: { rules: [{ ...bare, id: 'x/y' }] } }), /plugins.wt.rules\[0\]: a rule id is/);
    assert.throws(() => withPlugins({ wt: { rules: [{ id: 'x' }] } }), /x has no check function/);
    assert.throws(() => withPlugins({ wt: './rules.ts' }), /plugins.wt: expected a plugin, \{ rules: Rule\[\] \}, imported in a fitness.config.ts/);
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
