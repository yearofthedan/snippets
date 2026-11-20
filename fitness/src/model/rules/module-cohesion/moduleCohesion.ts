import { components } from '../../components.ts';
import { type Rule, wholeNumberOptions } from '../../rule.ts';
import { group, type Group } from '../shared.ts';

const defaults = { maxLines: 200 };

/**
 * LCOM4 over a module's top-level code, checked once the module passes `maxLines`. A module whose functions and
 * classes form one connected group passes at any size.
 */
export const moduleCohesion: Rule<typeof defaults> = {
  id: 'module-cohesion',
  defaults,
  parseOptions: wholeNumberOptions(defaults),
  check: ({ module, options }) => {
    if (module.lines <= options.maxLines) return [];
    const groups = components(module.units, ['function', 'class', 'code']).map(group);
    if (groups.length <= 1) return [];
    return [
      {
        rule: 'module-cohesion',
        key: `module-cohesion:${module.file}`,
        file: module.file,
        line: 1,
        value: groups.length,
        limit: 1,
        message:
          `${module.file} is ${module.lines} lines (tripwire ${options.maxLines}) and its top-level code falls into ${groups.length} groups ` +
          `that share no calls, module state or types: ${groups.map(describe).join('; ')}. Each group can move to its own module.`,
        details: { lines: module.lines, tripwire: options.maxLines, groups },
      },
    ];
  },
};

const describe = (g: Group): string => `[${g.names.join(', ')}] (lines ${g.lines[0]}-${g.lines[1]})`;
