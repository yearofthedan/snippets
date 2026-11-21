// Chained builder: parts are added in order, and a part's `using` callback sees only the parts before it. `using`
// stays on the part. `s` is typed through `c.files` / `c.dir` from the type `.part()` expects (return-type
// inference), so no callback wraps the part itself. Produces the same ArchetypeData as w.ts.
import type { AnyArchetype, Archetype, ArchetypeData, Part, Ref, RequiredRefs, SurfaceRefs } from './w.ts';

declare const selfBrand: unique symbol;
/** The archetype itself, for recursion. Its surfaces aren't known yet, so any name types; `.exposes()` checks them. */
export interface SelfMarker { readonly [selfBrand]: true; readonly self: true }
const self = { self: true } as unknown as SelfMarker;

type UsingFn<S, X> = (s: S, ctx: X) => readonly Ref[];
type Using<S, X> = readonly Ref[] | UsingFn<S, X>;
export interface FilesSpec<S = unknown, X = unknown> { readonly kind: 'files'; readonly patterns: string[]; readonly using?: Using<S, X> }
export interface DirSpec<A, S = unknown, X = unknown> { readonly kind: 'dir'; readonly paths: string[]; readonly archetype: A; readonly using?: Using<S, X> }
type AnySpec = FilesSpec<never, never> | DirSpec<unknown, never, never>;

type AnySurface = Ref & { readonly [surface: string]: Ref };
type PartRef<P> = P extends DirSpec<infer A, never, never>
  ? A extends SelfMarker ? AnySurface
  : A extends Archetype<string, infer CE> ? SurfaceRefs<CE>
  : Ref
  : Ref;
export type PartRefs<C> = { readonly [K in keyof C]: PartRef<C[K]> };

type Ctx<R> = { required: RequiredRefs<R>; self: SelfMarker };
type NewName<K extends string, C> = K extends keyof C ? `part '${K}' is already declared` : K;
/** What .part() accepts; `s` in a `using` callback gets its type from here, through c.files / c.dir. */
type Spec<A, C, R> = FilesSpec<PartRefs<C>, Ctx<R>> | DirSpec<A, PartRefs<C>, Ctx<R>>;
type Stored<A> = [A] extends [never] ? FilesSpec<never, never> : DirSpec<A, never, never>;

/** A standalone parts chain, for `.contains(({ required, self }) => c.parts().part(...))`. */
export interface Parts<C, R = {}> {
  readonly entries: [string, AnySpec][];
  // One signature, not a files/dir overload pair: a failed overload would fix `s` as unknown for the next one.
  part<const K extends string, A = never>(name: NewName<K, C>, part: Spec<A, C, R>): Parts<C & { [k in K]: Stored<A> }, R>;
}

export interface Chain<N extends string, C, R, E> extends Archetype<N, E> {
  /** What this archetype needs from above. Comes first, so every part can use `required`. */
  requires<const R2 extends Record<string, AnyArchetype | Part | AnySpec>>(requires: R2): Chain<N, C, R2, E>;
  identify(identify: { marker: string }): Chain<N, C, R, E>;
  loose(loose: 'allow' | 'warn' | 'deny'): Chain<N, C, R, E>;
  part<const K extends string, A = never>(name: NewName<K, C>, part: Spec<A, C, R>): Chain<N, C & { [k in K]: Stored<A> }, R, E>;
  /** Dan's variant: all parts in one nested chain, with `required` and `self` in scope once. */
  contains<C2>(parts: (ctx: Ctx<R>) => Parts<C2, R>): Chain<N, C & C2, R, E>;
  exposes<E2 extends Record<string, Ref | Ref[]>>(exposes: (s: PartRefs<C>) => E2): Chain<N, C, R, E2>;
  provides(provides: (s: PartRefs<C>) => Record<string, Ref>): Chain<N, C, R, E>;
}

interface State {
  name: string;
  identify?: { marker: string };
  loose?: 'allow' | 'warn' | 'deny';
  requires: ArchetypeData['requires'];
  parts: [string, AnySpec & { using?: readonly Ref[] }][];
  exposes?: Record<string, Ref | Ref[]>;
  provides?: Record<string, Ref>;
}

const partProxy = (): Record<string, Ref> =>
  new Proxy({} as Record<string, Ref>, { get: (_, part: string) => surfaceProxy({ kind: 'part', part }) });
const requiredProxy = (): Record<string, Ref> =>
  new Proxy({} as Record<string, Ref>, { get: (_, name: string) => surfaceProxy({ kind: 'required', name }) });
