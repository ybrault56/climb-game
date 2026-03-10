import { clamp } from "../../core/math/clamp";
import type { RankTier, RunSnapshot } from "../types";

export type RunHeatState = "flow" | "heat" | "rush";

export interface RunStateFusion {
  pressure: number;
  pressureNormalized: number;
  state: RunHeatState;
}

export function createRunStateFusion(
  snapshot: RunSnapshot,
  fireballIntensity: number,
  scoreMomentum = 0,
): RunStateFusion {
  const pressure = computeRunPressure(snapshot, fireballIntensity, scoreMomentum);
  return {
    pressure,
    pressureNormalized: clamp(pressure / 1.1, 0, 1),
    state: resolveRunHeatState(pressure),
  };
}

export function computeRunPressure(
  snapshot: RunSnapshot,
  fireballIntensity: number,
  scoreMomentum = 0,
): number {
  const scorePressure = clamp(snapshot.score.current / 5200, 0, 1.1);
  const rankPressure = rankToPressure(snapshot.score.rank);
  const comboPressure = clamp(snapshot.score.combo / 22, 0, 1);
  const multiplierPressure = clamp((snapshot.score.multiplier - 1) / 0.72, 0, 1);

  return clamp(
    scorePressure * 0.2 +
      rankPressure * 0.27 +
      snapshot.score.flowLevel * 0.44 +
      comboPressure * 0.12 +
      multiplierPressure * 0.11 +
      clamp(scoreMomentum, 0, 1.5) * 0.34 +
      clamp(fireballIntensity, 0, 1) * 0.18,
    0,
    1.5,
  );
}

export function resolveRunHeatState(pressure: number): RunHeatState {
  if (pressure >= 0.9) {
    return "rush";
  }

  if (pressure >= 0.58) {
    return "heat";
  }

  return "flow";
}

export function rankToPressure(rank: RankTier): number {
  if (rank === "SS") {
    return 1;
  }

  if (rank === "S") {
    return 0.8;
  }

  if (rank === "A") {
    return 0.58;
  }

  if (rank === "B") {
    return 0.35;
  }

  return 0.12;
}

