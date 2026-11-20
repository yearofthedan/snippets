import { matchesGlob } from 'node:path';
import { ConfigError, namespaced, noOptions, type Plugin, type Rule, registry as withRules } from './rule.ts';

export { ConfigError } from './rule.ts';

export interface EnabledRule {
  rule: Rule;
  options: object;
}

export interface Kind {
  name: string;
  match: string[];
  /** Kinds this kind may import from. Its own kind is always allowed. */
  dependsOn: string[];
  /** The rules that run on this kind's modules, with their options resolved. */
  rules: EnabledRule[];
}

export interface Config {
  tsconfig: string;
  exclude: string[];
  kinds: Kind[];
}

/** `false` turns a rule off, `true` turns it back on, and an object turns it on with those options. */
export type RuleSettings = Record<string, boolean | Record<string, unknown>>;

/** A config as written, in fitness.config.json or as the default export of a fitness.config.ts. */
export interface FitnessConfig {
  /** The tsconfig whose files are checked, relative to the config. Default `tsconfig.json`. */
  tsconfig?: string;
  exclude?: string | string[];
  /** A project's own rules by namespace. A rule `x` in plugin `ns` is `ns/x` in `rules`. */
  plugins?: Record<string, Plugin>;
  rules?: RuleSettings;
  kinds: Record<string, { match: string | string[]; dependsOn?: string | string[]; rules?: RuleSettings }>;
}

/** Types a fitness.config.ts. It returns the config unchanged. */
export const defineConfig = (config: FitnessConfig): FitnessConfig => config;

const alwaysExcluded = ['**/*.d.ts'];

/**
 * Validates a raw config against the rules in `registry` and the config's own plugins. Kinds keep their declared
 * order: the first match wins. Every registered rule runs on every kind unless the config turns it off.
 */
export const parseConfig = (raw: unknown, builtins: ReadonlyMap<string, Rule>): Config => {
  const object = record(raw, 'config');
  known(object, ['tsconfig', 'exclude', 'plugins', 'rules', 'kinds'], 'config');
  if (object.tsconfig !== undefined && typeof object.tsconfig !== 'string') throw new ConfigError('tsconfig: expected a string');
  const plugins = Object.entries(object.plugins === undefined ? {} : record(object.plugins, 'plugins'));
  const registry = withRules([...builtins.values(), ...plugins.flatMap(([namespace, plugin]) => namespaced(namespace, plugin, `plugins.${namespace}`))]);
  const shared = ruleSettings(object.rules, 'rules', registry);
  const kinds = Object.entries(record(object.kinds ?? {}, 'kinds')).map(([name, value]): Kind => {
    const kind = record(value, `kinds.${name}`);
    known(kind, ['match', 'dependsOn', 'rules'], `kinds.${name}`);
    return {
      name,
      match: strings(kind.match, `kinds.${name}.match`),
      dependsOn: strings(kind.dependsOn ?? [], `kinds.${name}.dependsOn`),
      rules: resolveRules(registry, shared, ruleSettings(kind.rules, `kinds.${name}.rules`, registry)),
    };
  });
  if (kinds.length === 0) throw new ConfigError('kinds: declare at least one module kind');
  const names = new Set(kinds.map((kind) => kind.name));
  for (const kind of kinds) {
    for (const target of kind.dependsOn) {
      if (!names.has(target)) throw new ConfigError(`kinds.${kind.name}.dependsOn: no kind called ${target}`);
    }
  }
  return {
    tsconfig: typeof object.tsconfig === 'string' ? object.tsconfig : 'tsconfig.json',
    exclude: [...alwaysExcluded, ...strings(object.exclude ?? [], 'exclude')],
    kinds,
  };
};

export const isExcluded = (config: Config, file: string): boolean => config.exclude.some((glob) => matchesGlob(file, glob));

export const classify = (config: Config, file: string): Kind | undefined =>
  config.kinds.find((kind) => kind.match.some((glob) => matchesGlob(file, glob)));

type Setting = { enabled: boolean; options: object };

const ruleSettings = (value: unknown, at: string, registry: ReadonlyMap<string, Rule>): Map<string, Setting> => {
  const settings = new Map<string, Setting>();
  for (const [id, setting] of Object.entries(value === undefined ? {} : record(value, at))) {
    const rule = registry.get(id);
    if (!rule) throw new ConfigError(`${at}: no rule called ${id}`);
    if (typeof setting === 'boolean') settings.set(id, { enabled: setting, options: {} });
    else settings.set(id, { enabled: true, options: (rule.parseOptions ?? noOptions)(record(setting, `${at}.${id}`), `${at}.${id}`) });
  }
  return settings;
};

/** Options layer as defaults, then the shared `rules`, then the kind's `rules`. */
const resolveRules = (registry: ReadonlyMap<string, Rule>, shared: Map<string, Setting>, own: Map<string, Setting>): EnabledRule[] =>
  [...registry.values()].flatMap((rule) => {
    const enabled = own.get(rule.id)?.enabled ?? shared.get(rule.id)?.enabled ?? true;
    const options = { ...(rule.defaults ?? {}), ...shared.get(rule.id)?.options, ...own.get(rule.id)?.options };
    return enabled ? [{ rule, options }] : [];
  });

const record = (value: unknown, at: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ConfigError(`${at}: expected an object`);
  return value as Record<string, unknown>;
};

const strings = (value: unknown, at: string): string[] => {
  const list = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(list) || !list.every((item) => typeof item === 'string')) {
    throw new ConfigError(`${at}: expected a string or a list of strings`);
  }
  return list;
};

const known = (object: Record<string, unknown>, keys: string[], at: string) => {
  const unknown = Object.keys(object).filter((key) => !keys.includes(key));
  if (unknown.length > 0) throw new ConfigError(`${at}: unknown key ${unknown.join(', ')}`);
};
