import type { Order } from '../../domain/order.ts';

export interface OrderRow {
  id: string;
}

export const saveOrder = (order: Order): OrderRow => ({ id: order.id });
