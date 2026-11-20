import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { check } from '../../check.ts';
import { type Config, parseConfig } from '../../config.ts';
import type { ModuleFacts } from '../../facts.ts';
import { builtinRegistry } from '../index.ts';

const rule = 'no-cross-kind-reexport';

const module = (file: string, to?: string, reExport?: true): ModuleFacts => ({
  file,
  lines: 1,
  imports: to ? [{ from: file, to, specifier: to, names: ['x'], typeOnly: false, ...(reExport ? { reExport } : {}), line: 2 }] : [],
  units: { units: [], links: [] },
  functions: [],
});

const kinds = (allow?: unknown): Config =>
  parseConfig(
    {
      kinds: {
        domain: { match: 'src/domain/**' },
        app: { match: 'src/app/**', dependsOn: ['domain'], ...(allow ? { rules: { [rule]: { allow } } } : {}) },
      },
    },
    builtinRegistry,
  );

const keys = (config: Config, ...modules: ModuleFacts[]) =>
  check(config, { modules: [...modules, module('src/domain/d.ts'), module('src/app/b.ts')] })
    .filter((f) => f.rule === rule)
    .map((f) => f.key);

describe(rule, () => {
  it('flags a re-export of another kind, even one the kind may depend on', () => {
    assert.deepEqual(keys(kinds(), module('src/app/a.ts', 'src/domain/d.ts', true)), [`${rule}:src/app/a.ts->src/domain/d.ts`]);
  });

  it('passes a plain import and a re-export within the kind', () => {
    assert.deepEqual(keys(kinds(), module('src/app/a.ts', 'src/domain/d.ts'), module('src/app/c.ts', 'src/app/b.ts', true)), []);
  });

  it("passes a re-export from a kind the kind's options allow", () => {
    assert.deepEqual(keys(kinds('domain'), module('src/app/a.ts', 'src/domain/d.ts', true)), []);
  });

  it('refuses an allow that is not kind names', () => {
    assert.throws(() => kinds([1]), /kinds.app.rules.no-cross-kind-reexport.allow: expected a kind name/);
  });
});
