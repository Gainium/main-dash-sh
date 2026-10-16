import { describe, expect, test } from "vitest";

import type { OrderData } from "@/types";
import {
  baseRemainderAddFundsIds,
  getOrderTypeLabel,
} from "@/utils/mapOrderName";
import { splitDealOrders } from "@/utils/orders/viewOrder";

/**
 * A LIMIT base order that fills only in part rests its unfilled rest as a
 * LIMIT add-funds order (main-app-sh spec 111). Its fill is the rest of the
 * base order, not funds the user added, and the deal's orders must say so.
 *
 * Fixture ids are synthetic: this file is public.
 */

const DEAL = "deal-1";

const order = (over: Partial<OrderData>): OrderData =>
  ({
    dealId: DEAL,
    side: "BUY",
    price: "0.05223",
    status: "FILLED",
    typeOrder: "dealRegular",
    time: 1,
    updateTime: 1,
    ...over,
  }) as OrderData;

/** Base order: 37.35 of 1914.6 filled, then settled. */
const BASE = order({
  clientOrderId: "D-BO-1",
  typeOrder: "dealStart",
  origQty: "1914.6",
  executedQty: "37.35",
});
/** Its rest, placed as an add-funds order for exactly 1914.6 − 37.35. */
const REST = order({
  clientOrderId: "D-ROA-1",
  addFundsId: "af-rest",
  origQty: "1877.25",
  executedQty: "1877.25",
  time: 2,
});
/** A user's own add-funds order. */
const USER_ADD = order({
  clientOrderId: "D-ROA-2",
  addFundsId: "af-user",
  origQty: "500",
  executedQty: "500",
  time: 3,
});
const SO = order({
  clientOrderId: "D-RO-1",
  origQty: "1441.96",
  executedQty: "0",
  status: "NEW",
  price: "0.04962",
});

const labelOf = (orders: OrderData[], clientOrderId: string, deal?: object) => {
  const { pendingOrders, completedOrders } = splitDealOrders(
    orders,
    "coinbase",
    deal,
  );
  return [...pendingOrders, ...completedOrders].find(
    (o) => o.clientOrderId === clientOrderId,
  )?.orderType;
};

describe("a filled base-order remainder is labelled as the base order rest", () => {
  test('the rest of a part-filled base order is not "Add funds"', () => {
    expect(labelOf([BASE, REST, SO], "D-ROA-1")).toBe("Base order (remainder)");
  });

  test("a user's own add-funds order keeps its label", () => {
    expect(labelOf([BASE, REST, USER_ADD, SO], "D-ROA-2")).toBe(
      "DCA order (Add funds order)",
    );
    expect(labelOf([BASE, REST, USER_ADD, SO], "D-ROA-1")).toBe(
      "Base order (remainder)",
    );
  });

  test("a whole base order has no remainder", () => {
    const whole = { ...BASE, executedQty: "1914.6" };
    expect(labelOf([whole, USER_ADD], "D-ROA-2")).toBe(
      "DCA order (Add funds order)",
    );
    const sameQty = { ...USER_ADD, origQty: "1877.25" };
    expect(labelOf([whole, sameQty], "D-ROA-2")).toBe(
      "DCA order (Add funds order)",
    );
  });

  test("a re-placed remainder chain is recognised in any order", () => {
    // Rested 1877.25, filled 800 before the price moved; the other 1077.25
    // was re-placed under a new add-funds entry.
    const first = {
      ...REST,
      status: "CANCELED",
      executedQty: "800",
    } as OrderData;
    const second = order({
      clientOrderId: "D-ROA-3",
      addFundsId: "af-rest-2",
      origQty: "1077.25",
      executedQty: "1077.25",
      time: 4,
    });
    const ids = baseRemainderAddFundsIds([second, USER_ADD, first, BASE]);
    expect([...ids].sort()).toEqual(["af-rest", "af-rest-2"]);
  });

  test("the deal's own marker names the remainder (funds and pending)", () => {
    const contracts = { ...REST, origQty: "19", executedQty: "19" };
    expect(labelOf([BASE, contracts], "D-ROA-1")).toBe(
      "DCA order (Add funds order)",
    );
    expect(
      labelOf([BASE, contracts], "D-ROA-1", {
        funds: [
          { price: 0.05223, qty: 19, id: "af-rest", baseRemainder: true },
        ],
      }),
    ).toBe("Base order (remainder)");
    const resting = { ...REST, status: "NEW", executedQty: "0" } as OrderData;
    expect(
      labelOf([resting], "D-ROA-1", {
        pendingAddFunds: [{ id: "af-rest", baseRemainder: true }],
      }),
    ).toBe("Base order (remainder)");
  });

  test("orders of other deals are not matched against this base order", () => {
    const other = { ...REST, dealId: "deal-2" };
    expect(baseRemainderAddFundsIds([BASE, other]).size).toBe(0);
  });

  test("getOrderTypeLabel is unchanged without the flag", () => {
    expect(getOrderTypeLabel("dealRegular", false, "D-ROA-1")).toBe(
      "DCA order (Add funds order)",
    );
    expect(
      getOrderTypeLabel("dealRegular", false, "D-ROA-1", undefined, true, true),
    ).toBe("Base order (remainder)");
  });
});
