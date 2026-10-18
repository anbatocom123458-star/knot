import { describe, expect, it } from "vitest";
import {
  BOMB_EXPLOSION_RADIUS,
  createBomb,
  explosionHitsRect,
  updateBombs,
  type ThrownBomb
} from "./bomb";
import type { Rect } from "./types";

const STEP = 1 / 60;
const FLOOR: Rect = { x: 0, y: 100, width: 200, height: 32 };

describe("createBomb", () => {
  it("throws to the right when facing right", () => {
    const bomb = createBomb(50, 60, 1);
    expect(bomb.velocityX).toBeGreaterThan(0);
    expect(bomb.velocityY).toBeLessThan(0);
    expect(bomb.fuse).toBe(1);
    expect(bomb.resting).toBe(false);
  });

  it("throws to the left when facing left", () => {
    expect(createBomb(50, 60, -1).velocityX).toBeLessThan(0);
  });
});

describe("updateBombs", () => {
  it("detonates after the fuse and reports the explosion", () => {
    const bomb = createBomb(100, 40, 1);
    const { bombs, explosions } = updateBombs([bomb], [], 1.5);
    expect(bombs).toEqual([]);
    expect(explosions).toHaveLength(1);
    expect(explosions[0].radius).toBe(BOMB_EXPLOSION_RADIUS);
  });

  it("keeps the bomb while the fuse runs", () => {
    const bomb = createBomb(100, 40, 1);
    const { bombs, explosions } = updateBombs([bomb], [], 0.4);
    expect(bombs).toHaveLength(1);
    expect(explosions).toEqual([]);
    expect(bombs[0].fuse).toBeCloseTo(0.6, 5);
  });

  it("falls, rests on a solid, then detonates when the fuse runs out", () => {
    const bomb: ThrownBomb = { ...createBomb(100, 50, 1), velocityX: 0 };
    let current: ThrownBomb[] = [bomb];
    let steps = 0;
    let sawRest = false;
    while (current.length > 0 && steps < 200) {
      const result = updateBombs(current, [FLOOR], STEP);
      current = result.bombs;
      if (current.length > 0 && current[0].resting) sawRest = true;
      steps += 1;
    }
    expect(current).toEqual([]); // exploded within the step budget
    expect(sawRest).toBe(true); // it landed on the floor before detonating
    expect(steps).toBeGreaterThanOrEqual(55); // ~1s fuse at 60Hz
    expect(steps).toBeLessThanOrEqual(75);
  });

  it("rests at the platform surface when the fuse is long", () => {
    const bomb: ThrownBomb = { ...createBomb(100, 50, 1), velocityX: 0, fuse: 30 };
    let current: ThrownBomb[] = [bomb];
    for (let i = 0; i < 180; i++) {
      current = updateBombs(current, [FLOOR], STEP).bombs;
    }
    expect(current).toHaveLength(1);
    expect(current[0].resting).toBe(true);
    expect(current[0].y).toBe(76); // floor top 100 - bomb height 24
    expect(current[0].velocityX).toBe(0);
  });

  it("stops against a wall instead of passing through", () => {
    const wall: Rect = { x: 200, y: 0, width: 32, height: 200 };
    const bomb: ThrownBomb = { ...createBomb(170, 50, 1), velocityY: 0, fuse: 30 };
    let current: ThrownBomb[] = [bomb];
    for (let i = 0; i < 10; i++) current = updateBombs(current, [wall], STEP).bombs;
    expect(current[0].resting).toBe(true);
    expect(current[0].x).toBe(176); // pressed flush against the wall face
    expect(current[0].velocityX).toBe(0);
  });
});

describe("explosionHitsRect", () => {
  const explosion = { x: 100, y: 100, radius: 64 };

  it("hits a rect inside the radius", () => {
    expect(explosionHitsRect(explosion, { x: 120, y: 90, width: 24, height: 18 })).toBe(true);
  });

  it("misses a rect outside the radius", () => {
    expect(explosionHitsRect(explosion, { x: 300, y: 300, width: 24, height: 18 })).toBe(false);
  });
});
