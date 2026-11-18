import { matchesGlob } from 'node:path';

export interface Thresholds {
  /** Module line count that triggers the module cohesion check. */
  maxLines: number;
  /** Function line count that triggers the function cohesion check. */
  maxFunctionLines: number;
  /** Highest cognitive complexity a function may have. */
  maxComplexity: number;
}

export interface Kind {
  name: string;
  match: string[];
  /** Kinds this kind may import from. Its own kind is always allowed. */
  dependsOn: string[];
  thresholds: Thresholds;
}

export interface Config {
  tsconfig: string;
  exclude: string[];
  kinds: Kind[];
}

export const defaultThresholds: Thresholds = { maxLines: 200, maxFunctionLines: 40, maxComplexity: 15 };

const alwaysExcluded = ['**/*.d.ts'];

export class ConfigError extends Error {}

/** Validates raw JSON from fitness.config.json. Kinds keep their declared order: the first match wins. */
export const parseConfig = (raw: unknown): Config => {
  const object = record(raw, 'config');
  known(object, ['tsconfig', 'exclude', 'thresholds', 'kinds'], 'config');
  if (object.tsconfig !== undefined && typeof object.tsconfig !== 'string') throw new ConfigError('tsconfig: expected a string');
  const shared = { ...defaultThresholds, ...thresholds(object.thresholds, 'thresholds') };
  const kinds = Object.entries(record(object.kinds ?? {}, 'kinds')).map(([name, value]): Kind => {
    const kind = record(value, `kinds.${name}`);
    known(kind, ['match', 'dependsOn', 'thresholds'], `kinds.${name}`);
    return {
      name,
      match: strings(kind.match, `kinds.${name}.match`),
      dependsOn: strings(kind.dependsOn ?? [], `kinds.${name}.dependsOn`),
      thresholds: { ...shared, ...thresholds(kind.thresholds, `kinds.${name}.thresholds`) },
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

const thresholds = (value: unknown, at: string): Partial<Thresholds> => {
  if (value === undefined) return {};
  const object = record(value, at);
  const result: Partial<Thresholds> = {};
  for (const key of Object.keys(defaultThresholds) as (keyof Thresholds)[]) {
    if (object[key] === undefined) continue;
    const number = object[key];
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) {
      throw new ConfigError(`${at}.${key}: expected a whole number of at least 1`);
    }
    result[key] = number;
  }
  known(object, Object.keys(defaultThresholds), at);
  return result;
};

const known = (object: Record<string, unknown>, keys: string[], at: string) => {
  const unknown = Object.keys(object).filter((key) => !keys.includes(key));
  if (unknown.length > 0) throw new ConfigError(`${at}: unknown key ${unknown.join(', ')}`);
};
