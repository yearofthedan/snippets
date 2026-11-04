type ToolCall = { toolName: string; input: Record<string, unknown> };
type Context = { agent?: { kind?: string } };
type ToolCallResult = { block: true; reason: string } | undefined;

export type Extension = {
  on(event: 'before_agent_start', handler: (event: { prompt?: unknown }, context: Context) => void): void;
  on(event: 'assistant_message', handler: (event: { message?: { content?: unknown } }, context: Context) => void): void;
  on(event: 'tool_call', handler: (event: ToolCall, context: Context) => ToolCallResult): void;
};

const reason =
  "The builder's latest message asks a question. Answer it in prose first; make the edit after, if it still follows from the answer.";

const REMINDERS = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const URL_SCHEME = /^(?!file:\/\/)[a-z][a-z0-9+.-]*:\/\//i;

/* shortcut: an edit made through `bash` or `eval` is not refused; refuse those once a session is seen to edit that way before answering. */
const editsAFile = ({ toolName, input }: ToolCall): boolean => {
  if (toolName === 'edit' || toolName === 'ast_edit') return true;
  if (toolName !== 'write') return false;
  const path = typeof input.path === 'string' ? input.path : '';
  return !URL_SCHEME.test(path) || path.startsWith('xd://ast_edit');
};

export default function refuseAnEditBeforeAnAnswer(pi: Extension): void {
  let unanswered = false;
  const main = (context: Context): boolean => context.agent?.kind !== 'sub';
  /* shortcut: only a message whose text ends in `?` counts, so a question followed by an instruction, or one asked without the mark, is not caught; read the whole message once a session is seen to act on such a question first. */
  pi.on('before_agent_start', (event, context) => {
    if (main(context))
      unanswered = typeof event.prompt === 'string' && event.prompt.replace(REMINDERS, '').trimEnd().endsWith('?');
  });
  pi.on('assistant_message', (event, context) => {
    const content = event.message?.content;
    const writesText =
      Array.isArray(content) &&
      content.some((block) => block?.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '');
    if (main(context) && writesText) unanswered = false;
  });

  pi.on('tool_call', (event, context) =>
    main(context) && unanswered && editsAFile(event) ? { block: true, reason } : undefined,
  );
}
