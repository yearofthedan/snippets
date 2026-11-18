import { SyntaxKind } from 'typescript/ast';
import type { ExportDeclaration, Identifier, ImportDeclaration, Statement, StringLiteralLikeNode } from 'typescript/ast';
import {
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
}

/** Import and re-export edges of one module, resolved through barrels to the declaring modules. */
export const importEdges = (source: Source, resolver: Resolver): ImportEdge[] =>
  source.sourceFile.statements.flatMap((statement) => statementEdges(statement, source, resolver));

const statementEdges = (statement: Statement, source: Source, resolver: Resolver): ImportEdge[] => {
  const declaration = moduleDeclaration(statement);
  if (!declaration) return [];
  const resolved = resolver.program.getResolvedModuleFromModuleSpecifier(declaration.specifier, source.sourceFile.fileName);
  const via = resolved?.resolvedFileName ? resolver.relative(resolved.resolvedFileName) : undefined;
  if (!via) return [];

  const edge = (to: string, names: string[], typeOnly: boolean): ImportEdge => ({
    from: source.file,
    to,
    ...(to === via ? {} : { via }),
    specifier: declaration.specifier.text,
    names,
    typeOnly,
    line: source.line(statement),
  });
  if (declaration.bindings.length === 0) return [edge(via, [], declaration.typeOnly)];

  const byTarget = new Map<string, { names: string[]; typeOnly: boolean }>();
  for (const binding of declaration.bindings) {
    const target = resolveBinding(binding, source, resolver) ?? { file: via, typeOnly: false };
    const entry = byTarget.get(target.file) ?? { names: [], typeOnly: true };
    entry.names.push(binding.identifier.text);
    entry.typeOnly &&= declaration.typeOnly || binding.typeOnly || target.typeOnly;
    byTarget.set(target.file, entry);
  }
  return [...byTarget].map(([to, { names, typeOnly }]) => edge(to, names, typeOnly));
};

interface ModuleStatement {
  specifier: StringLiteralLikeNode;
  typeOnly: boolean;
  bindings: Binding[];
}

const moduleDeclaration = (statement: Statement): ModuleStatement | undefined =>
  isImportDeclaration(statement) ? importStatement(statement) : isExportDeclaration(statement) ? reExportStatement(statement) : undefined;

const importStatement = (statement: ImportDeclaration): ModuleStatement | undefined => {
  if (!isStringLiteralLikeNode(statement.moduleSpecifier)) return undefined;
  const clause = statement.importClause;
  const named = clause?.namedBindings;
  const bindings: Binding[] = [
    ...(clause?.name ? [{ identifier: clause.name, typeOnly: false }] : []),
    ...(named && isNamespaceImport(named) ? [{ identifier: named.name, typeOnly: false }] : []),
    ...(named && isNamedImports(named) ? named.elements.map((element) => ({ identifier: element.name, typeOnly: element.isTypeOnly })) : []),
  ];
  return { specifier: statement.moduleSpecifier, typeOnly: clause?.phaseModifier === SyntaxKind.TypeKeyword, bindings };
};

const reExportStatement = (statement: ExportDeclaration): ModuleStatement | undefined => {
  if (!statement.moduleSpecifier || !isStringLiteralLikeNode(statement.moduleSpecifier)) return undefined;
  const clause = statement.exportClause;
  const elements = clause && isNamedExports(clause) ? clause.elements : [];
  const bindings = elements.flatMap((element) => (isIdentifier(element.name) ? [{ identifier: element.name, typeOnly: element.isTypeOnly }] : []));
  return { specifier: statement.moduleSpecifier, typeOnly: statement.isTypeOnly, bindings };
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
