import type { Unit } from '../facts.ts';

export interface Group {
  names: string[];
  lines: [number, number];
}

export const group = (units: Unit[]): Group => ({
  names: units.map((unit) => unit.name),
  lines: [Math.min(...units.map((unit) => unit.line)), Math.max(...units.map((unit) => unit.endLine))],
});

/** Names functions uniquely within a module, so two functions with the same name keep distinct keys. */
export const withOrdinals = <T extends { name: string }>(functions: T[]): [T, string][] => {
  const seen = new Map<string, number>();
  return functions.map((fn) => {
    const count = (seen.get(fn.name) ?? 0) + 1;
    seen.set(fn.name, count);
    return [fn, count === 1 ? fn.name : `${fn.name}#${count}`];
  });
};

export const title = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

const source = 'https://github.com/yearofthedan/snippets/blob/main/fitness';

/** Where a built-in rule's documentation lives, linked from its findings: the README in the rule's folder. */
export const ruleDocs = (id: string): string => `${source}/src/model/rules/${id}/README.md`;

/** The page for `unclassified`, which the model reports rather than a rule. */
export const unclassifiedDocs = `${source}/docs/unclassified.md`;
