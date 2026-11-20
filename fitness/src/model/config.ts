import { matchesGlob } from 'node:path';
import { ConfigError, type EnabledRule, type Kind, noOptions, type Plugin, type Rule } from './rule.ts';

export interface Config {
  tsconfig: string;
  exclude: string[];
  kinds: Kind[];
  /** A link to the page on `unclassified` findings, which the model reports rather than a rule. */
  unclassifiedDocs?: string;
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

/** Rules by id. Built-in rules come first; a project's own rules join them under namespaced ids. */
export const registry = (rules: readonly Rule[]): ReadonlyMap<string, Rule> => {
  const byId = new Map<string, Rule>();
  for (const rule of rules) {
    if (byId.has(rule.id)) throw new ConfigError(`rules: two rules have the id ${rule.id}`);
    byId.set(rule.id, rule);
  }
  return byId;
};

const name = /^[a-z][a-z0-9-]*$/;

/**
 * A plugin's rules under `namespace/`. Their findings get the namespaced rule id, and keys prefixed by the namespace,
 * so they can't collide with a built-in rule's or another plugin's.
 */
export const namespaced = (namespace: string, plugin: unknown, at: string): Rule[] => {
  if (!name.test(namespace)) throw new ConfigError(`${at}: a namespace is lowercase letters, digits and dashes`);
  const rules = typeof plugin === 'object' && plugin !== null ? (plugin as { rules?: unknown }).rules : undefined;
  if (!Array.isArray(rules)) throw new ConfigError(`${at}: expected a plugin, { rules: Rule[] }, imported in a fitness.config.ts`);
  return rules.map((rule: Rule, index): Rule => {
    if (typeof rule?.id !== 'string' || !name.test(rule.id)) {
      throw new ConfigError(`${at}.rules[${index}]: a rule id is lowercase letters, digits and dashes`);
    }
    if (typeof rule.check !== 'function') throw new ConfigError(`${at}.rules[${index}]: ${rule.id} has no check function`);
    const id = `${namespace}/${rule.id}`;
    return {
      ...rule,
      id,
      check: (context) => rule.check(context).map((finding) => ({ ...finding, rule: id, key: `${namespace}/${finding.key}` })),
    };
  });
};

const alwaysExcluded = ['**/*.d.ts'];

/**
 * Validates a raw config against the rules in `registry` and the config's own plugins. Kinds keep their declared
 * order: the first match wins. Every registered rule runs on every kind unless the config turns it off.
 * `unclassifiedDocs` comes from whoever ships the rules, as their own `docs` links do.
 */
export const parseConfig = (raw: unknown, builtins: ReadonlyMap<string, Rule>, { unclassifiedDocs }: { unclassifiedDocs?: string } = {}): Config => {
  const object = record(raw, 'config');
  known(object, ['tsconfig', 'exclude', 'plugins', 'rules', 'kinds'], 'config');
  if (object.tsconfig !== undefined && typeof object.tsconfig !== 'string') throw new ConfigError('tsconfig: expected a string');
  const plugins = Object.entries(object.plugins === undefined ? {} : record(object.plugins, 'plugins'));
  const rules = registry([...builtins.values(), ...plugins.flatMap(([namespace, plugin]) => namespaced(namespace, plugin, `plugins.${namespace}`))]);
  const shared = ruleSettings(object.rules, 'rules', rules);
  const kinds = Object.entries(record(object.kinds ?? {}, 'kinds')).map(([name, value]): Kind => {
    const kind = record(value, `kinds.${name}`);
    known(kind, ['match', 'dependsOn', 'rules'], `kinds.${name}`);
    return {
      name,
      match: strings(kind.match, `kinds.${name}.match`),
      dependsOn: strings(kind.dependsOn ?? [], `kinds.${name}.dependsOn`),
      rules: resolveRules(rules, shared, ruleSettings(kind.rules, `kinds.${name}.rules`, rules)),
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
    ...(unclassifiedDocs ? { unclassifiedDocs } : {}),
  };
};

/** Which files analysis reads: the tsconfig's, less the excluded ones. */
export type AnalysisScope = Pick<Config, 'tsconfig' | 'exclude'>;

export const isExcluded = ({ exclude }: Pick<AnalysisScope, 'exclude'>, file: string): boolean => exclude.some((glob) => matchesGlob(file, glob));

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

export const record = (value: unknown, at: string): Record<string, unknown> => {
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
