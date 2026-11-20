import type { Order } from '../domain/order.ts';
import type { OrderStore } from './ports/orderStore.ts';

export const placeOrder = (store: OrderStore, order: Order) => store.save(order);
