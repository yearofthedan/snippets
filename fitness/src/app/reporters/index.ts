import { claudeHookReporter } from './claudeHook.ts';
import { jsonReporter } from './json.ts';
import { ompReporter } from './omp.ts';
import type { Reporter } from './reporter.ts';
import { sarifReporter } from './sarif.ts';
import { textReporter } from './text.ts';

export const reporters: ReadonlyMap<string, Reporter> = new Map(
  [textReporter, jsonReporter, claudeHookReporter, ompReporter, sarifReporter].map((reporter) => [reporter.id, reporter]),
);
