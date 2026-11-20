import { SyntaxKind } from 'typescript/ast';
import type { ExportDeclaration, Identifier, ImportDeclaration, SourceFile, Statement, StringLiteralLikeNode } from 'typescript/ast';
import {
  isExportAssignment,
  isExportDeclaration,
  isIdentifier,
  isImportDeclaration,
  isNamedExports,
  isNamedImports,
  isNamespaceImport,
  isStringLiteralLikeNode,
} from 'typescript/ast/is';
import { type Checker, type Program, SymbolFlags } from 'typescript/sync';
import type { ImportEdge } from '../model/facts.ts';
import type { Source } from './source.ts';

export interface Resolver {
  checker: Checker;
  program: Program;
  /** Maps a compiler path to a project-relative file, or undefined for files outside the project. */
  relative: (pathOrFileName: string) => string | undefined;
}

interface Binding {
  identifier: Identifier;
  typeOnly: boolean;
  reExport: boolean;
}

/**
 * Import and re-export edges of one module, resolved through barrels to the declaring modules. Imported names the
 * module exports again (`export { x }`, `export default x`) get an edge of their own marked as a re-export.
 */
export const importEdges = (source: Source, resolver: Resolver): ImportEdge[] => {
  const exported = locallyExportedNames(source.sourceFile);
  return source.sourceFile.statements.flatMap((statement) => statementEdges(statement, exported, source, resolver));
};

const statementEdges = (statement: Statement, exported: Set<string>, source: Source, resolver: Resolver): ImportEdge[] => {
  const declaration = moduleDeclaration(statement, exported);
  if (!declaration) return [];
  const resolved = resolver.program.getResolvedModuleFromModuleSpecifier(declaration.specifier, source.sourceFile.fileName);
  const via = resolved?.resolvedFileName ? resolver.relative(resolved.resolvedFileName) : undefined;
  if (!via) return [];

  const edge = (to: string, names: string[], typeOnly: boolean, reExport: boolean): ImportEdge => ({
    from: source.file,
    to,
    ...(to === via ? {} : { via }),
    specifier: declaration.specifier.text,
    names,
    typeOnly,
    ...(reExport ? { reExport } : {}),
    line: source.line(statement),
  });
  if (declaration.bindings.length === 0) return [edge(via, [], declaration.typeOnly, declaration.reExport)];

  const byTarget = new Map<string, { to: string; names: string[]; typeOnly: boolean; reExport: boolean }>();
  for (const binding of declaration.bindings) {
    const target = resolveBinding(binding, source, resolver) ?? { file: via, typeOnly: false };
    const key = `${target.file}\0${binding.reExport}`;
    const entry = byTarget.get(key) ?? { to: target.file, names: [], typeOnly: true, reExport: binding.reExport };
    entry.names.push(binding.identifier.text);
    entry.typeOnly &&= declaration.typeOnly || binding.typeOnly || target.typeOnly;
    byTarget.set(key, entry);
  }
  return [...byTarget.values()].map(({ to, names, typeOnly, reExport }) => edge(to, names, typeOnly, reExport));
};

interface ModuleStatement {
  specifier: StringLiteralLikeNode;
  typeOnly: boolean;
  /** The statement passes everything it names on, as `export ... from` does. */
  reExport: boolean;
  bindings: Binding[];
}

const moduleDeclaration = (statement: Statement, exported: Set<string>): ModuleStatement | undefined =>
  isImportDeclaration(statement)
    ? importStatement(statement, exported)
    : isExportDeclaration(statement)
      ? reExportStatement(statement)
      : undefined;

/** Names the module exports without declaring them in the export statement: `export { x }`, `export default x`. */
const locallyExportedNames = (sourceFile: SourceFile): Set<string> => {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const local = element.propertyName ?? element.name;
        if (isIdentifier(local)) names.add(local.text);
      }
    } else if (isExportAssignment(statement) && isIdentifier(statement.expression)) {
      names.add(statement.expression.text);
    }
  }
  return names;
};

const importStatement = (statement: ImportDeclaration, exported: Set<string>): ModuleStatement | undefined => {
  if (!isStringLiteralLikeNode(statement.moduleSpecifier)) return undefined;
  const clause = statement.importClause;
  const named = clause?.namedBindings;
  const binding = (identifier: Identifier, typeOnly: boolean): Binding => ({ identifier, typeOnly, reExport: exported.has(identifier.text) });
  const bindings: Binding[] = [
    ...(clause?.name ? [binding(clause.name, false)] : []),
    ...(named && isNamespaceImport(named) ? [binding(named.name, false)] : []),
    ...(named && isNamedImports(named) ? named.elements.map((element) => binding(element.name, element.isTypeOnly)) : []),
  ];
  return { specifier: statement.moduleSpecifier, typeOnly: clause?.phaseModifier === SyntaxKind.TypeKeyword, reExport: false, bindings };
};

const reExportStatement = (statement: ExportDeclaration): ModuleStatement | undefined => {
  if (!statement.moduleSpecifier || !isStringLiteralLikeNode(statement.moduleSpecifier)) return undefined;
  const clause = statement.exportClause;
  const elements = clause && isNamedExports(clause) ? clause.elements : [];
  const bindings = elements.flatMap((element) =>
    isIdentifier(element.name) ? [{ identifier: element.name, typeOnly: element.isTypeOnly, reExport: true }] : [],
  );
  return { specifier: statement.moduleSpecifier, typeOnly: statement.isTypeOnly, reExport: true, bindings };
};

/** Follows an imported name through every alias to the project module that declares it. */
const resolveBinding = (binding: Binding, source: Source, resolver: Resolver): { file: string; typeOnly: boolean } | undefined => {
  const symbol = source.symbolOf(binding.identifier);
  if (!symbol || !(symbol.flags & SymbolFlags.Alias)) return undefined;
  const target = resolver.checker.getAliasedSymbol(symbol);
  if (resolver.checker.isUnknownSymbol(target)) return undefined;
  const file = target.declarations.map((declaration) => resolver.relative(declaration.path)).find((path) => path !== undefined);
  if (!file) return undefined;
  return { file, typeOnly: (target.flags & SymbolFlags.Value) === 0 };
};
