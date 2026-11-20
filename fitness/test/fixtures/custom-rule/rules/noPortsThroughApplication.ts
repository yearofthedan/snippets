import { matchesGlob } from 'node:path';
import { ConfigError, type Rule } from 'fitness';

interface Options {
  /** Where the application layer keeps its ports. */
  ports: string[];
}

/**
 * The application layer re-exports its ports for adapters to implement, so dependency-direction lets any kind that
 * depends on application reach them. A UI module should call use cases, never hold a port.
 */
export const noPortsThroughApplication: Rule<Options> = {
  id: 'no-ports-through-application',
  docs: 'https://example.com/rules/no-ports-through-application',
  defaults: { ports: ['src/application/ports/**'] },
  parseOptions: (raw, at) => {
    const { ports, ...rest } = raw;
    if (Object.keys(rest).length > 0) throw new ConfigError(`${at}: unknown key ${Object.keys(rest).join(', ')}`);
    if (ports === undefined) return {};
    if (!Array.isArray(ports) || !ports.every((glob) => typeof glob === 'string')) throw new ConfigError(`${at}.ports: expected a list of globs`);
    return { ports };
  },
  check: ({ module, options }) =>
    module.imports
      .filter((edge) => edge.via && options.ports.some((glob) => matchesGlob(edge.to, glob)))
      .map((edge) => ({
        rule: 'no-ports-through-application',
        key: `no-ports-through-application:${module.file}->${edge.to}`,
        file: module.file,
        line: edge.line,
        value: edge.names.length,
        message: `${module.file} reaches the port ${edge.to} through ${edge.via}. Call a use case instead of holding the port.`,
      })),
};

export default { rules: [noPortsThroughApplication] };
