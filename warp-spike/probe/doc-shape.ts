// Probe 1: the design doc's shape. A single callback returns `contains`, and `s` is typed from that return.
// TypeScript fixes C before it sees the return, so `s.domian` passes and C is just Record<string, Part>. No errors
// below means the shape catches nothing.
type Part = { kind: 'files' | 'dir' };
type Ref<P extends string = string> = { ref: P };
type Refs<C> = { [K in keyof C & string]: Ref<K> };
interface Spec<C> { contains: C; exposes?: Record<string, Ref>; }
declare function archetype<C extends Record<string, Part>>(name: string, fn: (s: Refs<C>) => Spec<C>): C;
declare function files(p: string, o?: { using?: Ref[] }): Part;

const a = archetype('a', (s) => ({
  exposes: { code: s.rest },
  contains: {
    logic: files('*.ts', { using: [s.domian] }), // misspelt: should be an error
    rest: files('**'),
  },
}));
type Check = keyof typeof a; // what did C infer as?
const probe: Check = 'nope'; // errors only if C was inferred as the literal keys
