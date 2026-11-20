import type { ModuleFacts } from './facts.ts';

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
