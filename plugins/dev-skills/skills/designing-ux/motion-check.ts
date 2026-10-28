import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
  o: number;
  v: string;
}

export interface Frame {
  t: number;
  running: number;
  boxes: Record<string, Box>;
}

export interface Page {
  goto(url: string): Promise<unknown>;
  waitForSelector(selector: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  emulateMedia(options: { reducedMotion: 'reduce' | 'no-preference' }): Promise<void>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  keyboard: { press(key: string): Promise<void> };
}

export interface Move {
  name: string;
  run: (page: Page) => Promise<unknown>;
}

export interface Config {
  url: string;
  watch: string;
  key?: string;
  moves: Move[];
  duration?: number;
  viewport?: { width: number; height: number };
  open?: (page: Page) => Promise<unknown>;
  allow?: { turnBack?: boolean; opacityJump?: boolean };
}

const EDGES = ['l', 'r', 't', 'b'] as const;
const TOLERANCE = 1;
const shown = (box: Box | undefined): box is Box => box !== undefined && box.v === 'visible' && box.o > 0.01;

export const faultsIn = (
  frames: readonly Frame[],
  { duration, allow = {} }: { duration: number; allow?: Config['allow'] },
): string[] => {
  const faults: string[] = [];
  const first = frames[0];
  const last = frames.at(-1);
  if (first === undefined || last === undefined) return faults;

  const late = frames.find((frame) => frame.t > duration + 50 && frame.running > 0);
  if (late !== undefined) faults.push(`still moving at ${Math.round(late.t)} ms, past ${duration} ms`);

  for (const key of Object.keys(last.boxes)) {
    const start = first.boxes[key];
    const end = last.boxes[key];
    if (start === undefined || end === undefined) continue;
    for (let i = 1; i < frames.length; i++) {
      const before = frames[i - 1]!.boxes[key];
      const now = frames[i]!.boxes[key];
      if (before === undefined || now === undefined) continue;
      if (!allow.opacityJump && Math.abs(now.o - before.o) > 0.5) {
        faults.push(`${key}: opacity jumps ${before.o} → ${now.o} at ${Math.round(frames[i]!.t)} ms`);
        break;
      }
    }
    if (!allow.turnBack) {
      for (const edge of EDGES) {
        const way = Math.sign(end[edge] - start[edge]);
        for (let i = 1; i < frames.length; i++) {
          const before = frames[i - 1]!.boxes[key];
          const now = frames[i]!.boxes[key];
          if (!shown(before) || !shown(now)) continue;
          const step = now[edge] - before[edge];
          if (way === 0 ? Math.abs(step) > TOLERANCE : step * way < -TOLERANCE) {
            faults.push(
              `${key}: edge ${edge} turns back ${Math.round(before[edge])} → ${Math.round(now[edge])} at ${Math.round(frames[i]!.t)} ms (start ${Math.round(start[edge])}, end ${Math.round(end[edge])})`,
            );
            break;
          }
          if (Math.abs(end[edge] - start[edge]) > 8 * TOLERANCE && Math.abs(step) > Math.abs(end[edge] - start[edge]) * 0.6) {
            faults.push(
              `${key}: edge ${edge} snaps ${Math.round(before[edge])} → ${Math.round(now[edge])} in one frame at ${Math.round(frames[i]!.t)} ms`,
            );
            break;
          }
        }
      }
    }
    for (const [size, low, high] of [
      ['width', 'l', 'r'],
      ['height', 't', 'b'],
    ] as const) {
      const from = start[high] - start[low];
      const to = end[high] - end[low];
      const outside = frames.find((frame) => {
        const box = frame.boxes[key];
        if (!shown(box)) return false;
        const value = box[high] - box[low];
        return value < Math.min(from, to) - TOLERANCE || value > Math.max(from, to) + TOLERANCE;
      });
      if (outside !== undefined) {
        const box = outside.boxes[key]!;
        faults.push(
          `${key}: ${size} ${Math.round(box[high] - box[low])} at ${Math.round(outside.t)} ms, outside ${Math.round(from)}–${Math.round(to)}`,
        );
      }
    }
  }
  return faults;
};

export const landingJumps = (frames: readonly Frame[], limit = 8): string[] => {
  for (let i = 1; i < frames.length; i++) {
    const before = frames[i - 1]!;
    const now = frames[i]!;
    if (before.running === 0 || now.running > 0) continue;
    const jumps = Object.entries(now.boxes).flatMap(([key, box]) => {
      const was = before.boxes[key];
      if (!shown(box) || !shown(was)) return [];
      const step = Math.max(...EDGES.map((edge) => Math.abs(box[edge] - was[edge])));
      return step > limit ? [`${key}: jumps ${Math.round(step)} px as the motion stops at ${Math.round(now.t)} ms, cut short`] : [];
    });
    if (jumps.length > 0) return jumps;
  }
  return [];
};

export const startJumps = (frames: readonly Frame[], { limit = 8, share = 0.6, within = 4 } = {}): string[] => {
  const last = frames.at(-1);
  if (last === undefined) return [];
  for (let i = 1; i < Math.min(frames.length, within + 1); i++) {
    const before = frames[i - 1]!;
    const now = frames[i]!;
    const jumps = Object.entries(now.boxes).flatMap(([key, box]) => {
      const was = before.boxes[key];
      const end = last.boxes[key];
      if (!shown(box) || !shown(was) || end === undefined) return [];
      return EDGES.flatMap((edge) => {
        const step = Math.abs(box[edge] - was[edge]);
        const toGo = Math.abs(end[edge] - was[edge]);
        return step > limit && step > toGo * share
          ? [`${key}: edge ${edge} jumps ${Math.round(step)} of ${Math.round(toGo)} px as the move starts, at ${Math.round(now.t)} ms`]
          : [];
      }).slice(0, 1);
    });
    if (jumps.length > 0) return jumps;
  }
  return [];
};

export const layoutDifferences = (moved: Frame, stepped: Frame): string[] =>
  Object.entries(stepped.boxes).flatMap(([key, want]) => {
    const got = moved.boxes[key];
    if (got === undefined) return [`${key}: missing`];
    if (shown(got) !== shown(want)) return [`${key}: ${shown(want) ? 'hidden' : 'shown'}, should be ${shown(want) ? 'shown' : 'hidden'}`];
    if (!shown(want)) return [];
    const off = EDGES.filter((edge) => Math.abs(got[edge] - want[edge]) > TOLERANCE);
    return off.length === 0
      ? []
      : [`${key}: ${off.map((edge) => `${edge} ${Math.round(got[edge])}, should be ${Math.round(want[edge])}`).join('; ')}`];
  });

const DEFAULT_KEY = '(el) => el.id || el.getAttribute("aria-label") || el.textContent.trim().slice(0, 40)';

const startSampling = (page: Page, watch: string, key: string) =>
  page.evaluate(
    ({ watch, key }) => {
      const name = new Function(`return ${key}`)() as (el: Element) => string;
      const frames: Frame[] = [];
      const t0 = performance.now();
      const state = window as unknown as { motionFrames: Frame[]; motionStop: boolean };
      state.motionFrames = frames;
      state.motionStop = false;
      const tick = () => {
        const boxes: Record<string, Box> = {};
        for (const el of document.querySelectorAll(watch)) {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          boxes[name(el)] = { l: r.left, r: r.right, t: r.top, b: r.bottom, o: Number(s.opacity), v: s.visibility };
        }
        frames.push({ t: performance.now() - t0, running: document.getAnimations().length, boxes });
        if (!state.motionStop) requestAnimationFrame(tick);
      };
      tick();
    },
    { watch, key },
  );

const stopSampling = (page: Page) =>
  page.evaluate(() => {
    const state = window as unknown as { motionFrames: Frame[]; motionStop: boolean };
    state.motionStop = true;
    return state.motionFrames;
  }, undefined);

const settle = (duration: number) => duration + 200;

export const checkMotion = async (newPage: () => Promise<Page>, config: Config) => {
  const duration = config.duration ?? 400;
  const key = config.key ?? DEFAULT_KEY;
  const viewport = config.viewport ?? { width: 1440, height: 900 };
  const narrow = { width: Math.round(viewport.width * 0.7), height: Math.round(viewport.height * 0.8) };
  const report: Record<string, string[]> = {};

  const open = async (motion: 'reduce' | 'no-preference', sampleOpening = false) => {
    const page = await newPage();
    await page.emulateMedia({ reducedMotion: motion });
    await page.setViewportSize(viewport);
    await page.goto(config.url);
    await page.waitForSelector(config.watch);
    if (sampleOpening) {
      await startSampling(page, config.watch, key);
      await page.waitForTimeout(settle(duration));
      const frames = await stopSampling(page);
      const moving = frames.filter((frame) => frame.running > 0);
      report['at open'] = moving.length === 0 ? [] : [`${moving.length} frames move before the user does anything`];
    }
    await config.open?.(page);
    await page.waitForTimeout(settle(duration));
    return page;
  };

  const sampled = async (page: Page, run: () => Promise<unknown>) => {
    await startSampling(page, config.watch, key);
    await run();
    await page.waitForTimeout(settle(duration));
    return stopSampling(page);
  };

  const endState = async (page: Page) => (await sampled(page, async () => {})).at(-1)!;

  const plain = await open('no-preference', true);
  for (const move of config.moves) {
    report[move.name] = faultsIn(await sampled(plain, () => move.run(plain)), { duration, allow: config.allow });
  }

  const reduced = await open('reduce');
  const stepped: Frame[] = [];
  const reducedFaults: string[] = [];
  for (const move of config.moves) {
    const frames = await sampled(reduced, () => move.run(reduced));
    if (frames.some((frame) => frame.running > 0)) reducedFaults.push(`${move.name}: moves under reduced motion`);
    stepped.push(frames.at(-1)!);
  }
  report['reduced motion'] = reducedFaults;

  const resized = await open('reduce');
  const resizedEnds: Frame[] = [];
  for (const move of config.moves) {
    await move.run(resized);
    await resized.setViewportSize(narrow);
    await resized.waitForTimeout(settle(duration));
    resizedEnds.push(await endState(resized));
    await resized.setViewportSize(viewport);
    await resized.waitForTimeout(settle(duration));
  }

  const interrupted = await open('no-preference');
  for (const [i, move] of config.moves.entries()) {
    await move.run(interrupted);
    await interrupted.waitForTimeout(duration / 4);
    await interrupted.setViewportSize(narrow);
    await interrupted.waitForTimeout(settle(duration));
    report[`${move.name}, resized part-way`] = layoutDifferences(await endState(interrupted), resizedEnds[i]!);
    await interrupted.setViewportSize(viewport);
    await interrupted.waitForTimeout(settle(duration));
  }

  const doubled = await open('no-preference');
  for (const [i, move] of config.moves.entries()) {
    const next = config.moves[i + 1];
    await move.run(doubled);
    if (next === undefined) {
      await doubled.waitForTimeout(settle(duration));
      continue;
    }
    await doubled.waitForTimeout(duration / 4);
    const frames = await sampled(doubled, () => next.run(doubled));
    report[`${move.name}, then ${next.name} part-way`] = [
      ...startJumps(frames),
      ...landingJumps(frames),
      ...layoutDifferences(frames.at(-1)!, stepped[i + 1]!),
    ];
    break;
  }

  return report;
};

const main = async () => {
  const [configPath] = process.argv.slice(2);
  if (configPath === undefined) {
    console.error('usage: node motion-check.ts <config.mjs>');
    process.exit(2);
  }
  const config = (await import(pathToFileURL(resolve(configPath)).href)).default as Config;
  const require = createRequire(join(process.cwd(), 'package.json'));
  const { chromium } = require('@playwright/test') as {
    chromium: { launch(): Promise<{ newPage(): Promise<Page>; close(): Promise<void> }> };
  };
  const browser = await chromium.launch();
  try {
    const report = await checkMotion(() => browser.newPage(), config);
    let failed = false;
    for (const [check, faults] of Object.entries(report)) {
      console.log(faults.length === 0 ? `ok    ${check}` : `FAIL  ${check}`);
      for (const fault of faults) console.log(`        ${fault}`);
      failed ||= faults.length > 0;
    }
    process.exitCode = failed ? 1 : 0;
  } finally {
    await browser.close();
  }
};

if (import.meta.main) await main();
