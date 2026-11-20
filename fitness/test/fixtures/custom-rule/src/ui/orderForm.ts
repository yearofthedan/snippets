import { type OrderStore, placeOrder } from '../application/index.ts';

export const submit = (store: OrderStore) => placeOrder(store, { id: '1', total: 10 });
