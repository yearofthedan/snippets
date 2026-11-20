import { classify, type Config, isExcluded } from './config.ts';
import type { ModuleFacts, Project } from './facts.ts';
import type { Finding } from './rule.ts';
import { unclassifiedDocs } from './rules/shared.ts';

/**
 * Runs each kind's enabled rules over its modules. A module that matches no kind gets an `unclassified` finding
 * instead: without a kind there is nothing to check it against.
 */
export const check = (config: Config, project: Project): Finding[] => {
  const modules = project.modules.filter((module) => !isExcluded(config, module.file));
  const kinds = new Map(modules.map((module) => [module.file, classify(config, module.file)]));
  const kindOf = (file: string) => kinds.get(file);
  return modules.flatMap((module) => {
    const kind = kindOf(module.file);
    if (!kind) return [unclassified(module)];
    return kind.rules.flatMap(({ rule, options }) =>
      rule.check({ module, kind, options, kindOf }).map((finding) => (rule.docs ? { ...finding, docs: rule.docs } : finding)),
    );
  });
};

const unclassified = (module: ModuleFacts): Finding => ({
  rule: 'unclassified',
  key: `unclassified:${module.file}`,
  file: module.file,
  line: 1,
  value: 1,
  message:
    `${module.file} matches no module kind, so no layer rule or threshold applies to it. ` +
    'Add a glob that covers it to a kind in the fitness config, or move it under an existing kind.',
  docs: unclassifiedDocs,
});
