import type { Reporter } from './reporter.ts';

/** `{ findings }` for check and the delta (`added`, `worsened`, `resolved`) for diff. */
export const jsonReporter: Reporter = {
  id: 'json',
  render: (report) => JSON.stringify(report.mode === 'check' ? { findings: report.findings } : report.delta, null, 2),
};
