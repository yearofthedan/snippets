import { saveOrder } from '../adapters/index.ts';
import type { OrderRow } from '../adapters/index.ts';

export interface Order {
  id: string;
}

export const place = (order: Order): OrderRow => saveOrder(order);
