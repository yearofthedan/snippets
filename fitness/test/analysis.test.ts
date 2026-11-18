import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { typescriptAnalyzer } from '../src/analysis/typescript.ts';
import { parseConfig } from '../src/model/config.ts';
import { builtinRegistry } from '../src/model/rules/index.ts';
import type { ModuleFacts } from '../src/model/facts.ts';

const root = join(import.meta.dirname, 'fixtures/facts');
let modules: Map<string, ModuleFacts>;

before(() => {
  const config = parseConfig(JSON.parse(readFileSync(join(root, 'fitness.config.json'), 'utf8')), builtinRegistry);
  modules = new Map(typescriptAnalyzer.analyze(root, config).modules.map((module) => [module.file, module]));
});

const fn = (name: string) => modules.get('src/complexity.ts')?.functions.find((f) => f.name === name);

describe('import graph', () => {
  it('resolves named imports through a barrel to the declaring module', () => {
    const edges = modules.get('src/complexity.ts')?.imports ?? [];
    const named = edges.find((edge) => edge.line === 3);
    assert.deepEqual(named, {
      from: 'src/complexity.ts',
      to: 'src/lib/shapes.ts',
      via: 'src/lib/index.ts',
      specifier: './lib/index.ts',
      names: ['Square', 'Circle'],
      typeOnly: false,
      line: 3,
    });
  });

  it('points side-effect and namespace imports at the module the specifier resolves to', () => {
    const edges = modules.get('src/complexity.ts')?.imports ?? [];
    assert.deepEqual(
      edges.filter((edge) => edge.line < 3).map((edge) => [edge.to, edge.names]),
      [['src/lib/index.ts', []], ['src/lib/index.ts', ['lib']]],
    );
  });

  it('records re-exports as edges from the barrel', () => {
    const edges = modules.get('src/lib/index.ts')?.imports ?? [];
    assert.deepEqual(edges.map((edge) => [edge.to, edge.names]), [['src/lib/shapes.ts', ['Circle', 'Square']], ['src/lib/shapes.ts', []]]);
  });

  it('marks an import type-only when every name declares only a type', () => {
    const hexagonalApp = join(import.meta.dirname, 'fixtures/hexagonal-app');
    const config = parseConfig(JSON.parse(readFileSync(join(hexagonalApp, 'fitness.config.json'), 'utf8')), builtinRegistry);
    const order = typescriptAnalyzer.analyze(hexagonalApp, config).modules.find((module) => module.file === 'src/domain/order.ts');
    assert.deepEqual(order?.imports.map((edge) => [edge.names, edge.typeOnly]), [[['saveOrder'], false], [['OrderRow'], true]]);
  });
});

describe('cognitive complexity', () => {
  it('counts a ternary and direct recursion', () => assert.equal(fn('sum')?.complexity?.total, 2));
  it('counts each parenthesised run of logical operators once', () => assert.equal(fn('mixed')?.complexity?.total, 2));
  it('deepens nesting inside a nested function and counts a labelled jump', () => {
    assert.deepEqual(fn('outer')?.complexity?.increments.map((i) => [i.reason, i.amount]), [
      ['for', 1],
      ['if', 3],
      ['if', 2],
      ['labelled continue', 1],
    ]);
  });
  it('counts recursion through this', () => assert.equal(fn('Tree.walk')?.complexity?.total, 1));
  it('ignores a call to a local that shadows the function name', () => assert.equal(fn('shadowed')?.complexity?.total, 0));
  it('folds nested functions into the outermost one', () => assert.equal(fn('check')?.complexity, undefined));
});

describe('function names', () => {
  it('name a callback by its call and a string first argument', () => {
    const names = [...modules.values()].flatMap((m) => m.functions.map((f) => f.name));
    assert.ok(names.includes('<callback to [1, 2].map>'));
    assert.deepEqual(modules.get('src/callbacks.ts')?.functions.map((f) => f.name).slice(1), ['<callback to it("first")>', '<callback to it("second")>']);
  });
});

describe('function statements', () => {
  it('links statements that share a this member', () => {
    assert.deepEqual(fn('Counter.bump')?.statements.links, [[0, 2]]);
  });
});
