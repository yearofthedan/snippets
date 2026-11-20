import type { Kind } from '../config.ts';
import type { ImportEdge } from '../facts.ts';
import { ConfigError, type Finding, type Rule } from '../rule.ts';
import { title } from './shared.ts';

/**
 * A module may import only from its own kind and the kinds its `dependsOn` lists. One finding per module pair,
 * however many statements cross the boundary. Its value counts the names imported.
 */
export const dependencyDirection: Rule = {
  id: 'dependency-direction',
  defaults: {},
  parseOptions: (raw, at) => {
    if (Object.keys(raw).length > 0) throw new ConfigError(`${at}: takes no options; the kind's dependsOn sets what it allows`);
    return {};
  },
  check: ({ module, kind, kindOf }) => {
    const crossing = new Map<string, ImportEdge[]>();
    for (const edge of module.imports) {
      const target = kindOf(edge.to);
      if (!target || target.name === kind.name || kind.dependsOn.includes(target.name)) continue;
      crossing.set(edge.to, [...(crossing.get(edge.to) ?? []), edge]);
    }
    return [...crossing].map(([to, edges]) => finding(module.file, kind, kindOf(to) as Kind, to, edges));
  },
};

const finding = (file: string, kind: Kind, target: Kind, to: string, edges: ImportEdge[]): Finding => {
  const names = [...new Set(edges.flatMap((edge) => edge.names))];
  const needs = names.length > 0 ? ` (${names.join(', ')})` : '';
  const vias = [...new Set(edges.flatMap((edge) => edge.via ?? []))];
  const via = vias.length > 0 ? ` through ${vias.join(', ')}` : '';
  const imports = edges.every((edge) => edge.typeOnly) ? 'imports types from' : 'imports';
  const advice = target.dependsOn.includes(kind.name)
    ? `This breaks the dependency direction, so the ${kind.name} should depend on a port it owns for what it needs${needs}, and the ${target.name} should implement it.`
    : `${title(kind.name)} ${allowed(kind)}${needs}, or allow ${kind.name} -> ${target.name} in the config if the dependency is intended.`;
  return {
    rule: dependencyDirection.id,
    key: `${dependencyDirection.id}:${file}->${to}`,
    file,
    line: edges[0].line,
    value: Math.max(1, names.length),
    message: `${title(kind.name)} module ${file} ${imports} ${target.name} ${to}${via}. ${advice}`,
    details: { fromKind: kind.name, toKind: target.name, edges },
  };
};

const allowed = (kind: Kind): string =>
  kind.dependsOn.length > 0
    ? `may depend on ${kind.dependsOn.join(', ')}, so move what it needs into one of those`
    : `may depend only on itself, so move what it needs into ${kind.name}`;
