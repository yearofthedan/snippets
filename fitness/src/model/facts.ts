/**
 * What analysis extracts from a codebase. Paths are relative to the project root, with forward slashes.
 * Rules read only these facts, so they stay independent of the compiler that produced them.
 */

/** The modules a check reads: every file the tsconfig includes, less the config's exclusions. */
export interface Project {
  modules: ModuleFacts[];
}

export interface ModuleFacts {
  file: string;
  lines: number;
  imports: ImportEdge[];
  /** Top-level declarations and the references between them. */
  units: UnitGraph;
  functions: FunctionFacts[];
}

/**
 * One import or re-export statement's dependency on one module. Named imports resolve through barrels and
 * re-exports to the module that declares them, so one statement can produce several edges.
 */
export interface ImportEdge {
  from: string;
  to: string;
  /** The module the specifier resolved to, when it differs from `to` (a barrel or re-export). */
  via?: string;
  specifier: string;
  names: string[];
  /** `import type`, `import { type X }`, or every imported name declares only a type. */
  typeOnly: boolean;
  /**
   * The module passes these names on to its importers: `export ... from`, or an imported name it exports again with
   * `export { x }` or `export default x`. Such an import gets its own edge, apart from the names it only uses.
   */
  reExport?: true;
  line: number;
}

export type UnitKind = 'function' | 'class' | 'state' | 'type' | 'code';

export interface Unit {
  name: string;
  kind: UnitKind;
  line: number;
  endLine: number;
}

/** An undirected graph: an edge [a, b] links units[a] and units[b]. */
export interface UnitGraph {
  units: Unit[];
  links: [number, number][];
}

export interface FunctionFacts {
  name: string;
  line: number;
  endLine: number;
  lines: number;
  /** Body statements that touch a local or parameter, linked when they share one. */
  statements: UnitGraph;
  /** Undefined for nested functions: their complexity counts toward the enclosing function. */
  complexity?: Complexity;
}

export interface Complexity {
  total: number;
  increments: { line: number; amount: number; reason: string }[];
}
