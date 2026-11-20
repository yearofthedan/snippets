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

/** What a ruleset changes on top of its base: rules only, never the kinds' globs or dependencies. */
export interface RulesetOverlay {
  rules?: RuleSettings;
  kinds?: Record<string, { rules: RuleSettings }>;
}

/** A named export of a fitness.config.ts: a base config and the overlays fitness merges onto it, in order. */
export type Ruleset = readonly [FitnessConfig, ...RulesetOverlay[]];

/**
 * Merges a ruleset into one config as written. Top-level `rules` merge by rule id, and a kind's `rules` merge by kind
 * name and then rule id. An overlay's options merge into the base's for the same rule, `false` turns the rule off,
 * and `true` turns it on and keeps the base's options. Anything else in an overlay is refused: the architecture is the
 * same in every ruleset, only what is checked against it changes.
 */
export const mergeRuleset = (ruleset: unknown, at: string): Record<string, unknown> => {
  if (!Array.isArray(ruleset) || ruleset.length === 0) throw new ConfigError(`${at}: expected a ruleset, [config, ...overlays]`);
  const [base, ...overlays] = ruleset;
  return overlays.reduce<Record<string, unknown>>((config, overlay, index) => applyOverlay(config, overlay, `${at}[${index + 1}]`), record(base, `${at}[0]`));
};

const applyOverlay = (config: Record<string, unknown>, value: unknown, at: string): Record<string, unknown> => {
  const overlay = record(value, at);
  onlyRules(overlay, ['rules', 'kinds'], at);
  const kinds = record(config.kinds ?? {}, 'kinds');
  const changed = Object.entries(overlay.kinds === undefined ? {} : record(overlay.kinds, `${at}.kinds`)).map(([name, value]) => {
    const kind = record(value, `${at}.kinds.${name}`);
    onlyRules(kind, ['rules'], `${at}.kinds.${name}`);
    if (!(name in kinds)) throw new ConfigError(`${at}.kinds: no kind called ${name} in the base config`);
    const own = record(kinds[name], `kinds.${name}`);
    return [name, { ...own, rules: mergeRules(own.rules, kind.rules, `${at}.kinds.${name}.rules`) }];
  });
  return {
    ...config,
    ...(overlay.rules === undefined ? {} : { rules: mergeRules(config.rules, overlay.rules, `${at}.rules`) }),
    kinds: { ...kinds, ...Object.fromEntries(changed) },
  };
};

const mergeRules = (base: unknown, overlay: unknown, at: string): Record<string, unknown> => {
  const merged = { ...(base === undefined ? {} : record(base, at)) };
  for (const [id, setting] of Object.entries(overlay === undefined ? {} : record(overlay, at))) {
    const was = merged[id];
    const isOptions = (value: unknown) => typeof value === 'object' && value !== null;
    if (setting === true && isOptions(was)) continue;
    merged[id] = isOptions(setting) && isOptions(was) ? { ...(was as object), ...(setting as object) } : setting;
  }
  return merged;
};

const onlyRules = (object: Record<string, unknown>, keys: string[], at: string) => {
  const unknown = Object.keys(object).filter((key) => !keys.includes(key));
  if (unknown.length > 0) {
    throw new ConfigError(`${at}: a ruleset overlay sets rules only, not ${unknown.join(', ')}. Change those in the base config.`);
  }
};

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
