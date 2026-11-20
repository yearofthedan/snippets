import type { Finding } from '../model/rule.ts';
import { actionable, type ReportContext, type Reporter, ruleDocs } from './reporter.ts';

/**
 * SARIF 2.1.0, the format GitHub code scanning reads to annotate pull requests. Paths are relative to the repository
 * root, and each result's fingerprint is the finding's key, so code scanning tracks it across commits as diff does.
 */
export const sarifReporter: Reporter = {
  id: 'sarif',
  render: (report, context) => {
    const findings = actionable(report);
    const docs = new Map(ruleDocs(findings));
    const rules = [...new Set(findings.map((finding) => finding.rule))].sort();
    return JSON.stringify(
      {
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        version: '2.1.0',
        runs: [
          {
            tool: {
              driver: {
                name: 'fitness',
                version: context.toolVersion,
                informationUri: 'https://github.com/yearofthedan/snippets/tree/main/fitness',
                rules: rules.map((id) => ({ id, shortDescription: { text: id }, ...(docs.has(id) ? { helpUri: docs.get(id) } : {}) })),
              },
            },
            results: findings.map((finding) => result(finding, context)),
          },
        ],
      },
      null,
      2,
    );
  },
};

const result = (finding: Finding, context: ReportContext) => ({
  ruleId: finding.rule,
  level: 'warning',
  message: { text: finding.message },
  locations: [
    {
      physicalLocation: {
        artifactLocation: { uri: context.projectPath ? `${context.projectPath}/${finding.file}` : finding.file },
        region: { startLine: finding.line },
      },
    },
  ],
  partialFingerprints: { 'fitnessKey/v1': finding.key },
});
