import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InvalidRange, parseRange } from '../src/app/diff.ts';

describe('parseRange', () => {
  it('reads a base alone, two dots and three dots', () => {
    assert.deepEqual(parseRange('HEAD'), { base: 'HEAD', fromMergeBase: false });
    assert.deepEqual(parseRange('main..feature'), { base: 'main', head: 'feature', fromMergeBase: false });
    assert.deepEqual(parseRange('main...feature'), { base: 'main', head: 'feature', fromMergeBase: true });
    assert.deepEqual(parseRange('main...'), { base: 'main', fromMergeBase: true });
  });

  it('keeps single dots inside a ref', () => {
    assert.deepEqual(parseRange('v1.2..v1.3'), { base: 'v1.2', head: 'v1.3', fromMergeBase: false });
  });

  it('refuses a range with more than one separator or no base', () => {
    assert.throws(() => parseRange('a..b..c'), InvalidRange);
    assert.throws(() => parseRange('..b'), InvalidRange);
  });
});
