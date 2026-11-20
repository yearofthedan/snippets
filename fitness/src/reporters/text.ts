import type { Delta } from '../model/diff.ts';
import type { Finding } from '../model/rule.ts';
import type { Reporter } from './reporter.ts';

export const textReporter: Reporter = {
  id: 'text',
  render: (report) => (report.mode === 'check' ? checkText(report.findings) : diffText(report.delta)),
};

const checkText = (findings: Finding[]): string =>
  findings.length === 0 ? 'No findings.' : [...findings.map(line), '', count(findings.length, 'finding')].join('\n');

export const diffText = (delta: Delta): string => {
  const lines = [
    ...delta.added.map((finding) => `new: ${line(finding)}`),
    ...delta.worsened.map((finding) => `worse (was ${finding.was}): ${line(finding)}`),
  ];
  const summary = `${count(delta.added.length, 'new finding')}, ${delta.worsened.length} worsened, ${delta.resolved.length} resolved.`;
  return [...lines, ...(lines.length > 0 ? [''] : []), summary].join('\n');
};

export const line = (finding: Finding): string => `${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`;

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;
