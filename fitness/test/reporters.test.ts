import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reporters } from '../src/reporters/index.ts';
import type { Report } from '../src/reporters/reporter.ts';
import type { Finding } from '../src/model/rule.ts';

const finding: Finding = { rule: 'cognitive-complexity', key: 'cognitive-complexity:src/a.ts:f', file: 'src/a.ts', line: 3, value: 20, limit: 15, message: 'Too complex.' };
const documented: Finding = { ...finding, docs: 'https://example.test/cognitive-complexity.md' };
const context = { toolVersion: '1.2.3', projectPath: 'app' };
const render = (id: string, report: Report) => reporters.get(id)?.render(report, context) ?? '';
const diff = (added: Finding[]): Report => ({ mode: 'diff', delta: { added, worsened: [], resolved: [] } });

describe('reporters', () => {
  it('text prints each finding and a count', () => {
    assert.equal(render('text', { mode: 'check', findings: [finding] }), 'src/a.ts:3 [cognitive-complexity] Too complex.\n\n1 finding');
    assert.equal(render('text', diff([])), '0 new findings, 0 worsened, 0 resolved.');
  });

  it('sarif locates results from the repository root and fingerprints them by key', () => {
    const sarif = JSON.parse(render('sarif', diff([finding])));
    assert.equal(sarif.version, '2.1.0');
    assert.deepEqual(sarif.runs[0].tool.driver.rules, [{ id: 'cognitive-complexity', shortDescription: { text: 'cognitive-complexity' } }]);
    assert.deepEqual(sarif.runs[0].results, [
      {
        ruleId: 'cognitive-complexity',
        level: 'warning',
        message: { text: 'Too complex.' },
        locations: [{ physicalLocation: { artifactLocation: { uri: 'app/src/a.ts' }, region: { startLine: 3 } } }],
        partialFingerprints: { 'fitnessKey/v1': 'cognitive-complexity:src/a.ts:f' },
      },
    ]);
  });

  it('agent reporters print nothing when there is nothing to act on', () => {
    for (const id of ['claude-hook', 'omp']) assert.equal(render(id, diff([])), '');
    assert.match(JSON.parse(render('omp', diff([finding]))).additionalContext, /new: src\/a.ts:3/);
    assert.equal(JSON.parse(render('claude-hook', diff([finding]))).hookSpecificOutput.hookEventName, 'PostToolUse');
  });

  it("link each rule's docs once", () => {
    const context = JSON.parse(render('omp', diff([documented, { ...documented, key: 'other' }]))).additionalContext;
    assert.match(context, /\n\nRule docs:\n- cognitive-complexity: https:\/\/example.test\/cognitive-complexity.md$/);
    assert.equal(JSON.parse(render('sarif', diff([documented]))).runs[0].tool.driver.rules[0].helpUri, documented.docs);
  });
});
