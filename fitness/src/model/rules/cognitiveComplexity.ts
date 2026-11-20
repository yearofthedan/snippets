import { type Rule, wholeNumberOptions } from '../rule.ts';
import { ruleDocs, withOrdinals } from './shared.ts';

const defaults = { max: 15 };

/** Each outermost function's cognitive complexity, with nested functions counted into it, may be at most `max`. */
export const cognitiveComplexity: Rule<typeof defaults> = {
  id: 'cognitive-complexity',
  docs: ruleDocs('cognitive-complexity'),
  defaults,
  parseOptions: wholeNumberOptions(defaults),
  check: ({ module, options }) =>
    withOrdinals(module.functions).flatMap(([fn, name]) => {
      if (!fn.complexity || fn.complexity.total <= options.max) return [];
      const top = [...fn.complexity.increments].sort((a, b) => b.amount - a.amount || a.line - b.line).slice(0, 3);
      return [
        {
          rule: 'cognitive-complexity',
          key: `cognitive-complexity:${module.file}:${name}`,
          file: module.file,
          line: fn.line,
          value: fn.complexity.total,
          limit: options.max,
          message:
            `Function ${fn.name} in ${module.file}:${fn.line} has cognitive complexity ${fn.complexity.total} (limit ${options.max}). ` +
            `The largest increments: ${top.map((i) => `${i.reason} at line ${i.line} (+${i.amount})`).join(', ')}.`,
          details: { increments: fn.complexity.increments },
        },
      ];
    }),
};
