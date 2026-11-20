import { registry, type Rule } from '../rule.ts';
import { cognitiveComplexity } from './cognitiveComplexity.ts';
import { dependencyDirection } from './dependencyDirection.ts';
import { functionCohesion } from './functionCohesion.ts';
import { moduleCohesion } from './moduleCohesion.ts';
import { noCrossKindReexport } from './noCrossKindReexport.ts';

export const builtinRules: readonly Rule[] = [
  dependencyDirection,
  noCrossKindReexport,
  moduleCohesion,
  functionCohesion,
  cognitiveComplexity,
] as Rule[];

export const builtinRegistry = registry(builtinRules);
