import { registry, type Rule } from '../rule.ts';
import { cognitiveComplexity } from './cognitiveComplexity.ts';
import { dependencyDirection } from './dependencyDirection.ts';
import { functionCohesion } from './functionCohesion.ts';
import { moduleCohesion } from './moduleCohesion.ts';

export const builtinRules: readonly Rule[] = [dependencyDirection, moduleCohesion, functionCohesion, cognitiveComplexity] as Rule[];

export const builtinRegistry = registry(builtinRules);
