import { clamp } from "../../core/math/clamp";
import type { InputFrame, PlayerState } from "../types";
import { GAMEPLAY_TUNING } from "../tuning";

export interface RawInputState {
  pointerActive: boolean;
  pointerX: number | null;
  moveLeft: boolean;
  moveRight: boolean;
  jump: boolean;
  retry: boolean;
}

export class PlayerInputSystem {
  toInputFrame(raw: RawInputState): InputFrame {
    return {
      targetX: raw.pointerActive && raw.pointerX !== null ? clamp(raw.pointerX, -1, 1) : null,
      driftDirection: raw.moveLeft === raw.moveRight ? 0 : raw.moveLeft ? -1 : 1,
      jumpPressed: raw.jump,
      retryPressed: raw.retry,
    };
  }

  movePlayer(player: PlayerState, input: InputFrame, deltaMs: number): PlayerState {
    const deltaSec = Math.max(0, deltaMs) / 1000;
    if (deltaSec <= 0) {
      return player;
    }

    const maxX = GAMEPLAY_TUNING.input.maxX;
    let nextX = player.x;

    if (input.targetX !== null) {
      const distance = input.targetX - player.x;
      if (Math.abs(distance) <= GAMEPLAY_TUNING.input.pointerDeadzone) {
        nextX = input.targetX;
      } else {
        const followAlpha = this.toFrameAlpha(GAMEPLAY_TUNING.input.pointerFollowSharpness, deltaSec);
        const softenedTarget = player.x + distance * followAlpha;
        const maxStep = GAMEPLAY_TUNING.input.pointerFollowMaxSpeed * deltaSec;
        nextX = this.moveTowards(player.x, softenedTarget, maxStep);
      }
    } else if (input.driftDirection !== 0) {
      nextX = player.x + input.driftDirection * GAMEPLAY_TUNING.input.keyboardDriftSpeed * deltaSec;
    }

    nextX = clamp(nextX, -maxX, maxX);
    const rawVelocityX = (nextX - player.x) / deltaSec;

    let jumpCooldownMs = Math.max(0, player.jumpCooldownMs - deltaMs);
    let velocityY = player.velocityY;
    let y = player.y;
    let jumpCount = player.jumpCount;

    const grounded = y <= 0.0001;
    if (grounded && velocityY < 0) {
      velocityY = 0;
    }

    if (input.jumpPressed && grounded && jumpCooldownMs <= 0) {
      velocityY = GAMEPLAY_TUNING.jump.burstVelocity;
      jumpCooldownMs = GAMEPLAY_TUNING.jump.cooldownMs;
      jumpCount += 1;
    }

    velocityY -= GAMEPLAY_TUNING.jump.gravity * deltaSec;
    y += velocityY * deltaSec;

    if (y <= 0) {
      y = 0;
      if (velocityY < 0) {
        velocityY = 0;
      }
    }

    y = clamp(y, 0, GAMEPLAY_TUNING.jump.maxY);

    return {
      x: nextX,
      velocityX: clamp(
        rawVelocityX,
        -GAMEPLAY_TUNING.input.maxVelocityForEffects,
        GAMEPLAY_TUNING.input.maxVelocityForEffects,
      ),
      y,
      velocityY,
      jumpCooldownMs,
      jumpCount,
    };
  }

  private toFrameAlpha(sharpness: number, deltaSec: number): number {
    return 1 - Math.exp(-Math.max(0, sharpness) * deltaSec);
  }

  private moveTowards(current: number, target: number, maxStep: number): number {
    if (Math.abs(target - current) <= maxStep) {
      return target;
    }

    return current + Math.sign(target - current) * maxStep;
  }
}
