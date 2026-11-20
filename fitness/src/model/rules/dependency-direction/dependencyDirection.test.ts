import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { check } from '../../check.ts';
import { parseConfig } from '../../config.ts';
import type { ModuleFacts } from '../../facts.ts';
import { builtinRegistry } from '../index.ts';

const module = (file: string, to?: string): ModuleFacts => ({
  file,
  lines: 1,
  imports: to ? [{ from: file, to, specifier: to, names: ['x'], typeOnly: false, line: 2 }] : [],
  units: { units: [], links: [] },
  functions: [],
});

describe('dependency-direction', () => {
  it('advises moving the code when neither kind may depend on the other', () => {
    const config = parseConfig({ kinds: { billing: { match: 'src/billing/**' }, shipping: { match: 'src/shipping/**' } } }, builtinRegistry);
    const [finding] = check(config, { modules: [module('src/billing/a.ts', 'src/shipping/b.ts'), module('src/shipping/b.ts')] });
    assert.equal(
      finding.message,
      'Billing module src/billing/a.ts imports shipping src/shipping/b.ts. Billing may depend only on itself, ' +
        'so move what it needs into billing (x), or allow billing -> shipping in the config if the dependency is intended.',
    );
  });

  it('refuses options', () => {
    assert.throws(
      () => parseConfig({ rules: { 'dependency-direction': { strict: 1 } }, kinds: { app: { match: 'src/**' } } }, builtinRegistry),
      /takes no options/,
    );
  });
});
