import { describe, expect, it } from "vitest";
import { firstOrderUsedBy, usesFirstOrderRight } from "./firstOrder";

const order = (number: number, status: string, firstOrder?: boolean) => ({ number, status, config: firstOrder === undefined ? {} : { firstOrder } });

describe("usesFirstOrderRight", () => {
  it("an active, paused or completed order is not a first order any more", () => {
    for (const s of ["ACTIVE", "PAUSED", "COMPLETED"]) expect(usesFirstOrderRight(order(1, s, false))).toBe(true);
  });

  it("a cancelled order placed as the first one keeps the right used", () => {
    expect(usesFirstOrderRight(order(1, "CANCELLED", true))).toBe(true);
  });

  it("a cancelled order that was not placed as the first one does not touch the right", () => {
    expect(usesFirstOrderRight(order(2, "CANCELLED", false))).toBe(false);
    expect(usesFirstOrderRight(order(2, "CANCELLED"))).toBe(false);
    expect(usesFirstOrderRight({ status: "CANCELLED", config: null })).toBe(false);
  });
});

describe("firstOrderUsedBy", () => {
  it("is null for a client without orders", () => {
    expect(firstOrderUsedBy([])).toBeNull();
  });

  it("order → cancel → order again: the discount is not returned", () => {
    const orders = [order(7, "CANCELLED", true)];
    expect(firstOrderUsedBy(orders)?.number).toBe(7);
  });

  it("returns the earliest order that used the right", () => {
    const orders = [order(9, "ACTIVE", false), order(4, "CANCELLED", true), order(6, "CANCELLED", false)];
    expect(firstOrderUsedBy(orders)?.number).toBe(4);
  });

  it("ordinary cancellations of orders without the discount do not use it", () => {
    expect(firstOrderUsedBy([order(3, "CANCELLED", false), order(5, "CANCELLED")])).toBeNull();
  });
});
