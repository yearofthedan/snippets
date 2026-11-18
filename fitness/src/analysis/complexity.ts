import { SyntaxKind } from 'typescript/ast';
import type { BinaryExpression, ConditionalExpression, IfStatement, Node } from 'typescript/ast';
import {
  isBinaryExpression,
  isBreakOrContinueStatement,
  isCallExpression,
  isCatchClause,
  isConditionalExpression,
  isDoStatement,
  isForInStatement,
  isForOfStatement,
  isForStatement,
  isFunctionLikeDeclaration,
  isIdentifier,
  isIfStatement,
  isSwitchStatement,
  isWhileStatement,
} from 'typescript/ast/is';
import type { Complexity } from '../model/facts.ts';
import type { Source } from './source.ts';

/**
 * Cognitive complexity (G. Ann Campbell, SonarSource, 2017). Structures that break linear flow add 1 plus their
 * nesting depth; else, else-if, labelled jumps, each run of mixed logical operators and direct recursion add 1.
 * Nested functions add no increment of their own but deepen the nesting of everything inside them.
 */
export const cognitiveComplexity = (fn: Node, name: string, source: Source): Complexity => {
  const walker: Walker = { fn, name, source, increments: [] };
  visit(walker, fn, 0);
  return { total: walker.increments.reduce((sum, increment) => sum + increment.amount, 0), increments: walker.increments };
};

interface Walker {
  fn: Node;
  name: string;
  source: Source;
  increments: Complexity['increments'];
}

const add = (walker: Walker, node: Node, amount: number, reason: string) =>
  walker.increments.push({ line: walker.source.line(node), amount, reason });

const visitChildren = (walker: Walker, node: Node, nesting: number) =>
  node.forEachChild((child) => {
    visit(walker, child, nesting);
  });

const visit = (walker: Walker, node: Node, nesting: number): void => {
  if (isIfStatement(node)) return visitIf(walker, node, nesting);
  if (isConditionalExpression(node)) return visitTernary(walker, node, nesting);
  const structure = nestingStructure(node);
  if (structure) add(walker, node, 1 + nesting, structure);
  const nested = structure !== undefined || (node !== walker.fn && isFunctionLikeDeclaration(node));
  if (!nested) addFlat(walker, node);
  visitChildren(walker, node, nested ? nesting + 1 : nesting);
};

const visitIf = (walker: Walker, node: IfStatement, nesting: number) => {
  const elseIf = isIfStatement(node.parent) && node.parent.elseStatement === node;
  add(walker, node, elseIf ? 1 : 1 + nesting, elseIf ? 'else if' : 'if');
  visit(walker, node.expression, nesting);
  visit(walker, node.thenStatement, nesting + 1);
  const otherwise = node.elseStatement;
  if (!otherwise) return;
  if (isIfStatement(otherwise)) return visit(walker, otherwise, nesting);
  add(walker, otherwise, 1, 'else');
  visit(walker, otherwise, nesting + 1);
};

const visitTernary = (walker: Walker, node: ConditionalExpression, nesting: number) => {
  add(walker, node, 1 + nesting, 'ternary');
  visit(walker, node.condition, nesting);
  visit(walker, node.whenTrue, nesting + 1);
  visit(walker, node.whenFalse, nesting + 1);
};

/** Increments that ignore nesting: labelled jumps, runs of logical operators and recursion. */
const addFlat = (walker: Walker, node: Node) => {
  if (isBreakOrContinueStatement(node) && node.label) {
    add(walker, node, 1, `labelled ${node.kind === SyntaxKind.BreakStatement ? 'break' : 'continue'}`);
  }
  if (isBinaryExpression(node) && isLogical(node) && !(isBinaryExpression(node.parent) && isLogical(node.parent))) {
    const operators = logicalSequence(node);
    add(walker, node, 1 + operators.filter((op, index) => index > 0 && op !== operators[index - 1]).length, 'logical operators');
  }
  if (isCallExpression(node) && isIdentifier(node.expression) && node.expression.text === walker.name) add(walker, node, 1, 'recursion');
};

const nestingStructure = (node: Node): string | undefined => {
  if (isSwitchStatement(node)) return 'switch';
  if (isForStatement(node) || isForInStatement(node) || isForOfStatement(node)) return 'for';
  if (isWhileStatement(node)) return 'while';
  if (isDoStatement(node)) return 'do';
  if (isCatchClause(node)) return 'catch';
  return undefined;
};

const logicalKinds = new Set([SyntaxKind.AmpersandAmpersandToken, SyntaxKind.BarBarToken, SyntaxKind.QuestionQuestionToken]);

const isLogical = (node: BinaryExpression): boolean => logicalKinds.has(node.operatorToken.kind);

const logicalSequence = (node: Node): SyntaxKind[] =>
  isBinaryExpression(node) && isLogical(node)
    ? [...logicalSequence(node.left), node.operatorToken.kind, ...logicalSequence(node.right)]
    : [];
