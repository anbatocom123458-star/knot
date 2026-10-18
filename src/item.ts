// KNOT — collectible item module (coins, gems, bomb pickups).

import { hitboxRect, overlap } from "./collision";
import type { MapItemSpec, Rect } from "./types";

export const ITEM_SLOT_SIZE = 32;

export interface ItemState {
  instanceId: string;
  assetId: string;
  kind: MapItemSpec["kind"];
  x: number;
  y: number;
  width: number;
  height: number;
  hitbox: MapItemSpec["hitbox"];
  collected: boolean;
}

export function createItems(specs: MapItemSpec[] | undefined): ItemState[] {
  return (specs ?? []).map((spec) => ({
    instanceId: spec.instanceId,
    assetId: spec.assetId,
    kind: spec.kind,
    x: spec.x,
    y: spec.y,
    width: ITEM_SLOT_SIZE,
    height: ITEM_SLOT_SIZE,
    hitbox: spec.hitbox,
    collected: false
  }));
}

export function itemRect(item: ItemState): Rect {
  return hitboxRect(item.x, item.y, item.hitbox);
}

/**
 * Mark every item overlapping `collector` as collected and return the items
 * picked up during this call (each item is reported exactly once).
 */
export function collectItems(items: ItemState[], collector: Rect): ItemState[] {
  const picked: ItemState[] = [];
  for (const item of items) {
    if (item.collected) continue;
    if (!overlap(collector, itemRect(item))) continue;
    item.collected = true;
    picked.push(item);
  }
  return picked;
}
