import type { Identifier, Node, Statement } from 'typescript/ast';
import {
  isArrowFunction,
  isBindingElement,
  isBlock,
  isCallExpression,
  isClassDeclaration,
  isClassLikeDeclaration,
  isConstructorDeclaration,
  isEnumDeclaration,
  isExportDeclaration,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionLikeDeclaration,
  isIdentifier,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isInterfaceDeclaration,
  isModuleDeclaration,
  isParameterDeclaration,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isThisExpression,
  isTypeAliasDeclaration,
  isVariableDeclaration,
  isVariableStatement,
} from 'typescript/ast/is';
import type { FunctionFacts, Unit, UnitGraph, UnitKind } from '../model/facts.ts';
import { cognitiveComplexity } from './complexity.ts';
import { type Source, symbolKey, walk } from './source.ts';

interface Declared {
  unit: Unit;
  node: Node;
  /** Symbol keys of the names this unit declares. */
  keys: string[];
}

/**
 * Top-level declarations as units, linked when one references another. Functions and classes are the units whose
 * components count; state and types only link the functions that share them. Top-level statements that declare
 * nothing (calls, assignments, default exports of expressions) form one `code` unit.
 */
export const moduleUnits = (source: Source): UnitGraph => {
  const declared = source.sourceFile.statements.flatMap((statement) => declarations(statement, source));
  const loose = source.sourceFile.statements.filter((statement) => isLooseCode(statement));
  if (loose.length > 0) {
    declared.push({
      unit: { name: '<top-level code>', kind: 'code', line: source.line(loose[0]), endLine: source.endLine(loose[loose.length - 1]) },
      node: source.sourceFile,
      keys: [],
    });
  }
  const owner = new Map<string, number>();
  declared.forEach((entry, index) => {
    for (const key of entry.keys) owner.set(key, index);
  });

  const links: [number, number][] = [];
  declared.forEach((entry, index) => {
    const nodes = entry.unit.kind === 'code' ? loose : [entry.node];
    for (const node of nodes) {
      for (const key of references(node, source)) {
        const other = owner.get(key);
        if (other !== undefined && other !== index) links.push([index, other]);
      }
    }
  });
  return { units: declared.map((entry) => entry.unit), links };
};

const declarations = (statement: Statement, source: Source): Declared[] => {
  const unit = (name: string, kind: UnitKind, node: Node, nameNode?: Node): Declared => ({
    unit: { name, kind, line: source.line(node), endLine: source.endLine(node) },
    node,
    keys: nameNode ? declaredKeys(nameNode, source) : [],
  });
  if (isFunctionDeclaration(statement)) return [unit(statement.name?.text ?? 'default', 'function', statement, statement.name)];
  if (isClassDeclaration(statement)) return [unit(statement.name?.text ?? 'default', 'class', statement, statement.name)];
  if (isInterfaceDeclaration(statement) || isTypeAliasDeclaration(statement) || isEnumDeclaration(statement)) {
    return [unit(statement.name.text, 'type', statement, statement.name)];
  }
  if (isModuleDeclaration(statement)) return [unit(statement.name.getText(source.sourceFile), 'type', statement, statement.name)];
  if (isVariableStatement(statement)) {
    return statement.declarationList.declarations.map((declaration) => {
      const fn = declaration.initializer && (isArrowFunction(declaration.initializer) || isFunctionExpression(declaration.initializer));
      return unit(declaration.name.getText(source.sourceFile), fn ? 'function' : 'state', declaration, declaration.name);
    });
  }
  return [];
};

const isLooseCode = (statement: Statement): boolean =>
  !isImportDeclaration(statement) &&
  !isImportEqualsDeclaration(statement) &&
  !isExportDeclaration(statement) &&
  !isFunctionDeclaration(statement) &&
  !isClassDeclaration(statement) &&
  !isInterfaceDeclaration(statement) &&
  !isTypeAliasDeclaration(statement) &&
  !isEnumDeclaration(statement) &&
  !isModuleDeclaration(statement) &&
  !isVariableStatement(statement);

