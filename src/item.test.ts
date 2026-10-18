import { describe, expect, it } from "vitest";
import { collectItems, createItems, itemRect } from "./item";
import type { MapItemSpec, Rect } from "./types";

function coin(x: number, y: number, instanceId: string): MapItemSpec {
  return {
    instanceId,
    assetId: "IT02",
    kind: "coin",
    x,
    y,
    hitbox: { offsetX: 4, offsetY: 4, width: 24, height: 24 }
  };
}

describe("createItems", () => {
  it("creates uncollected items at the map positions", () => {
    const [item] = createItems([coin(10, 20, "item_1")]);
    expect(item.collected).toBe(false);
    expect(itemRect(item)).toEqual({ x: 14, y: 24, width: 24, height: 24 });
  });

  it("returns an empty list when the map has no items", () => {
    expect(createItems(undefined)).toEqual([]);
  });
});

describe("collectItems", () => {
  const collector: Rect = { x: 0, y: 0, width: 24, height: 32 };

  it("collects overlapping items exactly once", () => {
    const items = createItems([coin(0, 4, "item_1")]);
    const first = collectItems(items, collector);
    expect(first.map((item) => item.instanceId)).toEqual(["item_1"]);
    expect(items[0].collected).toBe(true);
    expect(collectItems(items, collector)).toEqual([]);
  });

  it("ignores items outside the collector", () => {
    const items = createItems([coin(200, 200, "item_far")]);
    expect(collectItems(items, collector)).toEqual([]);
    expect(items[0].collected).toBe(false);
  });

  it("returns only the items touched in this call", () => {
    const items = createItems([coin(0, 4, "near"), coin(400, 400, "far")]);
    const picked = collectItems(items, collector);
    expect(picked).toHaveLength(1);
    expect(picked[0].instanceId).toBe("near");
    expect(items[1].collected).toBe(false);
  });
});
