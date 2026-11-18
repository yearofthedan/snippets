import './lib/index.ts';
import * as lib from './lib/index.ts';
import { Square, type Circle } from './lib/index.ts';

export function sum(n: number): number {
  return n <= 0 ? 0 : n + sum(n - 1);
}

export function mixed(a: boolean, b: boolean, c: boolean, d: boolean) {
  return (a && b && c) || d;
}

export function outer(items: number[]) {
  outer: for (const item of items) {
    const check = () => {
      if (item > 1) return true;
      return false;
    };
    if (check()) continue outer;
  }
}

export class Counter {
  count = 0;
  label = '';
  bump() {
    this.count += 1;
    this.label = 'bumped';
    return this.count;
  }
}

export const area = (circle: Circle) => circle.r * new Square().side * lib.all.unit;

export class Tree {
  walk(): number {
    return this.walk();
  }
}

export function shadowed() {
  const shadowed = () => 1;
  return shadowed();
}

export const cases = [1, 2].map((n) => n);
