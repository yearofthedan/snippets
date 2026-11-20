/** What a fitness.config.ts and a project's own rules import from `fitness`. */
export { defineConfig, type FitnessConfig, type Kind, type RuleSettings } from './model/config.ts';
export type { Ruleset, RulesetOverlay } from './model/ruleset.ts';
export type { Complexity, FunctionFacts, ImportEdge, ModuleFacts, Unit, UnitGraph, UnitKind } from './model/facts.ts';
export { ConfigError, type Finding, type Plugin, type Rule, type RuleContext, wholeNumberOptions } from './model/rule.ts';
