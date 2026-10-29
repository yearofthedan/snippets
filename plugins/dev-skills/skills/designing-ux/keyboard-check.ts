import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from './motion-check.ts';

export interface Area {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface Stop extends Area {
  name: string;
  shown: Area;
  covered: string | null;
}

export interface Config {
  url: string;
  ready: string;
  presses?: number;
  viewport?: { width: number; height: number };
  open?: (page: Page) => Promise<unknown>;
}

const TOLERANCE = 1;

export const stopFaults = (stops: readonly Stop[]): string[] =>
  stops.flatMap((stop) => {
    const area = stop.shown;
    const out: (keyof Area)[] = (['l', 't'] as const).filter((edge) => stop[edge] < area[edge] - TOLERANCE);
    out.push(...(['r', 'b'] as const).filter((edge) => stop[edge] > area[edge] + TOLERANCE));
    if (out.length > 0) {
      return [`${stop.name}: off screen, ${out.map((edge) => `${edge} ${Math.round(stop[edge])} past ${Math.round(area[edge])}`).join('; ')}`];
    }
    return stop.covered === null ? [] : [`${stop.name}: covered by ${stop.covered}`];
  });

const tabThrough = async (page: Page, presses: number) => {
  const stops: Stop[] = [];
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const shown = { l: 0, r: innerWidth, t: 0, b: innerHeight };
      for (let up = el.parentElement; up !== null; up = up.parentElement) {
        if (getComputedStyle(up).overflow === 'visible') continue;
        const clip = up.getBoundingClientRect();
        shown.l = Math.max(shown.l, clip.left);
        shown.r = Math.min(shown.r, clip.right);
        shown.t = Math.max(shown.t, clip.top);
        shown.b = Math.min(shown.b, clip.bottom);
      }
      const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      const describe = (node: Element) =>
        `${node.tagName.toLowerCase()} "${(node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 40)}"`;
      return {
        name: describe(el),
        l: r.left,
        r: r.right,
        t: r.top,
        b: r.bottom,
        shown,
        covered: top === null || el.contains(top) ? null : describe(top),
      };
    }, undefined);
    if (stop === null) continue;
    if (stops.some((seen) => seen.name === stop.name && seen.l === stop.l && seen.t === stop.t)) break;
    stops.push(stop);
  }
  return stops;
};

export const checkKeyboard = async (newPage: () => Promise<Page>, config: Config) => {
  const viewport = config.viewport ?? { width: 1440, height: 900 };
  const narrow = { width: Math.round(viewport.width * 0.7), height: Math.round(viewport.height * 0.8) };
  const report: Record<string, string[]> = {};
  for (const [label, size] of [
    [`${viewport.width} px`, viewport],
    [`${narrow.width} px`, narrow],
  ] as const) {
    const page = await newPage();
    await page.setViewportSize(size);
    await page.goto(config.url);
    await page.waitForSelector(config.ready);
    await config.open?.(page);
    report[`Tab at ${label}`] = stopFaults(await tabThrough(page, config.presses ?? 60));
  }
  return report;
};

const main = async () => {
  const [configPath] = process.argv.slice(2);
  if (configPath === undefined) {
    console.error('usage: node keyboard-check.ts <config.mjs>');
    process.exit(2);
  }
  const config = (await import(pathToFileURL(resolve(configPath)).href)).default as Config;
  const require = createRequire(join(process.cwd(), 'package.json'));
  const { chromium } = require('@playwright/test') as {
    chromium: { launch(): Promise<{ newPage(): Promise<Page>; close(): Promise<void> }> };
  };
  const browser = await chromium.launch();
  try {
    const report = await checkKeyboard(() => browser.newPage(), config);
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
