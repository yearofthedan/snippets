import type { Order } from '../../domain/order.ts';

export interface OrderStore {
  save(order: Order): void;
}
