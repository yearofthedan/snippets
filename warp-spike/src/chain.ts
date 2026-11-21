// Chained builder: each part is added in order and its callback sees only the parts before it, so `using` stays on
// the part and every reference is typed with no inference trick. Produces the same ArchetypeData as w.ts, so the
// model and verdicts are shared.
import type { AnyArchetype, Archetype, ArchetypeData, DirPart, FilesPart, Part, Ref, RequiredRefs, SurfaceRefs } from './w.ts';

type Using = { using?: readonly Ref[] };
export type FilesWith<U extends readonly Ref[] = Ref[]> = FilesPart & { using?: U };
export type DirWith<A, U extends readonly Ref[] = Ref[]> = DirPart<A> & { using?: U };

/** A self-surface named by a call, `s.subcomponent('render')`, so the name is kept as a literal type. */
export type SelfRef<N extends string> = Ref & { readonly selfSurface: N };
type LazySelf = Ref & (<const N extends string>(surface: N) => SelfRef<N>);
/** Every surface name the parts so far asked of the archetype itself; `exposes` must define them all. */
type SelfNames<C> = {
  [K in keyof C]: C[K] extends { using?: infer U } ? U extends readonly (infer X)[] ? X extends SelfRef<infer N> ? N : never : never : never;
}[keyof C];

/**
 * The archetype itself, for recursion. It carries the surface names declared with `.surfaces()`, because `exposes`
 * comes after the parts and types only flow forward: `s.subcomponent.render` can't be typed from a later call.
 */
declare const selfBrand: unique symbol;
export interface SelfOf<S extends string> { readonly [selfBrand]: S; readonly self: true }

type PartRef<P> = P extends DirPart<infer A>
  ? A extends SelfOf<infer S> ? [S] extends [never] ? LazySelf : SurfaceRefs<{ [K in S]: Ref }>
  : A extends Archetype<string, infer CE> ? SurfaceRefs<CE>
  : Ref
  : Ref;
export type PartRefs<C> = { readonly [K in keyof C]: PartRef<C[K]> };

type Ctx<R, S extends string> = { required: RequiredRefs<R>; self: SelfOf<S> };
type PartInput<C, R, S extends string, P> = P | ((s: PartRefs<C>, ctx: Ctx<R, S>) => P);

/** A standalone parts chain, for `.contains(({ required, self }) => c.parts().part(...))`. */
export interface Parts<C> {
  readonly entries: [string, Part & Using][];
  part<const K extends string, P extends Part>(
    name: K extends keyof C ? `part '${K}' is already declared` : K,
    part: P | ((s: PartRefs<C>) => P),
  ): Parts<C & { [k in K]: P }>;
}

export interface Chain<N extends string, C, R, S extends string, E> extends Archetype<N, E> {
  /** What this archetype needs from above. Comes first, so every part can use `required`. */
  requires<const R2 extends Record<string, AnyArchetype | Part>>(requires: R2): Chain<N, C, R2, S, E>;
  /** Only for an archetype that contains itself: the surfaces `exposes` will define, so parts can name them. */
  surfaces<const S2 extends string>(...names: S2[]): Chain<N, C, R, S2, E>;
  /** Option 2: the same as surfaces(), spelt as exposes with names now and the binding at the end. */
  exposes<const S2 extends string>(...names: S2[]): Chain<N, C, R, S2, E>;
  identify(identify: { marker: string }): Chain<N, C, R, S, E>;
  loose(loose: 'allow' | 'warn' | 'deny'): Chain<N, C, R, S, E>;
  part<const K extends string, P extends Part>(
    name: K extends keyof C ? `part '${K}' is already declared` : K,
    part: PartInput<C, R, S, P>,
  ): Chain<N, C & { [k in K]: P }, R, S, E>;
  /** Dan's variant: all parts in one nested chain. */
  contains<C2>(parts: (ctx: Ctx<R, S>) => Parts<C2>): Chain<N, C & C2, R, S, E>;
  exposes<E2 extends Record<string, Ref | Ref[]>>(
    exposes: (s: PartRefs<C>) => E2 & { [K in S | SelfNames<C>]: Ref | Ref[] },
  ): Chain<N, C, R, S, E2>;
  provides(provides: (s: PartRefs<C>) => Record<string, Ref>): Chain<N, C, R, S, E>;
}

