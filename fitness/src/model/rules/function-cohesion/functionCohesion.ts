import { components } from '../../components.ts';
import { type Rule, wholeNumberOptions } from '../../rule.ts';
import { group, ruleDocs, withOrdinals } from '../shared.ts';

const defaults = { maxLines: 40 };

/** LCOM4 over a function's statements, checked once the function passes `maxLines`. */
export const functionCohesion: Rule<typeof defaults> = {
  id: 'function-cohesion',
  docs: ruleDocs('function-cohesion'),
  defaults,
  parseOptions: wholeNumberOptions(defaults),
  check: ({ module, options }) =>
    withOrdinals(module.functions).flatMap(([fn, name]) => {
      if (fn.lines <= options.maxLines) return [];
      const groups = components(fn.statements, ['code']).map(group);
      if (groups.length <= 1) return [];
      return [
        {
          rule: 'function-cohesion',
          key: `function-cohesion:${module.file}:${name}`,
          file: module.file,
          line: fn.line,
          value: groups.length,
          limit: 1,
          message:
            `Function ${fn.name} in ${module.file}:${fn.line} is ${fn.lines} lines (tripwire ${options.maxLines}) and its statements fall into ` +
            `${groups.length} groups that share no locals: ${groups.map((g) => `lines ${g.lines[0]}-${g.lines[1]}`).join('; ')}. ` +
            'Each group can become its own function.',
          details: { lines: fn.lines, tripwire: options.maxLines, groups },
        },
      ];
    }),
};
