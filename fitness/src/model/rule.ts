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
  /** Options when the config gives none. */
  defaults: Options;
  /** Validates options from the config, at `at`, returning only the keys given. Throws ConfigError. */
  parseOptions: (raw: Record<string, unknown>, at: string) => Partial<Options>;
  check: (context: RuleContext<Options>) => Finding[];
}

export class ConfigError extends Error {}

/** Rules by id. Built-in rules come first; a project's own rules can join them under new ids. */
export const registry = (rules: readonly Rule[]): ReadonlyMap<string, Rule> => {
  const byId = new Map<string, Rule>();
  for (const rule of rules) {
    if (byId.has(rule.id)) throw new ConfigError(`rules: two rules have the id ${rule.id}`);
    byId.set(rule.id, rule);
  }
  return byId;
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
