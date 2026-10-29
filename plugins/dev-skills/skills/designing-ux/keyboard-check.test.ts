import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Stop, stopFaults } from './keyboard-check.ts';

const screen = { l: 0, r: 1100, t: 0, b: 800 };
const stop = (name: string, l: number, t: number, { shown = screen, covered = null as string | null } = {}): Stop => ({
  name,
  l,
  r: l + 80,
  t,
  b: t + 30,
  shown,
  covered,
});

describe('stopFaults', () => {
  it('passes stops inside the area they show in and on top', () => {
    assert.deepEqual(stopFaults([stop('a', 0, 0), stop('b', 1020, 770)]), []);
  });

  it('finds a stop clipped by a scrolling-off container, as a chip Tab reaches outside main', () => {
    assert.deepEqual(stopFaults([stop('button "Scene 1"', -25, 100, { shown: { l: 0, r: 1100, t: 66, b: 800 } })]), [
      'button "Scene 1": off screen, l -25 past 0',
    ]);
  });

  it('passes a stop outside one container when no ancestor clips it, such as a header', () => {
    assert.deepEqual(stopFaults([stop('button "The story"', 225, 20)]), []);
  });

  it('finds a stop past the right and bottom edges', () => {
    assert.deepEqual(stopFaults([stop('a', 1050, 790)]), ['a: off screen, r 1130 past 1100; b 820 past 800']);
  });

  it('finds a stop covered by another element, such as a sticky header', () => {
    assert.deepEqual(stopFaults([stop('a', 10, 10, { covered: 'header "Story"' })]), ['a: covered by header "Story"']);
  });
});
