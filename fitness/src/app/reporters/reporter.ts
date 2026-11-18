import type { Delta } from '../../model/diff.ts';
import type { Finding } from '../../model/rule.ts';

export type Report = { mode: 'check'; findings: Finding[] } | { mode: 'diff'; delta: Delta };

export interface ReportContext {
  toolVersion: string;
  /** The project directory relative to the repository root, empty when they are the same or there is no repository. */
  projectPath: string;
}

/** Turns a result into output. An empty string means print nothing. */
export interface Reporter {
  id: string;
  render: (report: Report, context: ReportContext) => string;
}

/** The findings a report asks someone to act on: all of them for check, the new and worse ones for diff. */
export const actionable = (report: Report): Finding[] =>
  report.mode === 'check' ? report.findings : [...report.delta.added, ...report.delta.worsened];

/** What an agent reads after an edit: the delta for diff, every finding for check. */
export const agentContext = (report: Report, render: { delta: (delta: Delta) => string; finding: (finding: Finding) => string }): string =>
  report.mode === 'diff'
    ? `Architecture fitness changes since the base commit. Address them if this edit caused them:\n${render.delta(report.delta)}`
    : `Architecture fitness findings:\n${report.findings.map(render.finding).join('\n')}`;
