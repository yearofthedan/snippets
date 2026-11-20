import type { Config } from '../model/config.ts';
import { check } from '../model/check.ts';
import type { Finding } from '../model/rule.ts';
import type { Analyzer } from './ports.ts';

export const checkProject = (analyzer: Analyzer, root: string, config: Config): Finding[] =>
  check(config, analyzer.analyze(root, { tsconfig: config.tsconfig, exclude: config.exclude }));
