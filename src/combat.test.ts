import { describe, expect, it } from "vitest";
import {
  applyDamage,
  INVULNERABLE_DURATION,
  isPlayerVisible,
  KNOCKBACK_VELOCITY_X,
  MAX_HP,
  tickInvulnerable
} from "./combat";

describe("applyDamage", () => {
  it("applies the first hit with knockback away from the source", () => {
    // player right of the enemy → pushed right
    const result = applyDamage(MAX_HP, 0, 120, 80, 1);
    expect(result.applied).toBe(true);
    expect(result.hp).toBe(MAX_HP - 1);
    expect(result.invulnerable).toBe(INVULNERABLE_DURATION);
    expect(result.velocityX).toBe(KNOCKBACK_VELOCITY_X);
    expect(result.velocityY).toBeLessThan(0);
    expect(result.died).toBe(false);
  });

  it("pushes left when the player is left of the source", () => {
    const result = applyDamage(MAX_HP, 0, 80, 120, -1);
    expect(result.velocityX).toBe(-KNOCKBACK_VELOCITY_X);
  });

  it("ignores hits during invulnerability frames (no double damage)", () => {
    const first = applyDamage(MAX_HP, 0, 120, 80, 1);
    const second = applyDamage(first.hp, first.invulnerable, 120, 80, 1);
    expect(second.applied).toBe(false);
    expect(second.hp).toBe(first.hp);
    expect(second.died).toBe(false);
  });

  it("reports death on the last heart", () => {
    const result = applyDamage(1, 0, 120, 80, 1);
    expect(result.applied).toBe(true);
    expect(result.hp).toBe(0);
    expect(result.died).toBe(true);
  });

  it("falls back to pushing opposite the facing when centers match", () => {
    const result = applyDamage(MAX_HP, 0, 100, 100, 1);
    expect(result.velocityX).toBe(-KNOCKBACK_VELOCITY_X);
  });
});

describe("tickInvulnerable", () => {
  it("counts down and never goes below zero", () => {
    expect(tickInvulnerable(1.2, 0.5)).toBeCloseTo(0.7, 5);
    expect(tickInvulnerable(0.05, 0.2)).toBe(0);
  });
});

describe("isPlayerVisible", () => {
  it("is always visible without i-frames", () => {
    expect(isPlayerVisible(0)).toBe(true);
  });

  it("blinks during i-frames", () => {
    const samples: boolean[] = [];
    for (let t = 1.2; t > 0; t -= 0.016) samples.push(isPlayerVisible(t));
    expect(samples.some((visible) => visible)).toBe(true);
    expect(samples.some((visible) => !visible)).toBe(true);
  });
});
