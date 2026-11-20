import type { Kind } from '../config.ts';
import type { ImportEdge } from '../facts.ts';
import { ConfigError, type Finding, type Rule } from '../rule.ts';
import { ruleDocs, title } from './shared.ts';

export interface NoCrossKindReexportOptions {
  /** Kinds this kind may re-export from, such as the kinds a composition root wires together. */
  allow: string[];
}

/**
 * A module may re-export only what its own kind declares. Passing on another kind's names lets the importers reach
 * that kind through this one, so dependency-direction reports each importer while this rule reports where the leak
 * starts. One finding per module pair; its value counts the names re-exported.
 */
export const noCrossKindReexport: Rule<NoCrossKindReexportOptions> = {
  id: 'no-cross-kind-reexport',
  docs: ruleDocs('no-cross-kind-reexport'),
  defaults: { allow: [] },
  parseOptions: (raw, at) => {
    const unknown = Object.keys(raw).filter((key) => key !== 'allow');
    if (unknown.length > 0) throw new ConfigError(`${at}: unknown key ${unknown.join(', ')}`);
    if (raw.allow === undefined) return {};
    const allow = typeof raw.allow === 'string' ? [raw.allow] : raw.allow;
    if (!Array.isArray(allow) || !allow.every((item) => typeof item === 'string')) {
      throw new ConfigError(`${at}.allow: expected a kind name or a list of kind names`);
    }
    return { allow };
  },
  check: ({ module, kind, options, kindOf }) => {
    const leaking = new Map<string, ImportEdge[]>();
    for (const edge of module.imports) {
      if (!edge.reExport) continue;
      const target = kindOf(edge.to);
      if (!target || target.name === kind.name || options.allow.includes(target.name)) continue;
      leaking.set(edge.to, [...(leaking.get(edge.to) ?? []), edge]);
    }
    return [...leaking].map(([to, edges]) => finding(module.file, kind, kindOf(to) as Kind, to, edges));
  },
};

const finding = (file: string, kind: Kind, target: Kind, to: string, edges: ImportEdge[]): Finding => {
  const names = [...new Set(edges.flatMap((edge) => edge.names))];
  const what = names.length > 0 ? names.join(', ') : 'everything';
  const id = noCrossKindReexport.id;
  return {
    rule: id,
    key: `${id}:${file}->${to}`,
    file,
    line: edges[0].line,
    value: Math.max(1, names.length),
    message:
      `${title(kind.name)} module ${file} re-exports ${what} from ${target.name} ${to}, so its importers reach ${target.name} ` +
      `through ${kind.name}. Have importers that may depend on ${target.name} import it from ${to}, and give the rest a ` +
      `${kind.name} API that hides it, or allow ${target.name} in this rule's options if ${kind.name} is meant to expose it.`,
    details: { fromKind: kind.name, toKind: target.name, names, edges },
  };
};