interface State {
  name: string;
  identify?: { marker: string };
  loose?: 'allow' | 'warn' | 'deny';
  requires: ArchetypeData['requires'];
  parts: [string, Part & Using][];
  exposes?: Record<string, Ref | Ref[]>;
  provides?: Record<string, Ref>;
}

const partProxy = (): Record<string, Ref> =>
  new Proxy({} as Record<string, Ref>, { get: (_, part: string) => surfaceProxy({ kind: 'part', part }) });
const requiredProxy = (): Record<string, Ref> =>
  new Proxy({} as Record<string, Ref>, { get: (_, name: string) => surfaceProxy({ kind: 'required', name }) });
// callable, so `s.subcomponent('render')` works as well as `s.subcomponent.render`
const surfaceProxy = (base: Ref): Ref =>
  new Proxy((() => undefined) as unknown as Ref, {
    get: (_, key) =>
      typeof key === 'string' && !(key in base) && key !== 'toJSON' && key !== 'then'
        ? { ...base, surface: key }
        : (base as Record<string | symbol, unknown>)[key],
    has: (_, key) => key in base,
    ownKeys: () => Object.keys(base),
    getOwnPropertyDescriptor: (_, key) => (key in base ? { value: (base as Record<string | symbol, unknown>)[key], enumerable: true, configurable: true } : undefined),
    apply: (_, __, [surface]: [string]) => ({ ...base, surface }),
  });
const plain = (ref: Ref): Ref => ({ ...ref });

const chain = (state: State): Chain<string, {}, {}, never, {}> => {
  const s = partProxy() as never;
  const ctx = { required: requiredProxy(), self: selfValue } as never;
  const api = {
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
    surfaces: () => chain(state),
    identify: (identify: State['identify']) => chain({ ...state, identify }),
    loose: (loose: State['loose']) => chain({ ...state, loose }),
    part: (name: string, part: (Part & Using) | ((s: never, ctx: never) => Part & Using)) => {
      if (state.parts.some(([k]) => k === name)) throw new Error(`${state.name}: part '${name}' is already declared`);
      return chain({ ...state, parts: [...state.parts, [name, typeof part === 'function' ? part(s, ctx) : part]] });
    },
    contains: (f: (ctx: never) => Parts<unknown>) => {
      let next = chain(state) as unknown as { part: (k: string, p: Part & Using) => unknown };
      for (const [k, p] of f(ctx).entries) next = next.part(k, p) as typeof next;
      return next;
    },
    exposes: (f: string | ((s: never) => Record<string, Ref | Ref[]>)) =>
      typeof f === 'string' ? chain(state) : chain({ ...state, exposes: Object.fromEntries(Object.entries(f(s)).map(([k, v]) => [k, Array.isArray(v) ? v.map(plain) : plain(v)])) }),
    provides: (f: (s: never) => Record<string, Ref>) =>
      chain({ ...state, provides: Object.fromEntries(Object.entries(f(s)).map(([k, v]) => [k, plain(v)])) }),
  };
  return api as unknown as Chain<string, {}, {}, never, {}>;
};

const selfValue = { self: true } as unknown as SelfOf<never>;

const parts = (entries: [string, Part & Using][]): Parts<{}> => {
  const s = partProxy() as never;
  return {
    entries,
    part: (name: string, part: (Part & Using) | ((s: never) => Part & Using)) =>
      parts([...entries, [name, typeof part === 'function' ? part(s) : part]]),
  } as unknown as Parts<{}>;
};

export const c = {
  parts: () => parts([]),
  archetype: <const N extends string>(name: N) => chain({ name, requires: {}, parts: [] }) as unknown as Chain<N, {}, {}, never, {}>,
  files: <const U extends readonly Ref[] = []>(patterns: string | string[], options: { using?: U } = {}): FilesWith<U> => ({ kind: 'files', patterns: [patterns].flat(), ...options }),
  dir: <A extends AnyArchetype | SelfOf<string> | undefined = undefined, const U extends readonly Ref[] = []>(paths: string | string[] = [], archetype?: A, options: { using?: U } = {}): DirWith<A, U> => ({
    kind: 'dir',
    paths: [paths].flat(),
    archetype: archetype as A,
    ...options,
  }),
  pkg: (pattern: string): Ref => ({ kind: 'pkg', pattern }),
};
