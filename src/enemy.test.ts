import { describe, expect, it } from "vitest";
import {
  createEnemies,
  enemyRect,
  isStomp,
  killEnemy,
  updateEnemies,
  type EnemyState
} from "./enemy";
import type { MapEnemySpec, Rect } from "./types";

const PLATFORM: Rect = { x: 0, y: 100, width: 200, height: 32 };
const STEP = 1 / 60;

function spec(overrides: Partial<MapEnemySpec> = {}): MapEnemySpec {
  return {
    instanceId: "enemy_test",
    assetId: "EN01",
    x: 100,
    y: 68, // slot bottom = platform top
    hitbox: { offsetX: 4, offsetY: 14, width: 24, height: 18 },
    patrol: { minX: 0, maxX: 200 },
    speed: 60,
    ...overrides
  };
}

function groundedEnemy(overrides: Partial<MapEnemySpec> = {}): EnemyState {
  const enemy = createEnemies([spec(overrides)])[0];
  updateEnemies([enemy], [PLATFORM], STEP); // first tick lands it
  return enemy;
}

describe("createEnemies", () => {
  it("creates a living right-moving enemy per spec", () => {
    const [enemy] = createEnemies([spec()]);
    expect(enemy.alive).toBe(true);
    expect(enemy.direction).toBe(1);
    expect(enemy.grounded).toBe(false);
    expect(enemy.width).toBe(32);
  });

  it("returns an empty list when the map has no enemies", () => {
    expect(createEnemies(undefined)).toEqual([]);
  });
});

describe("enemy physics", () => {
  it("lands on the platform and stops falling", () => {
    const enemy = groundedEnemy();
    expect(enemy.grounded).toBe(true);
    expect(enemy.y).toBe(68);
    expect(enemy.velocityY).toBe(0);
  });

  it("keeps a 32px hitbox feet on the ground", () => {
    const enemy = groundedEnemy();
    const rect = enemyRect(enemy);
    expect(rect.y + rect.height).toBe(100);
    expect(rect.width).toBe(24);
  });
});

describe("enemy patrol", () => {
  it("clamps at the right patrol bound and turns around", () => {
    const enemy = groundedEnemy({ x: 167, patrol: { minX: 0, maxX: 200 } });
    updateEnemies([enemy], [PLATFORM], STEP);
    expect(enemy.x).toBe(168); // maxX - width
    expect(enemy.direction).toBe(-1);
  });

  it("clamps at the left patrol bound and turns around", () => {
    const enemy = groundedEnemy({ x: 1 });
    enemy.direction = -1;
    for (let i = 0; i < 10; i++) updateEnemies([enemy], [PLATFORM], STEP);
    expect(enemy.x).toBeGreaterThanOrEqual(0);
    expect(enemy.direction).toBe(1);
  });

  it("stays on the platform for many ticks (no walking off ledges)", () => {
    const enemy = groundedEnemy({ x: 100 });
    for (let i = 0; i < 600; i++) {
      updateEnemies([enemy], [PLATFORM], STEP);
      expect(enemy.x).toBeGreaterThanOrEqual(0);
      expect(enemy.x).toBeLessThanOrEqual(168);
    }
    expect(enemy.grounded).toBe(true);
    expect(enemy.y).toBe(68);
  });

  it("turns before a wall instead of overlapping it", () => {
    const wall: Rect = { x: 150, y: 0, width: 32, height: 100 };
    const enemy = groundedEnemy({ x: 121 }); // hitbox right edge = 149, wall face at 150
    for (let i = 0; i < 5; i++) {
      updateEnemies([enemy], [PLATFORM, wall], STEP);
      const rect = enemyRect(enemy);
      expect(rect.x + rect.width).toBeLessThanOrEqual(150); // never penetrates the wall
    }
    expect(enemy.direction).toBe(-1); // walked into the wall, turned around
  });
});

describe("isStomp", () => {
  const enemyRectTop = { x: 0, y: 100, width: 32, height: 18 };

  it("counts a fall onto the enemy top as a stomp", () => {
    expect(isStomp(98, 105, enemyRectTop, 300)).toBe(true);
  });

  it("counts a fast fall that crossed the top this frame as a stomp", () => {
    expect(isStomp(95, 120, enemyRectTop, 700)).toBe(true);
  });

  it("does not stomp when hitting from the side", () => {
    expect(isStomp(115, 120, enemyRectTop, 300)).toBe(false);
  });

  it("does not stomp while rising", () => {
    expect(isStomp(95, 105, enemyRectTop, -200)).toBe(false);
  });
});

describe("killEnemy", () => {
  it("marks the enemy dead and shows the flat frame", () => {
    const enemy = groundedEnemy();
    killEnemy(enemy);
    expect(enemy.alive).toBe(false);
    expect(enemy.deathElapsed).toBe(0);
    killEnemy(enemy); // idempotent
    expect(enemy.deathElapsed).toBe(0);
  });

  it("advances the death timer only for dead enemies", () => {
    const enemy = groundedEnemy();
    killEnemy(enemy);
    updateEnemies([enemy], [PLATFORM], STEP);
    expect(enemy.deathElapsed).toBeCloseTo(STEP, 6);
  });
});
