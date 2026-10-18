// KNOT — pure jump / wall-slide decision helpers (unit-testable, no DOM).

export const FIRST_JUMP_VELOCITY = -520;
export const SECOND_JUMP_VELOCITY = -470;
export const WALL_SLIDE_MAX_FALL = 140;
export const WALL_JUMP_VELOCITY_Y = -500;
export const WALL_JUMP_VELOCITY_X = 300;
export const WALL_JUMP_LOCK_SECONDS = 0.18;

export interface JumpInput {
  jumpRequested: boolean;
  grounded: boolean;
  jumpsUsed: number;
  wallDir: -1 | 0 | 1;
  wallJumpLock: number;
}

export interface JumpOutcome {
  velocityY: number;
  velocityX?: number;
  jumpsUsed: number;
  doubleJumping: boolean;
  wallJumpLock?: number;
  puff?: boolean;
}

/**
 * Decide what a jump press does. Priority: grounded jump, then wall jump,
 * then the remaining mid-air jump. Returns null when the press does nothing
 * (the caller still consumes the press, matching the original demo).
 */
export function resolveJump(input: JumpInput): JumpOutcome | null {
  if (!input.jumpRequested) return null;
  if (input.grounded) {
    return { velocityY: FIRST_JUMP_VELOCITY, jumpsUsed: 1, doubleJumping: false };
  }
  if (input.wallDir !== 0 && input.wallJumpLock <= 0) {
    return {
      velocityY: WALL_JUMP_VELOCITY_Y,
      velocityX: -input.wallDir * WALL_JUMP_VELOCITY_X,
      jumpsUsed: 1,
      doubleJumping: false,
      wallJumpLock: WALL_JUMP_LOCK_SECONDS
    };
  }
  if (input.jumpsUsed === 1) {
    return { velocityY: SECOND_JUMP_VELOCITY, jumpsUsed: 2, doubleJumping: true, puff: true };
  }
  return null;
}

export interface WallSlideState {
  grounded: boolean;
  wallDir: -1 | 0 | 1;
  /** Movement axis currently held: -1 left, 0 none, 1 right. */
  axis: number;
  wallJumpLock: number;
}

/**
 * Clamp fall speed while sliding down a wall. Requires pressing INTO the
 * wall, being airborne, and not being inside the wall-jump re-grab lock.
 */
export function clampWallSlide(velocityY: number, state: WallSlideState): number {
  if (state.grounded) return velocityY;
  if (state.wallDir === 0) return velocityY;
  if (state.wallJumpLock > 0) return velocityY;
  if (state.axis !== state.wallDir) return velocityY;
  if (velocityY < 0) return velocityY;
  return Math.min(velocityY, WALL_SLIDE_MAX_FALL);
}