const surfaceProxy = (base: Ref): Ref =>
  new Proxy({ ...base } as Ref, {
    get: (target, key) =>
      typeof key === 'string' && !(key in target) && key !== 'toJSON' && key !== 'then'
        ? { ...base, surface: key }
        : (target as Record<string | symbol, unknown>)[key],
  });
const plain = (ref: Ref): Ref => ({ ...ref });
const ctx = () => ({ required: requiredProxy(), self }) as never;
/** Runs a part's `using` callback, so the stored part holds plain references. */
const settle = (part: AnySpec) =>
  typeof part.using === 'function' ? { ...part, using: (part.using as UsingFn<never, never>)(partProxy() as never, ctx()) } : part;

/** Load-time check the types leave open: every self surface a part names must be one the archetype exposes. */
const checkSelfSurfaces = (state: State, exposes: Record<string, unknown>) => {
  const selfParts = new Set(state.parts.filter(([, p]) => p.kind === 'dir' && (p as DirSpec<unknown>).archetype === self).map(([k]) => k));
  for (const [name, part] of state.parts) {
    for (const ref of part.using ?? []) {
      if (ref.kind === 'part' && selfParts.has(ref.part) && ref.surface && !(ref.surface in exposes)) {
        throw new Error(`${state.name}.${name} uses ${ref.part}.${ref.surface}; ${state.name} exposes ${Object.keys(exposes).join(', ')}`);
      }
    }
  }
};

const chain = (state: State): unknown => ({
  name: state.name,
  get data(): ArchetypeData {
    return {
      name: state.name,
      ...(state.identify ? { identify: state.identify } : {}),
      ...(state.loose ? { loose: state.loose } : {}),
      requires: state.requires,
      contains: Object.fromEntries(state.parts.map(([k, { using: _, ...part }]) => [k, part as Part])),
      using: Object.fromEntries(state.parts.filter(([, p]) => p.using).map(([k, p]) => [k, p.using!.map(plain)])),
      ...(state.exposes ? { exposes: state.exposes } : {}),
      ...(state.provides ? { provides: state.provides } : {}),
    };
  },
  requires: (requires: State['requires']) => chain({ ...state, requires }),
  identify: (identify: State['identify']) => chain({ ...state, identify }),
  loose: (loose: State['loose']) => chain({ ...state, loose }),
  part: (name: string, part: AnySpec) => {
    if (state.parts.some(([k]) => k === name)) throw new Error(`${state.name}: part '${name}' is already declared`);
    return chain({ ...state, parts: [...state.parts, [name, settle(part) as State['parts'][number][1]]] });
  },
  contains: (f: (ctx: never) => { entries: [string, AnySpec][] }) =>
    f(ctx()).entries.reduce<{ part: (k: string, p: AnySpec) => unknown }>((next, [k, p]) => next.part(k, p) as never, chain(state) as never),
  exposes: (f: (s: never) => Record<string, Ref | Ref[]>) => {
    const exposes = Object.fromEntries(Object.entries(f(partProxy() as never)).map(([k, v]) => [k, Array.isArray(v) ? v.map(plain) : plain(v)]));
    checkSelfSurfaces(state, exposes);
    return chain({ ...state, exposes });
  },
  provides: (f: (s: never) => Record<string, Ref>) =>
    chain({ ...state, provides: Object.fromEntries(Object.entries(f(partProxy() as never)).map(([k, v]) => [k, plain(v)])) }),
});

const parts = (entries: [string, AnySpec][]): unknown => ({
  entries,
  part: (name: string, part: AnySpec) => parts([...entries, [name, part]]),
});

export const c = {
  archetype: <const N extends string>(name: N) => chain({ name, requires: {}, parts: [] }) as Chain<N, {}, {}, {}>,
  parts: () => parts([]) as Parts<{}>,
  files: <S, X>(patterns: string | string[], options: { using?: Using<S, X> } = {}): FilesSpec<S, X> => ({
    kind: 'files',
    patterns: [patterns].flat(),
    ...options,
  }),
  dir: <A = undefined, S = unknown, X = unknown>(paths: string | string[] = [], archetype?: A, options: { using?: Using<S, X> } = {}): DirSpec<A, S, X> => ({
    kind: 'dir',
    paths: [paths].flat(),
    archetype: archetype as A,
    ...options,
  }),
  pkg: (pattern: string): Ref => ({ kind: 'pkg', pattern }),
  self,
};
