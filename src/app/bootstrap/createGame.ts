import Phaser from "phaser";
import { NoopAnalytics } from "../analytics/NoopAnalytics";
import { AudioService } from "../audio/AudioService";
import { createGameConfig } from "./config";
import { GameStore } from "../core/state/GameStore";
import { HighscoreRepository } from "../data/highscore/HighscoreRepository";
import { RunSaveRepository } from "../data/save/RunSaveRepository";
import type { RunStatEntry, RunStatsSummary } from "../data/save/RunStats";
import { RunStatsRepository } from "../data/save/RunStatsRepository";
import { LocalStorageAdapter } from "../data/storage/LocalStorageAdapter";
import {
  createGameEvents,
  registerSceneServices,
  type SceneServices,
} from "../gameplay/contracts/SceneSystemContract";
import { BonusSystem } from "../gameplay/bonus/BonusSystem";
import { DifficultySystem } from "../gameplay/difficulty/DifficultySystem";
import { ScreenFxService } from "../gameplay/fx/ScreenFxService";
import { ObstacleSystem } from "../gameplay/obstacles/ObstacleSystem";
import { PhaseShiftSystem } from "../gameplay/phase/PhaseShiftSystem";
import { PlayerInputSystem } from "../gameplay/player/PlayerInputSystem";
import { RunFlowSystem } from "../gameplay/progression/RunFlowSystem";
import { ScoreSystem } from "../gameplay/scoring/ScoreSystem";
import { SpawnSystem } from "../gameplay/spawning/SpawnSystem";

interface NeonShaftDebugApi {
  clearStats: () => void;
  getStats: () => readonly RunStatEntry[];
  getSummary: () => RunStatsSummary;
  printSummary: () => void;
}

type WindowWithDebug = Window & {
  NeonShaftDebug?: NeonShaftDebugApi;
};

function printRunSummary(stats: readonly RunStatEntry[], summary: RunStatsSummary): void {
  const shortRuns = stats.filter((entry) => entry.durationMs < 3000).length;
  const shortRunsRate = stats.length === 0 ? 0 : shortRuns / stats.length;

  const positionDistribution: Record<string, number> = {
    left: 0,
    center: 0,
    right: 0,
  };

  const obstacleDistribution: Record<string, number> = {};

  for (const entry of stats) {
    positionDistribution[entry.deathPositionBucket] =
      (positionDistribution[entry.deathPositionBucket] ?? 0) + 1;

    obstacleDistribution[entry.deathObstacleKind] =
      (obstacleDistribution[entry.deathObstacleKind] ?? 0) + 1;
  }

  console.groupCollapsed(
    `[NeonShaft] runs=${summary.runCount} median=${(summary.medianRunMs / 1000).toFixed(1)}s avg=${(summary.averageRunMs / 1000).toFixed(1)}s retry=${(summary.immediateRetryRate * 100).toFixed(0)}%`,
  );

  console.table({
    runCount: summary.runCount,
    medianRunSec: Number((summary.medianRunMs / 1000).toFixed(2)),
    averageRunSec: Number((summary.averageRunMs / 1000).toFixed(2)),
    retryImmediateRatePct: Number((summary.immediateRetryRate * 100).toFixed(1)),
    shortRunsUnder3sRatePct: Number((shortRunsRate * 100).toFixed(1)),
  });

  console.table({
    averageJumpCount: summary.averageJumpCount,
    averageBonusCollectedCount: summary.averageBonusCollectedCount,
    averageFireballPickupCount: summary.averageFireballPickupCount,
    averageFireballBreakCount: summary.averageFireballBreakCount,
    averageShardCount: summary.averageShardCount,
    averageComboPeak: summary.averageComboPeak,
  });

  console.table(summary.deathCauseDistribution);
  console.table(positionDistribution);
  console.table(obstacleDistribution);
  console.groupEnd();
}

export function createGame(containerId: string): Phaser.Game {
  const storage = new LocalStorageAdapter("climb-game");
  const highscoreRepository = new HighscoreRepository(storage);
  const runSaveRepository = new RunSaveRepository(storage);
  const runStatsRepository = new RunStatsRepository(storage);

  const difficultySystem = new DifficultySystem();
  const runFlowSystem = new RunFlowSystem();
  const bestScore = highscoreRepository.loadBestScore();
  const initialState = runFlowSystem.createIdle(bestScore, difficultySystem.compute(0));

  const services: SceneServices = {
    systems: {
      difficulty: difficultySystem,
      score: new ScoreSystem(),
      input: new PlayerInputSystem(),
      obstacles: new ObstacleSystem(),
      bonus: new BonusSystem(),
      spawning: new SpawnSystem(),
      phase: new PhaseShiftSystem(),
      runFlow: runFlowSystem,
      fx: new ScreenFxService(),
    },
    events: createGameEvents(),
    store: new GameStore(initialState),
    highscoreRepository,
    runSaveRepository,
    runStatsRepository,
    analytics: new NoopAnalytics(),
    audio: new AudioService(),
  };

  if (typeof window !== "undefined") {
    const windowWithDebug = window as WindowWithDebug;
    windowWithDebug.NeonShaftDebug = {
      clearStats: () => runStatsRepository.clearStats(),
      getStats: () => runStatsRepository.list(),
      getSummary: () => runStatsRepository.getSummary(),
      printSummary: () => {
        const stats = runStatsRepository.list();
        const summary = runStatsRepository.getSummary();
        printRunSummary(stats, summary);
      },
    };
  }

  registerSceneServices(services);
  return new Phaser.Game(createGameConfig(containerId));
}
