// Probe 2: key order matters. `using` before `exposes` means TypeScript types `using` before it has inferred
// what the archetype exposes, so `s.subcomponent.render` (a self reference) fails, and so does every parent that
// references this archetype's surfaces. The error doesn't mention order.
import { w } from '../src/w.ts';

const component = w.archetype('component', {
  contains: { logic: w.files('*.ts'), dom: w.files('{name}.dom.ts'), subcomponent: w.dir('{name}', w.self) },
  using: (s) => ({ dom: [s.logic, s.subcomponent.render] }), // error: 'render' does not exist on 'SurfaceRefs<{}>'
  exposes: (s) => ({ render: s.dom }),
});

w.archetype('ui', {
  contains: { components: w.dir('{name}', component) },
  exposes: (s) => ({ render: s.components.render }), // error too, far from the cause
});
