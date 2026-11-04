type ToolCall = { toolName: string; input: Record<string, unknown> };
type ToolCallResult = { block: true; reason: string } | undefined;

export type Extension = {
  on(event: 'tool_call', handler: (event: ToolCall) => ToolCallResult): void;
};

const reason =
  'This call holds the shell for as long as it runs: it waits for readiness or never times out, and has no `name`. Give it a `name` to start it as a service, which keeps the shell free and stops with `proc://<name>/kill`.';

const holdsTheShell = (input: Record<string, unknown>): boolean => {
  if (typeof input.name === 'string' && input.name !== '') return false;
  const waitsForReadiness = typeof input.ready === 'object' && input.ready !== null;
  const neverTimesOut = input.pty === true && input.timeout === 0;
  return waitsForReadiness || neverTimesOut;
};

export default function refuseAServerInTheShell(pi: Extension): void {
  pi.on('tool_call', (event) =>
    event.toolName === 'bash' && holdsTheShell(event.input) ? { block: true, reason } : undefined,
  );
}
