import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigError } from '../model/config.ts';

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

/** Where `import ... from 'fitness'` in a config leads: the running fitness, whether or not the project installed it. */
const entry = new URL(import.meta.url.endsWith('.ts') ? '../index.ts' : '../index.js', import.meta.url).href;
const ownFiles = new URL('../../', import.meta.url).href;

/**
 * Reads fitness.config.json, or imports a JS or TS config and takes its default export. Node strips the types, so a
 * TS config and the rules it imports need no build step.
 */
export const loadConfig = async (file: string): Promise<LoadedConfig> => {
  const digest = createHash('sha256');
  if (file.endsWith('.json')) {
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
    const module = await import(pathToFileURL(file).href);
    if (module.default === undefined) throw new ConfigError(`${file}: expected the config as its default export`);
    return { raw: module.default, digest: digest.digest('hex') };
  } finally {
    hooks.deregister();
  }
};
