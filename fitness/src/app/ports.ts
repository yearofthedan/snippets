import type { Config } from '../model/config.ts';
import type { Project } from '../model/facts.ts';
import type { Finding } from '../model/rules.ts';

export interface Analyzer {
  analyze(root: string, config: Config): Project;
}

/** A git repository holding the project. */
export interface Repository {
  /** The project directory's path relative to the repository root. */
  projectPath(): string;
  /** The commit a ref names. */
  commit(ref: string): string;
  /** Checks a commit out into a temporary directory and returns the project directory inside it. */
  checkout(commit: string): { projectRoot: string; dispose(): void };
}

/** Findings for a commit, which never change while the config and tool stay the same. */
export interface FindingsCache {
  get(key: string): Finding[] | undefined;
  set(key: string, findings: Finding[]): void;
}
