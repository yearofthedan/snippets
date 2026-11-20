import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigError, mergeRuleset } from '../model/config.ts';

/** Looked for in this order when no config is named. */
export const configNames = ['fitness.config.ts', 'fitness.config.mts', 'fitness.config.js', 'fitness.config.mjs', 'fitness.config.json'];

export const findConfig = (dir: string): string => {
  const found = configNames.map((name) => join(dir, name)).find((file) => existsSync(file));
  if (!found) throw new ConfigError(`no config in ${dir}: add one of ${configNames.join(', ')}`);
  return found;
};

export interface LoadedConfig {
  /** The config as written, for parseConfig to validate. */
  raw: unknown;
  /**
   * A digest of the config and every file it imported outside fitness, so a cached diff base is redone when a
   * project's own rule changes.
   */
  digest: string;
}

/** The config as written: the default export, or the named `ruleset` export merged onto its base. */
const selectConfig = (module: Record<string, unknown>, file: string, ruleset?: string): unknown => {
  if (ruleset === undefined) {
    if (module.default === undefined) throw new ConfigError(`${file}: expected the config as its default export`);
    return module.default;
  }
  // Rulesets are the named exports that are arrays, so a config may export other values beside them.
  const names = Object.keys(module).filter((name) => name !== 'default' && Array.isArray(module[name]));
  if (!names.includes(ruleset)) {
    throw new ConfigError(`${file}: no ruleset called ${ruleset}. ${names.length > 0 ? `Rulesets: ${names.join(', ')}` : 'It exports none'}`);
  }
  return mergeRuleset(module[ruleset], `ruleset ${ruleset}`);
};

/** Where `import ... from 'fitness'` in a config leads: the running fitness, whether or not the project installed it. */
const entry = new URL(import.meta.url.endsWith('.ts') ? '../index.ts' : '../index.js', import.meta.url).href;
const ownFiles = new URL('../../', import.meta.url).href;

/**
 * Reads fitness.config.json, or imports a JS or TS config and takes its default export, or the named `ruleset` export
 * merged onto its base. Node strips the types, so a TS config and the rules it imports need no build step.
 */
export const loadConfig = async (file: string, ruleset?: string): Promise<LoadedConfig> => {
  const digest = createHash('sha256');
  if (file.endsWith('.json')) {
    if (ruleset !== undefined) throw new ConfigError(`${file}: a JSON config has no rulesets. Use a fitness.config.ts for --ruleset ${ruleset}`);
    const text = readFileSync(file, 'utf8');
    return { raw: JSON.parse(text), digest: digest.update(text).digest('hex') };
  }
  const hooks = registerHooks({
    resolve: (specifier, context, nextResolve) =>
      specifier === 'fitness' ? { url: entry, shortCircuit: true } : nextResolve(specifier, context),
    load: (url, context, nextLoad) => {
      const loaded = nextLoad(url, context);
      if (url.startsWith('file:') && !url.startsWith(ownFiles)) digest.update(url).update(String(loaded.source ?? ''));
      return loaded;
    },
  });
  try {
    const module: Record<string, unknown> = await import(pathToFileURL(file).href);
    return { raw: selectConfig(module, file, ruleset), digest: digest.digest('hex') };
  } finally {
    hooks.deregister();
  }
};
