import { actionable, agentContext, type Reporter } from './reporter.ts';
import { diffText, line } from './text.ts';

/**
 * A Claude Code PostToolUse hook response. Its `additionalContext` reaches Claude as context for its next step
 * without blocking it. Nothing is printed when there is nothing to act on.
 */
export const claudeHookReporter: Reporter = {
  id: 'claude-hook',
  render: (report) =>
    actionable(report).length === 0
      ? ''
      : JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: agentContext(report, { delta: diffText, finding: line }) },
        }),
  // Claude Code treats exit 2 from a hook as blocking feedback; a broken run should only warn.
  failureExitCode: 1,
};
