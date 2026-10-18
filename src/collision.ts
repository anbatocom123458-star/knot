// KNOT — pure rectangle/solid helpers shared by player, enemy and bomb logic.

import type { Hitbox, Rect } from "./types";

export function overlap(first: Rect, second: Rect): boolean {
  return first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y;
}

export function blockRect(block: { x: number; y: number }, tileSize: number): Rect {
  return { x: block.x, y: block.y, width: tileSize, height: tileSize };
}

export function hitboxRect(x: number, y: number, hitbox: Hitbox): Rect {
  return {
    x: x + hitbox.offsetX,
    y: y + hitbox.offsetY,
    width: hitbox.width,
    height: hitbox.height
  };
}

export function pointInSolid(px: number, py: number, solids: Rect[]): boolean {
  return solids.some((solid) =>
    px >= solid.x && px < solid.x + solid.width &&
    py >= solid.y && py < solid.y + solid.height
  );
}

/**
 * Detect a solid wall directly beside a body, using a small tolerance so a
 * body resting flush against a tile still registers. Returns -1 when the wall
 * is on the left, 1 when on the right, 0 when no wall is close enough.
 */
export function detectWall(
  x: number,
  y: number,
  width: number,
  height: number,
  solids: Rect[],
  tolerance = 2
): -1 | 0 | 1 {
  let best: -1 | 0 | 1 = 0;
  let bestGap = Infinity;
  for (const solid of solids) {
    const verticalOverlap = solid.y < y + height && solid.y + solid.height > y;
    if (!verticalOverlap) continue;
    const rightGap = solid.x - (x + width);
    if (rightGap >= -4 && rightGap <= tolerance && Math.abs(rightGap) < Math.abs(bestGap)) {
      best = 1;
      bestGap = rightGap;
    }
    const leftGap = x - (solid.x + solid.width);
    if (leftGap >= -4 && leftGap <= tolerance && Math.abs(leftGap) < Math.abs(bestGap)) {
      best = -1;
      bestGap = leftGap;
    }
  }
  return best;
}
