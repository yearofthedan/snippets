#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { typescriptAnalyzer } from './analysis/typescript.ts';
import { checkProject } from './app/check.ts';
import { diffProject, parseRange } from './app/diff.ts';
import { reporters } from './app/reporters/index.ts';
import { actionable, type Report } from './app/reporters/reporter.ts';
import { gitDirCache } from './git/cache.ts';
import { gitRepository, projectPathOf } from './git/repository.ts';
import { type Config, ConfigError, parseConfig } from './model/config.ts';
import { builtinRegistry } from './model/rules/index.ts';

const usage = `usage:
  fitness check [--config <file>] [--reporter <name>] [--fail]
  fitness diff <base>[..<head> | ...<head>] [--config <file>] [--reporter <name>] [--fail]

check   reports every finding in the working tree.
diff    reports findings that are new or worse at <head> than at <base>. Without <head>, compares the working tree.
        <base>...<head> compares from where <head> left <base>, as git does.

--config    path to the config file (default: fitness.config.json)
--reporter  ${[...reporters.keys()].join(', ')} (default: text)
--fail      exit 1 when there are findings (check) or new or worse findings (diff)`;

type Options = { config: string; reporter: string; fail: boolean; help: boolean };

const main = (argv: string[]): number => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string', default: 'fitness.config.json' },
      reporter: { type: 'string', default: 'text' },
      fail: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.help) return help(0);
  if (command === 'check' && args.length === 0) return run(values, (root, config) => ({ mode: 'check', findings: checkProject(typescriptAnalyzer, root, config) }));
  if (command === 'diff' && args.length === 1) return run(values, (root, config) => ({ mode: 'diff', delta: delta(args[0], root, config) }));
  return help(2);
};

const help = (code: number): number => {
  (code === 0 ? console.log : console.error)(usage);
  return code;
};

const run = (options: Options, produce: (root: string, config: Config) => Report): number => {
  const reporter = reporters.get(options.reporter);
  if (!reporter) throw new Error(`no reporter called ${options.reporter}: use one of ${[...reporters.keys()].join(', ')}`);
  const configFile = realpathSync(resolve(options.config));
  const root = dirname(configFile);
  const report = produce(root, parseConfig(JSON.parse(readFileSync(configFile, 'utf8')), builtinRegistry));
  const output = reporter.render(report, { toolVersion: version(), projectPath: projectPathOf(root) });
  if (output) console.log(output);
  return options.fail && actionable(report).length > 0 ? 1 : 0;
};

const delta = (range: string, root: string, config: Config) =>
  diffProject(
    { range: parseRange(range), root, config, toolVersion: version() },
    { analyzer: typescriptAnalyzer, repository: gitRepository(root), cache: gitDirCache(root) },
  );

const version = (): string => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof ConfigError ? `fitness config: ${error.message}` : error instanceof Error ? error.message : error);
  // Claude Code treats exit 2 from a hook as blocking feedback; a broken run should only warn.
  const argv = process.argv;
  const hook = argv.some((arg, index) => arg === '--reporter=claude-hook' || (arg === '--reporter' && argv[index + 1] === 'claude-hook'));
  process.exitCode = hook ? 1 : 2;
}
