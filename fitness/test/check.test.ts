import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { typescriptAnalyzer } from '../src/analysis/typescript.ts';
import { checkProject } from '../src/app/check.ts';
import { parseConfig } from '../src/model/config.ts';
import { builtinRegistry } from '../src/model/rules/index.ts';
import type { Finding } from '../src/model/rule.ts';

const root = join(import.meta.dirname, 'fixtures/hexagonal-app');
let findings: Finding[];

before(() => {
  findings = checkProject(typescriptAnalyzer, root, parseConfig(JSON.parse(readFileSync(join(root, 'fitness.config.json'), 'utf8')), builtinRegistry));
});

const byKey = (key: string) => findings.find((finding) => finding.key === key);

describe('check', () => {
  it('reports every rule once per subject', () => {
    assert.deepEqual(findings.map((finding) => finding.key).sort(), [
      'cognitive-complexity:src/app/handle.ts:grade',
      'dependency-direction:src/domain/order.ts->src/adapters/db/orderRepo.ts',
      'dependency-direction:src/domain/pricing.ts->src/adapters/db/orderRepo.ts',
      'function-cohesion:src/app/handle.ts:handle',
      'module-cohesion:src/app/handle.ts',
      'module-cohesion:src/domain/pricing.ts',
      'no-cross-kind-reexport:src/app/index.ts->src/domain/order.ts',
      'unclassified:src/stray.ts',
    ]);
  });

  it('explains a dependency that breaks the direction through a barrel', () => {
    assert.equal(
      byKey('dependency-direction:src/domain/order.ts->src/adapters/db/orderRepo.ts')?.message,
      'Domain module src/domain/order.ts imports adapter src/adapters/db/orderRepo.ts through src/adapters/index.ts. ' +
        'This breaks the dependency direction, so the domain should depend on a port it owns for what it needs (saveOrder, OrderRow), ' +
        'and the adapter should implement it.',
    );
  });

  it('reports a re-export of another kind at the module that passes it on', () => {
    const finding = byKey('no-cross-kind-reexport:src/app/index.ts->src/domain/order.ts');
    assert.equal(
      finding?.message,
      'App module src/app/index.ts re-exports Order from domain src/domain/order.ts, so its importers reach domain through app. ' +
        'Have importers that may depend on domain import it from src/domain/order.ts, and give the rest a app API that hides it, ' +
        "or allow domain in this rule's options if app is meant to expose it.",
    );
    assert.equal(finding?.docs, 'https://github.com/yearofthedan/snippets/blob/main/fitness/src/model/rules/no-cross-kind-reexport/README.md');
  });

  it('reports the groups a module splits into', () => {
    assert.deepEqual(byKey('module-cohesion:src/domain/pricing.ts')?.details, {
      lines: 17,
      tripwire: 15,
      groups: [
        { names: ['rate', 'tax', 'gross'], lines: [3, 7] },
        { names: ['label'], lines: [9, 11] },
        { names: ['shout', 'banner'], lines: [13, 17] },
      ],
    });
  });

  it('reports the statement groups a function splits into', () => {
    assert.deepEqual(
      (byKey('function-cohesion:src/app/handle.ts:handle')?.details as { groups: unknown }).groups,
      [
        { names: ['line 4', 'line 5', 'line 6'], lines: [4, 6] },
        { names: ['line 7', 'line 8', 'line 9'], lines: [7, 9] },
      ],
    );
  });

  it('passes a module over the tripwire whose code is one group', () => {
    assert.equal(byKey('module-cohesion:src/adapters/db/orderRepo.ts'), undefined);
  });
});
