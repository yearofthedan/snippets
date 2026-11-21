// Resolves a config against a file list: units, parts, reach and edge verdicts. Spike quality.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ArchetypeData, Part, Ref, WarpConfig } from './w.ts';

export interface Unit {
  id: string; // folder path, '.' for the root
  dir: string; // '' for the root
  archetype?: ArchetypeData; // undefined: a plain dir, all files exposed
  captures: Record<string, string>;
  parent?: Unit;
  partName?: string; // the parent's dir part that matched it
  children: Unit[];
  files: Map<string, string>; // own file -> files part ('*' in a plain unit)
}

export interface Problem {
  kind: 'tie' | 'loose' | 'config';
  subject: string;
  detail: string;
}

export interface Reach {
  files: Set<string>;
  pkgs: string[];
  sources: string[]; // where each grant came from, for explaining
}

export interface Model {
  root: Unit;
  units: Unit[];
  unitOf: Map<string, Unit>;
  problems: Problem[];
  reach(file: string): Reach | undefined;
  verdict(from: string, to: string, external?: boolean): { allowed: boolean; why: string };
  where(file: string): string;
}

const SELF = (a: unknown): boolean => typeof a === 'object' && a !== null && 'self' in a;

const fill = (pattern: string, captures: Record<string, string>) =>
  pattern.replace(/\{(\w+)\}/g, (m, key: string) => captures[key] ?? m);

const globRegex = (pattern: string): RegExp => {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (pattern.startsWith('**/', i)) { out += '(?:.*/)?'; i += 2; }
    else if (pattern.startsWith('**', i)) { out += '.*'; i += 1; }
    else if (c === '*') out += '[^/]*';
    else out += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
};

/** Most specific wins: a literal pattern beats any glob, then the longer literal suffix, and `**` loses to all. */
const specificity = (pattern: string): number => {
  if (!pattern.includes('*')) return 1e6;
  if (pattern === '**') return -1;
  return pattern.length - pattern.lastIndexOf('*') - 1;
};

const subdirs = (root: string, dir: string): string[] => {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).filter((name) => !name.startsWith('.') && name !== 'node_modules' && statSync(join(abs, name)).isDirectory());
};

/** Folders under `dir` matching a dir path whose segments are literals or `{capture}`. */
const matchFolders = (root: string, dir: string, path: string): { dir: string; captures: Record<string, string>; literal: number }[] => {
  let found = [{ dir, captures: {} as Record<string, string>, literal: 0 }];
  for (const segment of path.split('/')) {
    const capture = /^\{(\w+)\}$/.exec(segment)?.[1];
    found = found.flatMap((f) =>
      capture
        ? subdirs(root, f.dir).map((name) => ({ dir: f.dir ? `${f.dir}/${name}` : name, captures: { ...f.captures, [capture]: name }, literal: f.literal }))
        : existsSync(join(root, f.dir, segment)) ? [{ dir: f.dir ? `${f.dir}/${segment}` : segment, captures: f.captures, literal: f.literal + 1 }] : [],
    );
  }
  return found;
};

