import { registry, type Rule } from '../rule.ts';
import { cognitiveComplexity } from './cognitive-complexity/cognitiveComplexity.ts';
import { dependencyDirection } from './dependency-direction/dependencyDirection.ts';
import { functionCohesion } from './function-cohesion/functionCohesion.ts';
import { moduleCohesion } from './module-cohesion/moduleCohesion.ts';
import { noCrossKindReexport } from './no-cross-kind-reexport/noCrossKindReexport.ts';

export const builtinRules: readonly Rule[] = [
  dependencyDirection,
  noCrossKindReexport,
  moduleCohesion,
  functionCohesion,
  cognitiveComplexity,
] as Rule[];

export const builtinRegistry = registry(builtinRules);
