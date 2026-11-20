import { actionable, agentContext, type Reporter } from './reporter.ts';
import { diffText, line } from './text.ts';

/**
 * A `tool_result` handler result for omp, `{ additionalContext }`, which omp adds to the next request to the model.
 * The extension in integrations/omp returns it as is. Nothing is printed when there is nothing to act on.
 */
export const ompReporter: Reporter = {
  id: 'omp',
  render: (report) =>
    actionable(report).length === 0 ? '' : JSON.stringify({ additionalContext: agentContext(report, { delta: diffText, finding: line }) }),
};