export const buildModel = (projectRoot: string, config: WarpConfig, programFiles: string[]): Model => {
  const problems: Problem[] = [];
  const units: Unit[] = [];
  const unitOf = new Map<string, Unit>();

  const build = (dir: string, archetype: ArchetypeData | undefined, captures: Record<string, string>, parent?: Unit, partName?: string): Unit => {
    const unit: Unit = { id: dir || '.', dir, archetype, captures, parent, partName, children: [], files: new Map() };
    units.push(unit);

    // child units: every dir part's matching folders, most specific dir part wins a folder
    const claims = new Map<string, { part: string; arch?: ArchetypeData; captures: Record<string, string>; literal: number }[]>();
    for (const [name, part] of Object.entries(archetype?.contains ?? {})) {
      if (part.kind !== 'dir') continue;
      const childArch = SELF(part.archetype) ? archetype : (part.archetype as { data: ArchetypeData } | undefined)?.data;
      for (const path of part.paths) {
        for (const match of matchFolders(projectRoot, dir, path)) { // a dir path captures afresh; it never sees the parent's captures
          const marker = childArch?.identify?.marker;
          if (marker && !existsSync(join(projectRoot, match.dir, fill(marker, match.captures)))) continue;
          claims.set(match.dir, [...(claims.get(match.dir) ?? []), { part: name, arch: childArch, captures: match.captures, literal: match.literal }]);
        }
      }
    }
    for (const [childDir, candidates] of [...claims].sort()) {
      const best = Math.max(...candidates.map((c) => c.literal));
      const top = candidates.filter((c) => c.literal === best);
      if (top.length > 1) problems.push({ kind: 'tie', subject: childDir, detail: `dir parts ${top.map((c) => c.part).join(', ')} are equally specific` });
      const winner = top[0]!;
      unit.children.push(build(childDir, winner.arch, winner.captures, unit, winner.part));
    }

    // own files: under this folder, not under a child unit
    const prefix = dir ? `${dir}/` : '';
    const childPrefixes = unit.children.map((c) => `${c.dir}/`);
    for (const file of programFiles) {
      if (!file.startsWith(prefix) || childPrefixes.some((p) => file.startsWith(p))) continue;
      const rel = file.slice(prefix.length);
      unitOf.set(file, unit);
      if (!archetype) { unit.files.set(file, '*'); continue; }
      const matches = Object.entries(archetype.contains)
        .filter((entry): entry is [string, Extract<Part, { kind: 'files' }>] => entry[1].kind === 'files')
        .flatMap(([name, part]) => part.patterns.filter((p) => globRegex(fill(p, captures)).test(rel)).map((p) => ({ name, score: specificity(fill(p, captures)), pattern: p })));
      if (matches.length === 0) {
        const loose = archetype.loose ?? (parent ? 'allow' : 'deny');
        problems.push({ kind: 'loose', subject: file, detail: `no part of ${archetype.name} (${unit.id}) matches; loose: ${loose}` });
        continue;
      }
      const best = Math.max(...matches.map((m) => m.score));
      const top = matches.filter((m) => m.score === best);
      if (new Set(top.map((m) => m.name)).size > 1) problems.push({ kind: 'tie', subject: file, detail: `files parts ${top.map((m) => `${m.name} ('${m.pattern}')`).join(', ')} are equally specific` });
      unit.files.set(file, top[0]!.name);
    }
    return unit;
  };

  const root = build('', config.root.data, {});

  // ---- references ----
  type Resolved = { files: Set<string>; pkgs: string[] };
  const empty = (): Resolved => ({ files: new Set(), pkgs: [] });
  const merge = (into: Resolved, from: Resolved) => { from.files.forEach((f) => into.files.add(f)); into.pkgs.push(...from.pkgs); return into; };

  const allFiles = (unit: Unit): Set<string> => new Set([...unit.files.keys(), ...unit.children.flatMap((c) => [...allFiles(c)])]);

  const surfaceCache = new Map<string, Resolved>();
  const surfaceFiles = (unit: Unit, surface?: string): Resolved => {
    const key = `${unit.id}#${surface ?? ''}`;
    const cached = surfaceCache.get(key);
    if (cached) return cached;
    const out = empty();
    surfaceCache.set(key, out); // guards cycles
    const exposes = unit.archetype?.exposes;
    if (!unit.archetype) allFiles(unit).forEach((f) => out.files.add(f));
    else if (!exposes) { unit.files.forEach((_, f) => out.files.add(f)); unit.children.forEach((c) => merge(out, surfaceFiles(c))); }
    else {
      const entries = surface === undefined ? Object.values(exposes) : exposes[surface] ? [exposes[surface]!] : [];
      if (surface !== undefined && !exposes[surface]) problems.push({ kind: 'config', subject: unit.id, detail: `${unit.archetype.name} exposes no '${surface}'` });
      for (const entry of entries) for (const ref of [entry].flat()) merge(out, resolve(unit, ref));
    }
    return out;
  };

  const provider = (unit: Unit, name: string): { at: Unit; ref: Ref } | undefined => {
    for (let at = unit.parent; at; at = at.parent) {
      const ref = at.archetype?.provides?.[name];
      if (ref) return { at, ref };
    }
    return undefined;
  };

  const resolve = (unit: Unit, ref: Ref): Resolved => {
    if (ref.kind === 'pkg') return { files: new Set(), pkgs: [ref.pattern] };
    if (ref.kind === 'required') {
      const found = provider(unit, ref.name);
      if (!found) { problems.push({ kind: 'config', subject: unit.id, detail: `requires '${ref.name}', which nothing above provides` }); return empty(); }
      return resolve(found.at, ref.surface ? { ...found.ref, surface: ref.surface } as Ref : found.ref);
    }
    const part = unit.archetype?.contains[ref.part];
    if (!part) { problems.push({ kind: 'config', subject: unit.id, detail: `no part '${ref.part}'` }); return empty(); }
    if (part.kind === 'files') return { files: new Set([...unit.files].filter(([, p]) => p === ref.part).map(([f]) => f)), pkgs: [] };
    const out = empty();
    for (const child of unit.children.filter((c) => c.partName === ref.part)) merge(out, surfaceFiles(child, ref.surface));
    return out;
  };

  const show = (ref: Ref) => (ref.kind === 'pkg' ? `w.pkg('${ref.pattern}')` : `${ref.kind === 'required' ? 'required' : 's'}.${ref.kind === 'required' ? ref.name : ref.part}${ref.surface ? `.${ref.surface}` : ''}`);

  const reachCache = new Map<string, Reach>();
  const reach = (file: string): Reach | undefined => {
    const unit = unitOf.get(file);
    const part = unit?.files.get(file);
    if (!unit || !part) return undefined;
    const key = `${unit.id}#${part}`;
    const cached = reachCache.get(key);
    if (cached) return cached;
    const out: Reach = { files: new Set([...unit.files].filter(([, p]) => p === part).map(([f]) => f)), pkgs: [], sources: [`own part '${part}'`] };
    for (const ref of unit.archetype?.using[part] ?? []) { merge(out, resolve(unit, ref)); out.sources.push(`${part}: ${show(ref)}`); }
    if (unit.parent && unit.partName) {
      for (const ref of unit.parent.archetype?.using[unit.partName] ?? []) { merge(out, resolve(unit.parent, ref)); out.sources.push(`${unit.parent.archetype?.name}.${unit.partName}: ${show(ref)}`); }
    }
    reachCache.set(key, out);
    return out;
  };

  const pkgMatches = (pattern: string, specifier: string) => globRegex(pattern === '*' ? '**' : pattern.replace(/\/\*$/, '/**')).test(specifier);

  const where = (file: string): string => {
    const unit = unitOf.get(file);
    if (!unit) return 'outside the model';
    return `${unit.id} [${unit.archetype?.name ?? 'plain'}${unit.partName ? ` via ${unit.parent?.archetype?.name}.${unit.partName}` : ''}] part '${unit.files.get(file) ?? 'loose'}'`;
  };

  const verdict = (from: string, to: string, external = false) => {
    const r = reach(from);
    if (!r) return { allowed: false, why: `${from} has no part` };
    if (external) {
      const ok = r.pkgs.some((p) => pkgMatches(p, to));
      return { allowed: ok, why: ok ? 'package in using' : `no w.pkg in reach matches '${to}'` };
    }
    if (from === to || r.files.has(to)) return { allowed: true, why: 'in reach' };
    return { allowed: false, why: `target is ${where(to)}` };
  };

  // ---- config validation the types can't do ----
  for (const unit of units) {
    const a = unit.archetype;
    if (!a) continue;
    const used = new Set(Object.values(a.using).flat().filter((r) => r.kind === 'required').map((r) => (r as { name: string }).name));
    for (const name of Object.keys(a.requires)) {
      if (!provider(unit, name)) problems.push({ kind: 'config', subject: unit.id, detail: `${a.name} requires '${name}', which nothing above provides` });
      if (!used.has(name)) problems.push({ kind: 'config', subject: unit.id, detail: `${a.name} requires '${name}' but no part uses it` });
    }
  }

  return { root, units, unitOf, problems, reach, verdict, where };
};
