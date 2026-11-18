#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { typescriptAnalyzer } from './analysis/typescript.ts';
import { checkProject } from './app/check.ts';
import { diffProject, parseRange } from './app/diff.ts';
import { checkReport, diffReport } from './app/report.ts';
import { gitDirCache } from './git/cache.ts';
import { gitRepository } from './git/repository.ts';
import { ConfigError, parseConfig } from './model/config.ts';
import { builtinRegistry } from './model/rules/index.ts';

const usage = `usage:
  fitness check [--config <file>] [--json] [--fail]
  fitness diff <base>[..<head> | ...<head>] [--config <file>] [--json | --hook] [--fail]

check   reports every finding in the working tree.
diff    reports findings that are new or worse at <head> than at <base>. Without <head>, compares the working tree.
        <base>...<head> compares from where <head> left <base>, as git does.

--config  path to the config file (default: fitness.config.json)
--json    print findings as JSON
--hook    print a Claude Code PostToolUse hook response, and nothing when there is no delta
--fail    exit 1 when there are findings (check) or new or worse findings (diff)`;

type Options = { config: string; json: boolean; hook: boolean; fail: boolean; help: boolean };

const main = (argv: string[]): number => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string', default: 'fitness.config.json' },
      json: { type: 'boolean', default: false },
      hook: { type: 'boolean', default: false },
      fail: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.help) return help(0);
  if (command === 'check' && args.length === 0) return check(values);
  if (command === 'diff' && args.length === 1) return diff(args[0], values);
  return help(2);
};

const help = (code: number): number => {
  (code === 0 ? console.log : console.error)(usage);
  return code;
};

const load = (options: Options) => {
  const configFile = realpathSync(resolve(options.config));
  return { root: dirname(configFile), config: parseConfig(JSON.parse(readFileSync(configFile, 'utf8')), builtinRegistry) };
};

const check = (options: Options): number => {
  const { root, config } = load(options);
  const findings = checkProject(typescriptAnalyzer, root, config);
  console.log(options.json ? JSON.stringify({ findings }, null, 2) : checkReport(findings));
  return options.fail && findings.length > 0 ? 1 : 0;
};

const diff = (range: string, options: Options): number => {
  const { root, config } = load(options);
  const delta = diffProject(
    { range: parseRange(range), root, config, toolVersion: version() },
    { analyzer: typescriptAnalyzer, repository: gitRepository(root), cache: gitDirCache(root) },
  );
  const changed = delta.added.length + delta.worsened.length > 0;
  const output = options.hook ? changed && JSON.stringify(hookResponse(diffReport(delta))) : options.json ? JSON.stringify(delta, null, 2) : diffReport(delta);
  if (output) console.log(output);
  return options.fail && changed ? 1 : 0;
};

const hookResponse = (report: string) => ({
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: `Architecture fitness changes since the base commit. Address them if this edit caused them:\n${report}`,
  },
});

const version = (): string => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof ConfigError ? `fitness config: ${error.message}` : error instanceof Error ? error.message : error);
  // Claude Code treats exit 2 from a hook as blocking feedback; a broken run should only warn.
  process.exitCode = process.argv.includes('--hook') ? 1 : 2;
}
