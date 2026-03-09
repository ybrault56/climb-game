import type { ObstacleKind } from "../../gameplay/types";

export type RunDeathCause = "obstacle_collision" | "unknown";
export type RunDeathObstacleKind = ObstacleKind | "unknown";
export type DeathPositionBucket = "left" | "center" | "right";

export interface RunStatEntry {
  id: string;
  timestamp: number;
  durationMs: number;
  score: number;
  bestScoreAtRunStart: number;
  deathCause: RunDeathCause;
  deathXNormalized: number;
  deathPositionBucket: DeathPositionBucket;
  deathDifficultyLevel: number;
  deathScrollSpeed: number;
  deathObstacleKind: RunDeathObstacleKind;
  retryImmediate: boolean;
  phaseUsedCount: number;
  phaseHitSavesCount: number;
  phasePerfectCount: number;
  phaseWasteCount: number;
  firstPhaseUseAtMs: number | null;
  scoreFromPhase: number;
  diedWithinMsAfterPhase: number | null;
  deathWhilePhaseActive: boolean;
  deathJustAfterPhase: boolean;
  phaseAvailableButUnused: boolean;
  jumpCount: number;
  bonusCollectedCount: number;
  fireballPickupCount: number;
  fireballBreakCount: number;
  shardCount: number;
  comboPeak: number;
}

export interface RunStatsSummary {
  runCount: number;
  averageRunMs: number;
  medianRunMs: number;
  deathCauseDistribution: Record<RunDeathCause, number>;
  immediateRetryRate: number;
  runsWithPhaseUseRate: number;
  averagePhaseUsedCount: number;
  usefulPhaseActivationRate: number;
  wastedPhaseActivationRate: number;
  deathJustAfterPhaseRate: number;
  phaseAvailableButUnusedRate: number;
  withPhaseRunCount: number;
  withoutPhaseRunCount: number;
  withPhaseAverageRunMs: number;
  withoutPhaseAverageRunMs: number;
  withPhaseAverageScore: number;
  withoutPhaseAverageScore: number;
  averageJumpCount: number;
  averageBonusCollectedCount: number;
  averageFireballPickupCount: number;
  averageFireballBreakCount: number;
  averageShardCount: number;
  averageComboPeak: number;
}

export type NewRunStatEntry = Omit<RunStatEntry, "id">;
