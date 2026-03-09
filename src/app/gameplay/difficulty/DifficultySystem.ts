import { clamp } from "../../core/math/clamp";
import type { DifficultySnapshot, ObstacleKind } from "../types";
import { GAMEPLAY_TUNING } from "../tuning";

const DEFAULT_OBSTACLE_MIX: readonly ObstacleKind[] = ["solid_wall", "tight_gate"];

const OBSTACLE_MIX_BY_TIER: readonly (readonly ObstacleKind[])[] = [
  ["solid_wall", "tight_gate"],
  ["solid_wall", "tight_gate", "low_wall"],
  ["solid_wall", "tight_gate", "low_wall", "breakable_wall"],
];

export class DifficultySystem {
  compute(elapsedMs: number): DifficultySnapshot {
    const pressure = clamp(elapsedMs / GAMEPLAY_TUNING.difficulty.rampDurationMs, 0, 1);
    const speedCurve = Math.pow(pressure, 0.86);
    const spawnCurve = Math.pow(pressure, 0.92);
    const gapCurve = Math.pow(pressure, 1.03);

    const level = clamp(
      Math.floor(pressure * GAMEPLAY_TUNING.difficulty.maxLevel),
      0,
      GAMEPLAY_TUNING.difficulty.maxLevel,
    );

    const scrollSpeed = Math.round(
      GAMEPLAY_TUNING.difficulty.startScrollSpeed +
        (GAMEPLAY_TUNING.difficulty.maxScrollSpeed - GAMEPLAY_TUNING.difficulty.startScrollSpeed) * speedCurve,
    );

    const spawnEveryMs = Math.round(
      GAMEPLAY_TUNING.difficulty.startSpawnEveryMs -
        (GAMEPLAY_TUNING.difficulty.startSpawnEveryMs - GAMEPLAY_TUNING.difficulty.minSpawnEveryMs) * spawnCurve,
    );

    const gapWidth =
      GAMEPLAY_TUNING.difficulty.startGapWidth -
      (GAMEPLAY_TUNING.difficulty.startGapWidth - GAMEPLAY_TUNING.difficulty.minGapWidth) * gapCurve;

    const tierIndex = Math.min(
      OBSTACLE_MIX_BY_TIER.length - 1,
      Math.floor(pressure * OBSTACLE_MIX_BY_TIER.length),
    );

    return {
      level,
      scrollSpeed,
      spawnEveryMs,
      gapWidth,
      obstacleKinds: OBSTACLE_MIX_BY_TIER[tierIndex] ?? DEFAULT_OBSTACLE_MIX,
    };
  }
}
