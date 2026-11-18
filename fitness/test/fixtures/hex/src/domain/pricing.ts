import { type OrderRow } from '../adapters/db/orderRepo.ts';

const rate = 0.2;

export const tax = (amount: number) => amount * rate;

export const gross = (amount: number) => amount + tax(amount);

export function label(row: OrderRow) {
  return `order ${row.id}`;
}

export function shout(text: string) {
  return text.toUpperCase();
}

export const banner = (text: string) => shout(`** ${text} **`);
