// Asks TS 7.1's language server for completions inside a config, to check autocomplete rather than infer it from
// error messages. Run: node probe/completions.ts
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pnpm = resolve('node_modules/.pnpm');
const native = readdirSync(pnpm).find((d) => d.startsWith('@typescript+typescript-linux'))!;
const exe = join(pnpm, native, 'node_modules/@typescript', native.split('+')[1]!.split('@')[0]!, 'lib/tsc');
const file = resolve(process.argv[2] ?? 'probe/completion-target.ts');
const uri = pathToFileURL(file).href;
const text = readFileSync(file, 'utf8');

const server = spawn(exe, ['--lsp', '--stdio']);
let buffer = Buffer.alloc(0);
const waiting = new Map<number, (r: unknown) => void>();
server.stdout.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const header = buffer.indexOf('\r\n\r\n');
    if (header < 0) return;
    const length = Number(/Content-Length: (\d+)/.exec(buffer.subarray(0, header).toString())![1]);
    if (buffer.length < header + 4 + length) return;
    const message = JSON.parse(buffer.subarray(header + 4, header + 4 + length).toString());
    buffer = buffer.subarray(header + 4 + length);
    if (message.id !== undefined && waiting.has(message.id)) waiting.get(message.id)!(message.result);
    else if (message.id !== undefined && message.method) send({ id: message.id, result: null });
  }
});
const send = (m: object) => {
  const body = JSON.stringify({ jsonrpc: '2.0', ...m });
  server.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
};
let next = 1;
const request = (method: string, params: object) =>
  new Promise<unknown>((done) => { const id = next++; waiting.set(id, done); send({ id, method, params }); });

await request('initialize', { processId: process.pid, rootUri: pathToFileURL(resolve('.')).href, capabilities: {} });
send({ method: 'initialized', params: {} });
send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'typescript', version: 1, text } } });

const lines = text.split('\n');
for (const [index, line] of lines.entries()) {
  if (line.trimStart().startsWith('//')) continue;
  for (const match of line.matchAll(/\/\*\|\*\//g)) {
  const marker = match.index;
  const result = (await request('textDocument/completion', { textDocument: { uri }, position: { line: index, character: marker } })) as
    | { items: { label: string }[] }
    | { label: string }[]
    | null;
  const items = (Array.isArray(result) ? result : result?.items ?? []).map((i) => i.label).filter((l) => !/^[A-Z_]/.test(l) || l.length < 3);
  const before = line.slice(0, marker).trim().split(/[\s[(,]+/).pop();
  console.log(`${before!.padEnd(24)} → ${items.slice(0, 12).join(', ')}${items.length > 12 ? ', …' : ''}`);
  }
}
server.kill();
