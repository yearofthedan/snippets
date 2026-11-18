import { components } from './components.ts';
import { classify, type Config, isExcluded, type Kind } from './config.ts';
import type { ImportEdge, ModuleFacts, Project, Unit } from './facts.ts';

export type Rule = 'unclassified' | 'dependency-direction' | 'module-cohesion' | 'function-cohesion' | 'cognitive-complexity';

export interface Finding {
  rule: Rule;
  /** Stable identity across commits, used by diff. */
  key: string;
  file: string;
  line: number;
  /** Compared by diff: a higher value for the same key is a worsened finding. */
  value: number;
  limit?: number;
  message: string;
  details?: unknown;
}

export interface Group {
  names: string[];
  lines: [number, number];
}

export const check = (config: Config, project: Project): Finding[] => {
  const modules = project.modules.filter((module) => !isExcluded(config, module.file));
  const kinds = new Map(modules.map((module) => [module.file, classify(config, module.file)]));
  return modules.flatMap((module) => {
    const kind = kinds.get(module.file);
    if (!kind) return [unclassified(module)];
    return [
      ...dependencyDirection(module, kind, kinds),
      ...moduleCohesion(module, kind),
      ...functionCohesion(module, kind),
      ...cognitiveComplexity(module, kind),
    ];
  });
};

const unclassified = (module: ModuleFacts): Finding => ({
  rule: 'unclassified',
  key: `unclassified:${module.file}`,
  file: module.file,
  line: 1,
  value: 1,
  message:
    `${module.file} matches no module kind, so no layer rule or threshold applies to it. ` +
    'Add a glob that covers it to a kind in the fitness config, or move it under an existing kind.',
});

/** One finding per module pair, however many statements cross the boundary. Its value counts the names imported. */
const dependencyDirection = (module: ModuleFacts, kind: Kind, kinds: Map<string, Kind | undefined>): Finding[] => {
  const crossing = new Map<string, ImportEdge[]>();
  for (const edge of module.imports) {
    const target = kinds.get(edge.to);
    if (!target || target.name === kind.name || kind.dependsOn.includes(target.name)) continue;
    crossing.set(edge.to, [...(crossing.get(edge.to) ?? []), edge]);
  }
  return [...crossing].map(([to, edges]) => {
    const target = kinds.get(to) as Kind;
    const names = [...new Set(edges.flatMap((edge) => edge.names))];
    const needs = names.length > 0 ? ` (${names.join(', ')})` : '';
    const vias = [...new Set(edges.flatMap((edge) => edge.via ?? []))];
    const via = vias.length > 0 ? ` through ${vias.join(', ')}` : '';
    const imports = edges.every((edge) => edge.typeOnly) ? 'imports types from' : 'imports';
    const advice = target.dependsOn.includes(kind.name)
      ? `This breaks the dependency direction, so the ${kind.name} should depend on a port it owns for what it needs${needs}, and the ${target.name} should implement it.`
      : `${title(kind.name)} ${allowed(kind)}${needs}, or allow ${kind.name} -> ${target.name} in the config if the dependency is intended.`;
    return {
      rule: 'dependency-direction',
      key: `dependency-direction:${module.file}->${to}`,
      file: module.file,
      line: edges[0].line,
      value: Math.max(1, names.length),
      message: `${title(kind.name)} module ${module.file} ${imports} ${target.name} ${to}${via}. ${advice}`,
      details: { fromKind: kind.name, toKind: target.name, edges },
    };
  });
};

const moduleCohesion = (module: ModuleFacts, kind: Kind): Finding[] => {
  const limit = kind.thresholds.maxLines;
  if (module.lines <= limit) return [];
  const groups = components(module.units, ['function', 'class', 'code']).map(group);
  if (groups.length <= 1) return [];
  return [
    {
      rule: 'module-cohesion',
      key: `module-cohesion:${module.file}`,
      file: module.file,
      line: 1,
      value: groups.length,
      limit: 1,
      message:
        `${module.file} is ${module.lines} lines (tripwire ${limit}) and its top-level code falls into ${groups.length} groups ` +
        `that share no calls, module state or types: ${groups.map(describe).join('; ')}. Each group can move to its own module.`,
      details: { lines: module.lines, tripwire: limit, groups },
    },
  ];
};

const functionCohesion = (module: ModuleFacts, kind: Kind): Finding[] => {
  const limit = kind.thresholds.maxFunctionLines;
  return withOrdinals(module.functions).flatMap(([fn, name]) => {
    if (fn.lines <= limit) return [];
    const groups = components(fn.statements, ['code']).map(group);
    if (groups.length <= 1) return [];
    return [
      {
        rule: 'function-cohesion',
        key: `function-cohesion:${module.file}:${name}`,
        file: module.file,
        line: fn.line,
        value: groups.length,
        limit: 1,
        message:
          `Function ${fn.name} in ${module.file}:${fn.line} is ${fn.lines} lines (tripwire ${limit}) and its statements fall into ` +
          `${groups.length} groups that share no locals: ${groups.map((g) => `lines ${g.lines[0]}-${g.lines[1]}`).join('; ')}. ` +
          'Each group can become its own function.',
        details: { lines: fn.lines, tripwire: limit, groups },
      },
    ];
  });
};

const cognitiveComplexity = (module: ModuleFacts, kind: Kind): Finding[] => {
  const limit = kind.thresholds.maxComplexity;
  return withOrdinals(module.functions).flatMap(([fn, name]) => {
    if (!fn.complexity || fn.complexity.total <= limit) return [];
    const top = [...fn.complexity.increments].sort((a, b) => b.amount - a.amount || a.line - b.line).slice(0, 3);
    return [
      {
        rule: 'cognitive-complexity',
        key: `cognitive-complexity:${module.file}:${name}`,
        file: module.file,
        line: fn.line,
        value: fn.complexity.total,
        limit,
        message:
          `Function ${fn.name} in ${module.file}:${fn.line} has cognitive complexity ${fn.complexity.total} (limit ${limit}). ` +
          `The largest increments: ${top.map((i) => `${i.reason} at line ${i.line} (+${i.amount})`).join(', ')}.`,
        details: { increments: fn.complexity.increments },
      },
    ];
  });
};

/** Names functions uniquely within a module, so two anonymous functions keep distinct keys. */
const withOrdinals = <T extends { name: string }>(functions: T[]): [T, string][] => {
  const seen = new Map<string, number>();
  return functions.map((fn) => {
    const count = (seen.get(fn.name) ?? 0) + 1;
    seen.set(fn.name, count);
    return [fn, count === 1 ? fn.name : `${fn.name}#${count}`];
  });
};

const group = (units: Unit[]): Group => ({
  names: units.map((unit) => unit.name),
  lines: [Math.min(...units.map((unit) => unit.line)), Math.max(...units.map((unit) => unit.endLine))],
});

const describe = (g: Group): string => `[${g.names.join(', ')}] (lines ${g.lines[0]}-${g.lines[1]})`;

const allowed = (kind: Kind): string =>
  kind.dependsOn.length > 0
    ? `may depend on ${kind.dependsOn.join(', ')}, so move what it needs into one of those`
    : `may depend only on itself, so move what it needs into ${kind.name}`;

const title = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);
