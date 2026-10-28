import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Box, type Frame, faultsIn, landingJumps, layoutDifferences, startJumps } from './motion-check.ts';

const box = (l: number, t: number, w: number, h: number, o = 1): Box => ({ l, r: l + w, t, b: t + h, o, v: 'visible' });
const frames = (...steps: Box[]): Frame[] =>
  steps.map((card, i) => ({ t: i * 16, running: i < steps.length - 1 ? 1 : 0, boxes: { card } }));

describe('faultsIn', () => {
  it('passes a card that grows evenly about its centre', () => {
    assert.deepEqual(faultsIn(frames(box(100, 100, 100, 50), box(80, 90, 140, 70), box(50, 75, 200, 100)), { duration: 400 }), []);
  });

  it('finds an edge that turns back', () => {
    const steps = frames(box(100, 0, 100, 50), box(90, 0, 100, 50), box(80, 0, 100, 50), box(70, 0, 100, 50), box(75, 0, 100, 50), box(60, 0, 100, 50));
    assert.ok(faultsIn(steps, { duration: 400 }).some((fault) => /card: edge l turns back 70 → 75/.test(fault)));
  });

  it('finds an edge that should stay still and moves, such as a card growing from one side', () => {
    const steps = frames(box(100, 0, 100, 50), box(100, 0, 120, 50), box(102, 0, 140, 50), box(100, 0, 160, 50));
    assert.ok(faultsIn(steps, { duration: 400 }).some((fault) => /card: edge l turns back 100 → 102/.test(fault)));
  });

  it('finds an edge that snaps in one frame, such as a chip turned tall and thin', () => {
    const steps = frames(box(0, 0, 77, 40), box(0, 0, 77, 189), box(0, 0, 200, 189), box(0, 0, 400, 189), box(0, 0, 560, 189));
    assert.ok(faultsIn(steps, { duration: 400 }).some((fault) => /card: edge b snaps 40 → 189 in one frame at 16 ms/.test(fault)));
  });

  it('finds a size outside its start and end', () => {
    const steps = frames(box(0, 0, 100, 40), box(0, 0, 110, 50), box(0, 0, 120, 70), box(0, 0, 130, 65), box(0, 0, 140, 60));
    assert.ok(faultsIn(steps, { duration: 400 }).some((fault) => /card: height 70 at 32 ms, outside 40–60/.test(fault)));
  });

  it('finds opacity that jumps in one frame, and lets a design allow it', () => {
    const steps = frames(box(0, 0, 10, 10, 1), box(0, 0, 10, 10, 0), box(0, 0, 10, 10, 0));
    assert.match(faultsIn(steps, { duration: 400 })[0]!, /opacity jumps 1 → 0/);
    assert.deepEqual(faultsIn(steps, { duration: 400, allow: { opacityJump: true } }), []);
  });

  it('finds motion still running past its duration', () => {
    const steps: Frame[] = [0, 200, 500].map((t) => ({ t, running: 1, boxes: {} }));
    assert.deepEqual(faultsIn(steps, { duration: 400 }), ['still moving at 500 ms, past 400 ms']);
  });

  it('ignores a box while it is hidden', () => {
    const hidden = { ...box(500, 0, 10, 10), v: 'hidden' };
    assert.deepEqual(faultsIn(frames(box(0, 0, 10, 10), hidden, box(0, 0, 10, 10)), { duration: 400 }), []);
  });
});

describe('layoutDifferences', () => {
  const at = (boxes: Record<string, Box>): Frame => ({ t: 0, running: 0, boxes });

  it('passes a layout that ends where the one-step layout does', () => {
    assert.deepEqual(layoutDifferences(at({ a: box(0, 0, 10, 10) }), at({ a: box(0.5, 0, 10, 10) })), []);
  });

  it('names each edge left stale, as after a resize dropped during a move', () => {
    assert.deepEqual(layoutDifferences(at({ a: box(440, 0, 560, 10) }), at({ a: box(220, 0, 560, 10) })), [
      'a: l 440, should be 220; r 1000, should be 780',
    ]);
  });

  it('finds a box shown that should be hidden', () => {
    const hidden = { ...box(0, 0, 10, 10), o: 0 };
    assert.deepEqual(layoutDifferences(at({ a: box(0, 0, 10, 10) }), at({ a: hidden })), ['a: shown, should be hidden']);
  });
});

describe('landingJumps', () => {
  const at = (t: number, running: number, l: number): Frame => ({ t, running, boxes: { a: box(l, 0, 10, 10) } });

  it('passes motion that comes to rest by itself', () => {
    assert.deepEqual(landingJumps([at(0, 1, 0), at(16, 1, 80), at(32, 1, 99), at(48, 0, 100)]), []);
  });

  it('finds motion cut short, which jumps as it stops', () => {
    assert.deepEqual(landingJumps([at(0, 1, 0), at(16, 1, 60), at(32, 0, 100)]), ['a: jumps 40 px as the motion stops at 32 ms, cut short']);
  });
});

describe('startJumps', () => {
  const at = (t: number, l: number): Frame => ({ t, running: 1, boxes: { a: box(l, 0, 10, 10) } });

  it('passes a move that eases out from where the box was drawn', () => {
    assert.deepEqual(startJumps([at(0, 0), at(16, 30), at(32, 55), at(48, 75), at(64, 90), at(80, 100)]), []);
  });

  it('finds a move that jumps most of the way before it moves, as when a running move is stopped', () => {
    assert.deepEqual(startJumps([at(0, 0), at(16, 80), at(32, 90), at(48, 100)]), ['a: edge l jumps 80 of 100 px as the move starts, at 16 ms']);
  });
});
