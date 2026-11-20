import type { Finding } from './rule.ts';

export interface Delta {
  /** Findings whose key is absent at the base. */
  added: Finding[];
  /** Findings whose value rose since the base, with the base value. */
  worsened: (Finding & { was: number })[];
  /** Keys present at the base and gone at the head. */
  resolved: Finding[];
}

export const diff = (base: Finding[], head: Finding[]): Delta => {
  const before = new Map(base.map((finding) => [finding.key, finding]));
  const after = new Set(head.map((finding) => finding.key));
  const delta: Delta = { added: [], worsened: [], resolved: base.filter((finding) => !after.has(finding.key)) };
  for (const finding of head) {
    const was = before.get(finding.key);
    if (!was) delta.added.push(finding);
    else if (finding.value > was.value) delta.worsened.push({ ...finding, was: was.value });
  }
  return delta;
};
