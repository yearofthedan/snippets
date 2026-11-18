import { place, type Order } from '../domain/order.ts';

export function handle(order: Order, log: (line: string) => void) {
  const placed = place(order);
  const id = placed.id;
  log(`placed ${id}`);
  const started = Date.now();
  const elapsed = Date.now() - started;
  console.log(elapsed);
}

export function grade(score: number, strict: boolean) {
  if (score > 90) {
    for (const n of [1, 2]) {
      if (strict && n > 1) return 'A+';
    }
    return 'A';
  } else if (score > 50 || strict) {
    return 'B';
  } else {
    return 'C';
  }
}
