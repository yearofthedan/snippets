import { ConfigError, type FitnessConfig, record, type RuleSettings } from './config.ts';

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
  const [first, ...overlays] = ruleset;
  const base = record(first, `${at}[0]`);
  const kinds = record(base.kinds ?? {}, 'kinds');
  const { shared, perKind } = layersOf(overlays, Object.keys(kinds), at);
  const merged = Object.fromEntries(
    Object.entries(kinds).map(([name, value]) => {
      const layers = perKind.get(name);
      if (!layers) return [name, value];
      const kind = record(value, `kinds.${name}`);
      return [name, { ...kind, rules: mergeRules(kind.rules, `kinds.${name}.rules`, layers) }];
    }),
  );
  return { ...base, ...(shared.length > 0 ? { rules: mergeRules(base.rules, 'rules', shared) } : {}), kinds: merged };
};

type Layer = { rules: unknown; at: string };

/** Each scope's rule settings from every overlay, in order: the top level, then each kind by name. */
const layersOf = (overlays: unknown[], kinds: string[], at: string) => {
  const shared: Layer[] = [];
  const perKind = new Map<string, Layer[]>();
  overlays.forEach((value, index) => {
    const where = `${at}[${index + 1}]`;
    const overlay = record(value, where);
    onlyRules(overlay, ['rules', 'kinds'], where);
    if (overlay.rules !== undefined) shared.push({ rules: overlay.rules, at: `${where}.rules` });
    for (const [name, kindValue] of Object.entries(overlay.kinds === undefined ? {} : record(overlay.kinds, `${where}.kinds`))) {
      const kind = record(kindValue, `${where}.kinds.${name}`);
      onlyRules(kind, ['rules'], `${where}.kinds.${name}`);
      if (!kinds.includes(name)) throw new ConfigError(`${where}.kinds: no kind called ${name} in the base config`);
      perKind.set(name, [...(perKind.get(name) ?? []), { rules: kind.rules, at: `${where}.kinds.${name}.rules` }]);
    }
  });
  return { shared, perKind };
};

/**
 * Folds the overlays' settings for one scope onto the base's, rule by rule. A rule's options are kept while it is
 * off, so `false` and then `true` brings back the options it had.
 */
const mergeRules = (base: unknown, baseAt: string, layers: Layer[]): Record<string, unknown> => {
  const isOptions = (value: unknown): value is object => typeof value === 'object' && value !== null;
  const state = new Map<string, { enabled: boolean; options?: object }>();
  for (const { rules, at } of [{ rules: base, at: baseAt }, ...layers]) {
    for (const [id, setting] of Object.entries(rules === undefined ? {} : record(rules, at))) {
      const was = state.get(id);
      if (typeof setting === 'boolean') state.set(id, { ...was, enabled: setting });
      else if (isOptions(setting)) state.set(id, { enabled: true, options: { ...was?.options, ...setting } });
      // Anything else is passed through for parseConfig to refuse, with its path.
      else state.set(id, { enabled: true, options: setting as object });
    }
  }
  return Object.fromEntries([...state].map(([id, { enabled, options }]) => [id, enabled ? (options ?? true) : false]));
};

const onlyRules = (object: Record<string, unknown>, keys: string[], at: string) => {
  const unknown = Object.keys(object).filter((key) => !keys.includes(key));
  if (unknown.length > 0) {
    throw new ConfigError(`${at}: a ruleset overlay sets rules only, not ${unknown.join(', ')}. Change those in the base config.`);
  }
};
