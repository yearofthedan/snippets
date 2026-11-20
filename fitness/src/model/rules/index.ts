import type { Rule } from '../rule.ts';
import { cognitiveComplexity } from './cognitive-complexity/cognitiveComplexity.ts';
import { dependencyDirection } from './dependency-direction/dependencyDirection.ts';
import { functionCohesion } from './function-cohesion/functionCohesion.ts';
import { moduleCohesion } from './module-cohesion/moduleCohesion.ts';
import { noCrossKindReexport } from './no-cross-kind-reexport/noCrossKindReexport.ts';

/** The rules fitness ships, without docs links: whoever composes them knows where their pages are published. */
export const builtinRules: readonly Rule[] = [
  dependencyDirection,
  noCrossKindReexport,
  moduleCohesion,
  functionCohesion,
  cognitiveComplexity,
] as Rule[];