/** Keys of every identifier a name or binding pattern declares. */
const declaredKeys = (name: Node, source: Source): string[] => {
  const keys: string[] = [];
  walk(name, (node) => {
    if (isIdentifier(node)) {
      const key = symbolKey(source.symbolOf(node));
      if (key) keys.push(key);
    }
  });
  return keys;
};

/** Keys of every symbol referenced under node, plus `this.<member>` for member access in classes. */
const references = (node: Node, source: Source): Set<string> => {
  const keys = new Set<string>();
  walk(node, (child) => {
    if (isIdentifier(child)) {
      const key = symbolKey(source.symbolOf(child));
      if (key) keys.add(key);
    }
    if (isPropertyAccessExpression(child) && isThisExpression(child.expression) && isIdentifier(child.name)) {
      keys.add(`this.${child.name.text}`);
    }
  });
  return keys;
};

/** Every function in the module with a block body, and the complexity of each outermost one. */
export const functionFacts = (source: Source): FunctionFacts[] => {
  const facts: FunctionFacts[] = [];
  const visit = (node: Node, outermost: boolean) => {
    if (isFunctionLikeDeclaration(node) && node.body) {
      const name = functionName(node, source);
      const line = source.line(node);
      const endLine = source.endLine(node);
      facts.push({
        name,
        line,
        endLine,
        lines: endLine - line + 1,
        statements: isBlock(node.body) ? statementGraph(node, node.body.statements, source) : { units: [], links: [] },
        ...(outermost ? { complexity: cognitiveComplexity(node, name, source) } : {}),
      });
      node.forEachChild((child) => {
        visit(child, false);
      });
      return;
    }
    node.forEachChild((child) => {
      visit(child, outermost);
    });
  };
  visit(source.sourceFile, true);
  return facts;
};

/** Statements that touch a parameter, a local or a `this` member, linked when they share one. */
const statementGraph = (fn: Node, statements: readonly Statement[], source: Source): UnitGraph => {
  const locals = localKeys(fn, source);
  const units: Unit[] = [];
  const firstUser = new Map<string, number>();
  const links: [number, number][] = [];
  for (const statement of statements) {
    const touched = [...references(statement, source)].filter((key) => locals.has(key) || key.startsWith('this.'));
    if (touched.length === 0) continue;
    const line = source.line(statement);
    const index = units.push({ name: `line ${line}`, kind: 'code', line, endLine: source.endLine(statement) }) - 1;
    for (const key of touched) {
      const first = firstUser.get(key);
      if (first === undefined) firstUser.set(key, index);
      else links.push([first, index]);
    }
  }
  return { units, links };
};

/** Keys of the parameters and every name declared inside fn, nested functions and classes included. */
const localKeys = (fn: Node, source: Source): Set<string> => {
  const keys = new Set<string>();
  walk(fn, (node) => {
    const name = node !== fn ? declaredName(node) : undefined;
    const key = name && symbolKey(source.symbolOf(name));
    if (key) keys.add(key);
  });
  return keys;
};

const declaredName = (node: Node): Identifier | undefined => {
  const named = isVariableDeclaration(node) || isParameterDeclaration(node) || isBindingElement(node) || isFunctionDeclaration(node) || isClassDeclaration(node);
  return named && node.name && isIdentifier(node.name) ? node.name : undefined;
};

const functionName = (node: Node, source: Source): string => {
  const own = 'name' in node && node.name ? (node.name as Node).getText(source.sourceFile) : undefined;
  const parent = node.parent;
  const owner = isClassLikeDeclaration(parent) ? `${parent.name?.text ?? '<class>'}.` : '';
  if (isConstructorDeclaration(node)) return `${owner}constructor`;
  if (own) return `${owner}${own}`;
  if (isVariableDeclaration(parent) || isPropertyAssignment(parent) || isPropertyDeclaration(parent)) {
    return parent.name.getText(source.sourceFile);
  }
  if (isCallExpression(parent)) return `<callback to ${parent.expression.getText(source.sourceFile)}>`;
  return isFunctionDeclaration(node) ? 'default' : '<anonymous>';
};
