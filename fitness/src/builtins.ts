import { registry } from './model/config.ts';
import type { Rule } from './model/rule.ts';
import { builtinRules } from './model/rules/index.ts';

/** Where this package's source is published. Each built-in rule's page is the README in its folder. */
const source = 'https://github.com/yearofthedan/snippets/blob/main/fitness';

const documented = (rule: Rule): Rule => ({ ...rule, docs: `${source}/src/model/rules/${rule.id}/README.md` });

/** The built-in rules as the CLI runs them, each linking to its page. */
export const builtinRegistry = registry(builtinRules.map(documented));

/** The page for `unclassified`, which the model reports rather than a rule. */
export const unclassifiedDocs = `${source}/docs/unclassified.md`;
