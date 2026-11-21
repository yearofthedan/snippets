// node src/main.ts <project root> [config module]   → writes a markdown report to stdout
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEdges } from './edges.ts';
import { buildModel, type Unit } from './model.ts';
import type { WarpConfig } from './w.ts';

const projectRoot = resolve(process.argv[2] ?? '../../working-title');
const configPath = resolve(process.argv[3] ?? 'configs/working-title.ts');
const config = (await import(pathToFileURL(configPath).href)).default as WarpConfig;

const started = performance.now();
const { files, edges } = loadEdges(projectRoot);
const analysed = performance.now();
const model = buildModel(projectRoot, config, files);
const verdicts = edges.map((e) => ({ edge: e, ...model.verdict(e.from, e.to, e.external) }));
const judged = performance.now();

const out: string[] = [];
const p = (s = '') => out.push(s);
const uniq = <T>(xs: T[], key: (x: T) => string) => [...new Map(xs.map((x) => [key(x), x])).values()];

p(`# Spike run: ${projectRoot.split('/').pop()}`);
p();
p(`${files.length} files, ${edges.length} edges (${edges.filter((e) => e.external).length} external). Analysis ${Math.round(analysed - started)} ms, model + verdicts ${Math.round(judged - analysed)} ms.`);
p();
p('## Units');
p();
p('```');
const tree = (u: Unit, depth: number) => {
  const parts = new Map<string, number>();
  u.files.forEach((part) => parts.set(part, (parts.get(part) ?? 0) + 1));
  const summary = [...parts].map(([k, n]) => `${k}:${n}`).join(' ');
  p(`${'  '.repeat(depth)}${u.id}  [${u.archetype?.name ?? 'plain'}${u.partName ? ` as ${u.partName}` : ''}]  ${summary}`);
  u.children.forEach((c) => tree(c, depth + 1));
};
tree(model.root, 0);
p('```');
p();

const problems = uniq(model.problems, (x) => `${x.kind}|${x.subject}|${x.detail}`);
for (const kind of ['config', 'tie', 'loose'] as const) {
  const list = problems.filter((x) => x.kind === kind);
  p(`## ${kind === 'config' ? 'Config errors' : kind === 'tie' ? 'Ties' : 'Unclaimed (loose) files'} (${list.length})`);
  p();
  list.forEach((x) => p(`- \`${x.subject}\`: ${x.detail}`));
  p();
}

const findings = verdicts.filter((v) => !v.allowed);
p(`## Findings (${findings.length} of ${verdicts.length} edges)`);
p();
const byPair = uniq(findings, (f) => `${f.edge.from}->${f.edge.to}`);
for (const f of byPair) {
  p(`- \`${f.edge.from}\` → \`${f.edge.to}\`${f.edge.typeOnly ? ' (type)' : ''}${f.edge.external ? ' (pkg)' : ''}: ${f.why}`);
}
p();

// The doc's working title edge table, judged with this model (hypothetical edges included).
const ui = 'src/ui/project';
const docTable: [string, string, boolean][] = [
  [`${ui}/project.dom.ts`, `${ui}/graph/graph.dom.ts`, true],
  [`${ui}/project.dom.ts`, `${ui}/graph/card/card.dom.ts`, false],
  [`${ui}/graph/graph.dom.ts`, `${ui}/panel/panel.dom.ts`, false],
  [`${ui}/graph/card/card.dom.ts`, 'src/ui/icons/open-beside.dom.ts', true],
  [`${ui}/graph/card/card.ts`, 'src/ui/icons/open-beside.dom.ts', false],
  [`${ui}/graph/card/card.ts`, `${ui}/graph/card/card.dom.ts`, false],
  [`${ui}/graph/card/card.dsl.ts`, 'src/test-helpers/playwright.driver.ts', false],
  [`${ui}/graph/graph.component.test.ts`, `${ui}/graph/card/card.test-page.ts`, true],
  ['src/app.ts', `${ui}/project.dom.ts`, true],
  ['src/app.ts', `${ui}/graph/card/card.dom.ts`, false],
  [`${ui}/graph/graph.ts`, `${ui}/graph/card/card.ts`, false],
  [`${ui}/project.dom.ts`, 'src/shell.ts', false],
  ['src/domain/project.ts', 'src/test-helpers/staging.ts', false],
];
p('## Doc edge table');
p();
p('| Edge | Doc | Spike | In code | Why |');
p('| --- | --- | --- | --- | --- |');
for (const [from, to, expected] of docTable) {
  const v = model.verdict(from, to);
  const inCode = edges.some((e) => e.from === from && e.to === to);
  p(`| \`${from.replace('src/ui/', '')}\` → \`${to.replace('src/ui/', '')}\` | ${expected ? '✅' : '❌'} | ${v.allowed ? '✅' : '❌'}${v.allowed === expected ? '' : ' **differs**'} | ${inCode ? 'yes' : 'no'} | ${v.why} |`);
}
p();

if (process.argv.includes('--where')) {
  p('## Where every file landed');
  p();
  files.forEach((f) => p(`- \`${f}\`: ${model.where(f)}`));
}

console.log(out.join('\n'));
