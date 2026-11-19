/**
 * An omp extension that runs `fitness diff` after each file edit and hands any new or worse findings to the model as
 * additional context for its next request, without blocking the edit. Copy or link it into the project's
 * `.omp/extensions/` (or `~/.omp/agent/extensions/` for every project).
 *
 * FITNESS_BASE sets the ref to diff against (default HEAD). FITNESS_COMMAND sets the command (default `fitness`),
 * such as `pnpm exec fitness` for a project's own dev dependency.
 */

type ToolResultEvent = { toolName: string; isError: boolean };
type ToolResultEventResult = { additionalContext?: string };
type ExecResult = { stdout: string; stderr: string; code: number };
type Context = { cwd: string };

export type Extension = {
  on(event: 'tool_result', handler: (event: ToolResultEvent, context: Context) => Promise<ToolResultEventResult | undefined>): void;
  exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
};

/** omp's built-in tools that change files. */
export const editTools = new Set(['edit', 'write', 'ast_edit', 'apply_patch']);

export default function fitness(pi: Extension, env: Record<string, string | undefined> = process.env): void {
  // Split on spaces, so `pnpm exec fitness` runs a project's own dev dependency.
  const [command, ...prefix] = (env.FITNESS_COMMAND ?? 'fitness').trim().split(/\s+/);
  const base = env.FITNESS_BASE ?? 'HEAD';
  pi.on('tool_result', async (event, context) => {
    if (event.isError || !editTools.has(event.toolName)) return undefined;
    const run = await pi.exec(command, [...prefix, 'diff', base, '--reporter', 'omp'], { cwd: context.cwd, timeout: 60_000 });
    // A broken run (no config, not a repository) stays out of the model's context.
    if (run.code !== 0 || run.stdout.trim() === '') return undefined;
    return JSON.parse(run.stdout) as ToolResultEventResult;
  });
}
