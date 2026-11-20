import { Square, unit } from './lib/shapes.ts';
import type { Circle } from './lib/index.ts';

export { Square as Box };
export type { Circle };

export const area = (square: Square) => square.side * unit;
