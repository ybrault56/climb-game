import type { AnalyticsPort } from "../../analytics/AnalyticsPort";
import type { AudioService } from "../../audio/AudioService";
import { EventBus, type EventPayloadMap } from "../../core/events/EventBus";
import { GameStore } from "../../core/state/GameStore";
import type { HighscoreRepository } from "../../data/highscore/HighscoreRepository";
import type { RunSaveRepository } from "../../data/save/RunSaveRepository";
import type { RunStatsRepository } from "../../data/save/RunStatsRepository";
import { BonusSystem } from "../bonus/BonusSystem";
import { DifficultySystem } from "../difficulty/DifficultySystem";
import { ScreenFxService } from "../fx/ScreenFxService";
import { ObstacleSystem } from "../obstacles/ObstacleSystem";
import { PhaseShiftSystem } from "../phase/PhaseShiftSystem";
import { PlayerInputSystem } from "../player/PlayerInputSystem";
import { RunFlowSystem } from "../progression/RunFlowSystem";
import { ScoreSystem } from "../scoring/ScoreSystem";
import { SpawnSystem } from "../spawning/SpawnSystem";
import type { RunSnapshot } from "../types";

export interface GameEventMap extends EventPayloadMap {
  "run:started": RunSnapshot;
  "run:failed": RunSnapshot;
  "run:retry": { attempt: number };
  "score:updated": { score: number; best: number };
}

export interface SceneSystems {
  difficulty: DifficultySystem;
  score: ScoreSystem;
  input: PlayerInputSystem;
  obstacles: ObstacleSystem;
  bonus: BonusSystem;
  spawning: SpawnSystem;
  phase: PhaseShiftSystem;
  runFlow: RunFlowSystem;
  fx: ScreenFxService;
}

export interface SceneServices {
  systems: SceneSystems;
  events: EventBus<GameEventMap>;
  store: GameStore<RunSnapshot>;
  highscoreRepository: HighscoreRepository;
  runSaveRepository: RunSaveRepository;
  runStatsRepository: RunStatsRepository;
  analytics: AnalyticsPort;
  audio: AudioService;
}

let servicesRef: SceneServices | null = null;

export function registerSceneServices(services: SceneServices): void {
  servicesRef = services;
}

export function resolveSceneServices(): SceneServices {
  if (!servicesRef) {
    throw new Error("Scene services are not registered.");
  }

  return servicesRef;
}

export function createGameEvents(): EventBus<GameEventMap> {
  return new EventBus<GameEventMap>();
}
