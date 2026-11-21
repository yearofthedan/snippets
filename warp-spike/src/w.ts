// Typed builders for the Warp config model. Spike quality: enough to type real configs and resolve them.
//
// Shape (differs from the design doc, see README): parts are declared as data in `contains`, then `exposes`,
// `provides` and `using` are callbacks that receive typed references to those parts. TypeScript infers the part
// names from `contains` before it types the callbacks (intra-expression inference), which a single callback
// returning everything cannot do.

/** A reference, resolved against the unit tree later. */
export type Ref =
  | { readonly kind: 'part'; readonly part: string; readonly surface?: string }
  | { readonly kind: 'required'; readonly name: string; readonly surface?: string }
  | { readonly kind: 'pkg'; readonly pattern: string };

/** A reference to a dir part or a requirement whose archetype exposes surfaces E. Usable bare (all surfaces). */
export type SurfaceRefs<E> = Ref & { readonly [K in keyof E]: Ref };

declare const selfBrand: unique symbol;
export interface SelfMarker { readonly [selfBrand]: true }
export const self = { self: true } as unknown as SelfMarker;

export interface FilesPart { readonly kind: 'files'; readonly patterns: string[] }
export interface DirPart<A = undefined> { readonly kind: 'dir'; readonly paths: string[]; readonly archetype: A }
export type Part = FilesPart | DirPart<any>;

export interface ArchetypeData {
  name: string;
  identify?: { marker: string };
  requires: Record<string, AnyArchetype | Part>;
  contains: Record<string, Part>;
  exposes?: Record<string, Ref | Ref[]>;
  provides?: Record<string, Ref>;
  using: Record<string, Ref[]>;
  loose?: 'allow' | 'warn' | 'deny';
}

/** E is the archetype's exposes, so a parent can type `s.child.surface`. */
export interface Archetype<N extends string, E> {
  readonly name: N;
  readonly data: ArchetypeData;
  readonly __exposes?: E;
}
// biome-ignore lint: spike
export type AnyArchetype = Archetype<string, any>;

type PartRef<P, E> = P extends DirPart<infer A>
  ? [A] extends [SelfMarker]
    ? SurfaceRefs<E>
    : A extends Archetype<string, infer CE>
      ? SurfaceRefs<CE>
      : Ref
  : Ref;
export type PartRefs<C, E> = { readonly [K in keyof C]: PartRef<C[K], E> };
export type RequiredRefs<R> = {
  readonly [K in keyof R]: R[K] extends Archetype<string, infer RE> ? SurfaceRefs<RE> : Ref;
};

/** Rejects keys of U that aren't parts. Callback returns get no excess-property check otherwise. */
type OnlyParts<U, C> = U & { [K in Exclude<keyof U, keyof C>]: never };

export interface ArchetypeSpec<C, R, E, P, U> {
  identify?: { marker: string };
  requires?: R;
  contains: C;
  exposes?: (s: PartRefs<C, never>) => E;
  provides?: (s: PartRefs<C, never>) => P;
  using?: (s: PartRefs<C, E>, ctx: { required: RequiredRefs<R> }) => OnlyParts<U, C> & { [K in keyof C]?: Ref[] };
  loose?: 'allow' | 'warn' | 'deny';
}

const partProxy = (): Record<string, Ref> =>
  new Proxy({} as Record<string, Ref>, {
    get: (_, part: string) => surfaceProxy({ kind: 'part', part }),
  });
const requiredProxy = (): Record<string, Ref> =>
  new Proxy({} as Record<string, Ref>, {
    get: (_, name: string) => surfaceProxy({ kind: 'required', name }),
  });
const surfaceProxy = (base: Ref): Ref =>
  new Proxy({ ...base } as Ref, {
    get: (target, key) =>
      typeof key === 'string' && !(key in target) && key !== 'toJSON' && key !== 'then'
        ? { ...base, surface: key }
        : (target as Record<string | symbol, unknown>)[key],
  });
const plain = (ref: Ref): Ref => ({ ...ref });

export const w = {
  archetype<
    const N extends string,
    C extends Record<string, Part>,
    R extends Record<string, AnyArchetype | Part> = {},
    E extends Record<string, Ref | Ref[]> = {},
    P extends Record<string, Ref> = {},
    U = {},
  >(name: N, spec: ArchetypeSpec<C, R, E, P, U>): Archetype<N, E> {
    const s = partProxy() as never;
    const required = requiredProxy() as never;
    const map = <V>(o: Record<string, V> | undefined, f: (v: V) => unknown) =>
      o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
    const data: ArchetypeData = {
      name,
      ...(spec.identify ? { identify: spec.identify } : {}),
      requires: (spec.requires ?? {}) as ArchetypeData['requires'],
      contains: spec.contains,
      ...(spec.exposes
        ? { exposes: map(spec.exposes(s) as Record<string, Ref | Ref[]>, (r) => (Array.isArray(r) ? r.map(plain) : plain(r))) as ArchetypeData['exposes'] }
        : {}),
      ...(spec.provides ? { provides: map(spec.provides(s) as Record<string, Ref>, plain) as ArchetypeData['provides'] } : {}),
      using: (map(spec.using?.(s, { required }) as Record<string, Ref[]> | undefined, (refs) => refs.map(plain)) ?? {}) as ArchetypeData['using'],
      ...(spec.loose ? { loose: spec.loose } : {}),
    };
    return { name, data };
  },
  files(patterns: string | string[]): FilesPart {
    return { kind: 'files', patterns: [patterns].flat() };
  },
  dir<A extends AnyArchetype | SelfMarker | undefined = undefined>(paths: string | string[] = [], archetype?: A): DirPart<A> {
    return { kind: 'dir', paths: [paths].flat(), archetype: archetype as A };
  },
  pkg(pattern: string): Ref {
    return { kind: 'pkg', pattern };
  },
  self,
};

export interface WarpConfig {
  root: AnyArchetype;
}
export const defineConfig = (config: WarpConfig): WarpConfig => config;
