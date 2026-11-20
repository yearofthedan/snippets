#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { typescriptAnalyzer } from './analysis/typescript.ts';
import { checkProject } from './app/check.ts';
import { diffProject, parseRange } from './app/diff.ts';
import { builtinRegistry, unclassifiedDocs } from './builtins.ts';
import { findConfig, loadConfig } from './config/loadConfig.ts';
import { gitDirCache } from './git/cache.ts';
import { gitRepository, projectPathOf } from './git/repository.ts';
import { type Config, parseConfig } from './model/config.ts';
import { ConfigError } from './model/rule.ts';
import { reporters } from './reporters/index.ts';
import { actionable, type Report } from './reporters/reporter.ts';

const usage = `usage:
  fitness check [--config <file>] [--ruleset <name>] [--reporter <name>] [--fail]
  fitness diff <base>[..<head> | ...<head>] [--config <file>] [--ruleset <name>] [--reporter <name>] [--fail]
  fitness --print-config [--config <file>] [--ruleset <name>]

check   reports every finding in the working tree.
diff    reports findings that are new or worse at <head> than at <base>. Without <head>, compares the working tree.
        <base>...<head> compares from where <head> left <base>, as git does.

--config    path to the config file (default: the first of fitness.config.ts, .mts, .js, .mjs, .json)
--ruleset   a named export of the config: [config, ...overlays] merged in order (default: the default export)
--print-config  print the config as resolved, with each kind's rules and options, and exit
--reporter  ${[...reporters.keys()].join(', ')} (default: text)
--fail      exit 1 when there are findings (check) or new or worse findings (diff)`;

type Options = { config?: string; ruleset?: string; reporter: string; fail: boolean };
type Produce = (root: string, config: Config, digest: string) => Report;

const main = async (argv: string[]): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      ruleset: { type: 'string' },
      'print-config': { type: 'boolean', default: false },
      reporter: { type: 'string', default: 'text' },
      fail: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.help) return help(0);
  if (values['print-config'] && positionals.length === 0) return printConfig(values);
  if (command === 'check' && args.length === 0) return run(values, (root, config) => ({ mode: 'check', findings: checkProject(typescriptAnalyzer, root, config) }));
  if (command === 'diff' && args.length === 1) return run(values, (root, config, digest) => ({ mode: 'diff', delta: delta(args[0], root, config, digest) }));
  return help(2);
};

const help = (code: number): number => {
  (code === 0 ? console.log : console.error)(usage);
  return code;
};

const resolveConfig = async (options: Omit<Options, 'reporter' | 'fail'>) => {
  const configFile = realpathSync(options.config ? resolve(options.config) : findConfig(process.cwd()));
  const { raw, digest } = await loadConfig(configFile, options.ruleset);
  try {
    return { root: dirname(configFile), config: parseConfig(raw, builtinRegistry, { unclassifiedDocs }), digest };
  } catch (error) {
    if (error instanceof ConfigError && options.ruleset !== undefined) throw new ConfigError(`ruleset ${options.ruleset}: ${error.message}`);
    throw error;
  }
};

const run = async (options: Options, produce: Produce): Promise<number> => {
  const reporter = reporters.get(options.reporter);
  if (!reporter) throw new Error(`no reporter called ${options.reporter}: use one of ${[...reporters.keys()].join(', ')}`);
  try {
    const { root, config, digest } = await resolveConfig(options);
    const report = produce(root, config, digest);
    const output = reporter.render(report, { toolVersion: version(), projectPath: projectPathOf(root) });
    if (output) console.log(output);
    return options.fail && actionable(report).length > 0 ? 1 : 0;
  } catch (error) {
    return failed(error, reporter.failureExitCode);
  }
};

/** The config after defaults, the ruleset's overlays and each kind's own rules: what each kind is checked with. */
const printConfig = async (options: Omit<Options, 'reporter' | 'fail'>): Promise<number> => {
  const { config } = await resolveConfig(options);
  const kinds = config.kinds.map((kind) => [
    kind.name,
    { match: kind.match, dependsOn: kind.dependsOn, rules: Object.fromEntries(kind.rules.map(({ rule, options }) => [rule.id, options])) },
  ]);
  console.log(JSON.stringify({ tsconfig: config.tsconfig, exclude: config.exclude, kinds: Object.fromEntries(kinds) }, null, 2));
  return 0;
};

const delta = (range: string, root: string, config: Config, configDigest: string) =>
  diffProject(
    { range: parseRange(range), root, config, configDigest, toolVersion: version() },
    { analyzer: typescriptAnalyzer, repository: gitRepository(root), cache: gitDirCache(root) },
  );

const version = (): string => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

/** Says why the run failed and returns the exit code: the reporter's when there is one, else 2. */
const failed = (error: unknown, exitCode = 2): number => {
  console.error(error instanceof ConfigError ? `fitness config: ${error.message}` : error instanceof Error ? error.message : error);
  return exitCode;
};

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.exitCode = failed(error);
}
