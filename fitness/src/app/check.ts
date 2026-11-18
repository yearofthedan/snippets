import type { Config } from '../model/config.ts';
import { check, type Finding } from '../model/rules.ts';
import type { Analyzer } from './ports.ts';

export const checkProject = (analyzer: Analyzer, root: string, config: Config): Finding[] =>
  check(config, analyzer.analyze(root, config));
