import { describe, expect, it } from "vitest";
import {
  clampWallSlide,
  resolveJump,
  WALL_JUMP_LOCK_SECONDS,
  WALL_JUMP_VELOCITY_X,
  WALL_SLIDE_MAX_FALL
} from "./player-logic";

describe("resolveJump", () => {
  it("performs the grounded jump", () => {
    const outcome = resolveJump({
      jumpRequested: true,
      grounded: true,
      jumpsUsed: 0,
      wallDir: 0,
      wallJumpLock: 0
    });
    expect(outcome).not.toBeNull();
    expect(outcome?.velocityY).toBe(-520);
    expect(outcome?.jumpsUsed).toBe(1);
    expect(outcome?.doubleJumping).toBe(false);
    expect(outcome?.wallJumpLock).toBeUndefined();
  });

  it("wall jump pushes away from a right wall and arms the re-grab lock", () => {
    const outcome = resolveJump({
      jumpRequested: true,
      grounded: false,
      jumpsUsed: 2,
      wallDir: 1,
      wallJumpLock: 0
    });
    expect(outcome?.velocityX).toBe(-WALL_JUMP_VELOCITY_X); // away: to the left
    expect(outcome?.velocityY).toBe(-500);
    expect(outcome?.jumpsUsed).toBe(1);
    expect(outcome?.wallJumpLock).toBe(WALL_JUMP_LOCK_SECONDS);
  });

  it("wall jump from a left wall pushes right", () => {
    const outcome = resolveJump({
      jumpRequested: true,
      grounded: false,
      jumpsUsed: 2,
      wallDir: -1,
      wallJumpLock: 0
    });
    expect(outcome?.velocityX).toBe(WALL_JUMP_VELOCITY_X);
  });

  it("wall jump wins over the double jump", () => {
    const outcome = resolveJump({
      jumpRequested: true,
      grounded: false,
      jumpsUsed: 1,
      wallDir: 1,
      wallJumpLock: 0
    });
    expect(outcome?.velocityX).toBe(-WALL_JUMP_VELOCITY_X);
    expect(outcome?.doubleJumping).toBe(false);
  });

  it("double jump still works away from walls", () => {
    const outcome = resolveJump({
      jumpRequested: true,
      grounded: false,
      jumpsUsed: 1,
      wallDir: 0,
      wallJumpLock: 0
    });
    expect(outcome?.velocityY).toBe(-470);
    expect(outcome?.jumpsUsed).toBe(2);
    expect(outcome?.doubleJumping).toBe(true);
    expect(outcome?.puff).toBe(true);
  });

  it("no jump left mid-air without a wall", () => {
    expect(
      resolveJump({ jumpRequested: true, grounded: false, jumpsUsed: 2, wallDir: 0, wallJumpLock: 0 })
    ).toBeNull();
  });

  it("wall re-grab is blocked during the lock", () => {
    expect(
      resolveJump({
        jumpRequested: true,
        grounded: false,
        jumpsUsed: 2,
        wallDir: 1,
        wallJumpLock: 0.1
      })
    ).toBeNull();
  });

  it("does nothing without a press", () => {
    expect(
      resolveJump({ jumpRequested: false, grounded: true, jumpsUsed: 0, wallDir: 0, wallJumpLock: 0 })
    ).toBeNull();
  });
});

describe("clampWallSlide", () => {
  const sliding = { grounded: false, wallDir: 1 as const, axis: 1, wallJumpLock: 0 };

  it("clamps fall speed while pressing into the wall", () => {
    expect(clampWallSlide(700, sliding)).toBe(WALL_SLIDE_MAX_FALL);
  });

  it("keeps the speed when not pressing into the wall", () => {
    expect(clampWallSlide(700, { ...sliding, axis: 0 })).toBe(700);
    expect(clampWallSlide(700, { ...sliding, axis: -1 })).toBe(700);
  });

  it("does not slide while grounded", () => {
    expect(clampWallSlide(700, { ...sliding, grounded: true })).toBe(700);
  });

  it("does not slide during the wall-jump lock", () => {
    expect(clampWallSlide(700, { ...sliding, wallJumpLock: 0.1 })).toBe(700);
  });

  it("does not clamp upward motion", () => {
    expect(clampWallSlide(-500, sliding)).toBe(-500);
  });

  it("does nothing without a wall", () => {
    expect(clampWallSlide(700, { ...sliding, wallDir: 0 })).toBe(700);
  });
});
