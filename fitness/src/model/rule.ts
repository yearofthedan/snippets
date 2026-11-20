import type { Kind } from './config.ts';
import type { ModuleFacts } from './facts.ts';

export interface Finding {
  /** The id of the rule that reported it, or `unclassified`. */
  rule: string;
  /** Stable identity across commits, used by diff. */
  key: string;
  file: string;
  line: number;
  /** Compared by diff: a higher value for the same key is a worsened finding. */
  value: number;
  limit?: number;
  message: string;
  /** A link to the rule's documentation: what it flags, why, and how to fix it. */
  docs?: string;
  details?: unknown;
}

export interface RuleContext<Options> {
  module: ModuleFacts;
  kind: Kind;
  options: Options;
  /** The kind of any module in the project, undefined for unclassified or excluded ones. */
  kindOf: (file: string) => Kind | undefined;
}

/**
 * One fitness check. A rule reads the facts analysis extracted once for the whole project, never the source, so it
 * stays pure and any rule can be added without touching analysis.
 */
export interface Rule<Options extends object = object> {
  /** The name the config and findings use. */
  id: string;
  /** A link to the rule's documentation, attached to its findings. */
  docs?: string;
  /** Options when the config gives none. Without it, the rule takes no options. */
  defaults?: Options;
  /**
   * Validates options from the config, at `at`, returning only the keys given. Throws ConfigError. Without it, any
   * option given is refused.
   */
  parseOptions?: (raw: Record<string, unknown>, at: string) => Partial<Options>;
  check: (context: RuleContext<Options>) => Finding[];
}

/** A project's own rules, listed in the config under a namespace that prefixes their ids. */
export interface Plugin {
  // Each rule has its own options type, which a list of Rule<object> would refuse.
  rules: readonly Rule<any>[];
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

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

/** The parseOptions of a rule that declares none: it takes no options. */
export const noOptions = (raw: Record<string, unknown>, at: string): Partial<object> => {
  const keys = Object.keys(raw);
  if (keys.length > 0) throw new ConfigError(`${at}: unknown key ${keys.join(', ')}`);
  return {};
};

/** A parseOptions for rules whose options are all whole-number limits of at least 1. */
export const wholeNumberOptions =
  <Options extends Record<string, number>>(defaults: Options) =>
  (raw: Record<string, unknown>, at: string): Partial<Options> => {
    const unknown = Object.keys(raw).filter((key) => !(key in defaults));
    if (unknown.length > 0) throw new ConfigError(`${at}: unknown key ${unknown.join(', ')}`);
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new ConfigError(`${at}.${key}: expected a whole number of at least 1`);
      }
    }
    return raw as Partial<Options>;
  };
