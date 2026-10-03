import type { OperatorVisit } from "@/server/services/operatorService";

/** Сериализуемая версия OperatorVisit для передачи в client components */
export interface OperatorVisitDTO {
  id: string;
  orderId: string;
  scheduledAt: string | null;
  durationMin: number;
  status: string;
  masterId: string | null;
  operatorSeen: boolean;
  order: {
    id: string;
    number: number;
    comment: string | null;
    noCall: boolean;
    paymentMethod: string;
    pricePerVisit: number;
    config: unknown;
    addressSnapshot: Record<string, string | null>;
    user: { id: string; name: string | null; phone: string | null };
    service: { id: string; title: unknown };
  };
  master: { id: string; name: unknown; phone: string | null } | null;
}

export function toVisitDTO(v: OperatorVisit): OperatorVisitDTO {
  return {
    id: v.id,
    orderId: v.orderId,
    scheduledAt: v.scheduledAt?.toISOString() ?? null,
    durationMin: v.durationMin,
    status: v.status,
    masterId: v.masterId,
    operatorSeen: v.operatorSeen,
    order: {
      id: v.order.id,
      number: v.order.number,
      comment: v.order.comment,
      noCall: v.order.noCall,
      paymentMethod: v.order.paymentMethod,
      pricePerVisit: v.order.pricePerVisit,
      config: v.order.config,
      addressSnapshot: v.order.addressSnapshot as Record<string, string | null>,
      user: v.order.user,
      service: { id: v.order.service.id, title: v.order.service.title },
    },
    master: v.master ? { id: v.master.id, name: v.master.name, phone: v.master.phone } : null,
  };
}
