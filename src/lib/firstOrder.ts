/**
 * Скидка на первый заказ. Право на неё «тратит» первый же оформленный заказ и не возвращается,
 * если заказ отменили: иначе скидку можно получать снова и снова (оформил, выполнил визит или отменил — оформил заново).
 * Заказ помечается в config.firstOrder в момент оформления (src/server/services/booking.ts).
 */
export interface OrderForFirstDiscount {
  number: number;
  status: string;
  config: unknown;
}

/** Заказ потратил право: он не отменён (это уже не первый заказ клиента) или был оформлен как первый, пусть и отменён потом */
export function usesFirstOrderRight(o: Pick<OrderForFirstDiscount, "status" | "config">): boolean {
  if (o.status !== "CANCELLED") return true;
  return (o.config as { firstOrder?: unknown } | null | undefined)?.firstOrder === true;
}

/** Самый ранний заказ клиента, потративший скидку; null — скидка ещё доступна */
export function firstOrderUsedBy<T extends OrderForFirstDiscount>(orders: T[]): T | null {
  return orders.filter(usesFirstOrderRight).sort((a, b) => a.number - b.number)[0] ?? null;
}
