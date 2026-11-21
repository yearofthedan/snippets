// Edges for the spike. Internal edges come from fitness's analyzer (TS 7.1, resolved through barrels to the
// declaring file). Fitness drops package and asset imports, so a crude specifier scan adds those.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { typescriptAnalyzer } from '../../fitness/src/analysis/typescript.ts';

export interface Edge {
  from: string;
  to: string; // a project file, or the specifier for an external edge
  external?: boolean;
  typeOnly: boolean;
  line: number;
  names: string[];
}

const specifierPattern = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

export const loadEdges = (root: string): { files: string[]; edges: Edge[] } => {
  const project = typescriptAnalyzer.analyze(root, { tsconfig: 'tsconfig.json', exclude: [] });
  const files = new Set(project.modules.map((m) => m.file));
  const edges: Edge[] = [];
  for (const module of project.modules) {
    for (const edge of module.imports) {
      edges.push({ from: module.file, to: edge.to, typeOnly: edge.typeOnly, line: edge.line, names: edge.names });
    }
    const text = readFileSync(join(root, module.file), 'utf8');
    for (const match of text.matchAll(specifierPattern)) {
      const specifier = match[3] ?? match[4];
      if (!specifier) continue;
      const line = text.slice(0, match.index).split('\n').length + (match[0].startsWith('\n') ? 1 : 0);
      const typeOnly = Boolean(match[2]);
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        edges.push({ from: module.file, to: specifier, external: true, typeOnly, line, names: [] });
      } else if (!/\.[cm]?[jt]sx?$/.test(specifier) && /\.[a-z0-9]+$/i.test(specifier)) {
        const asset = normalize(join(dirname(module.file), specifier));
        if (existsSync(join(root, asset)) && !edges.some((e) => e.from === module.file && e.to === asset)) {
          files.add(asset);
          edges.push({ from: module.file, to: asset, typeOnly: false, line, names: [] });
        }
      }
    }
  }
  return { files: [...files].sort(), edges };
};
