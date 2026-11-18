import type { Unit, UnitGraph, UnitKind } from './facts.ts';

/**
 * Connected components of a unit graph (LCOM4). Only components holding at least one unit of a `counted` kind
 * are returned: a type or a piece of state nothing uses is not a separate responsibility.
 */
export const components = (graph: UnitGraph, counted: readonly UnitKind[]): Unit[][] => {
  const parent = graph.units.map((_, index) => index);
  const root = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  for (const [a, b] of graph.links) parent[root(a)] = root(b);

  const groups = new Map<number, Unit[]>();
  graph.units.forEach((unit, index) => {
    const key = root(index);
    groups.set(key, [...(groups.get(key) ?? []), unit]);
  });
  return [...groups.values()]
    .filter((group) => group.some((unit) => counted.includes(unit.kind)))
    .sort((a, b) => a[0].line - b[0].line);
};
