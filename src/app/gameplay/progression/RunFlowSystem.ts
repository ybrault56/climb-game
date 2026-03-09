import type { DifficultySnapshot, RunSnapshot } from "../types";
import { BonusSystem } from "../bonus/BonusSystem";
import { PhaseShiftSystem } from "../phase/PhaseShiftSystem";
import { ScoreSystem } from "../scoring/ScoreSystem";

export class RunFlowSystem {
  private readonly phaseSystem = new PhaseShiftSystem();
  private readonly bonusSystem = new BonusSystem();
  private readonly scoreSystem = new ScoreSystem();

  createIdle(bestScore: number, difficulty: DifficultySnapshot): RunSnapshot {
    return {
      status: "idle",
      elapsedMs: 0,
      player: {
        x: 0,
        velocityX: 0,
        y: 0,
        velocityY: 0,
        jumpCooldownMs: 0,
        jumpCount: 0,
      },
      phase: this.phaseSystem.createInitial(),
      power: this.bonusSystem.createInitialPower(),
      obstacles: [],
      bonuses: [],
      difficulty,
      score: this.scoreSystem.createInitial(bestScore),
    };
  }

  start(bestScore: number, difficulty: DifficultySnapshot): RunSnapshot {
    return {
      ...this.createIdle(bestScore, difficulty),
      status: "running",
    };
  }

  fail(snapshot: RunSnapshot): RunSnapshot {
    return {
      ...snapshot,
      status: "failed",
    };
  }
}
