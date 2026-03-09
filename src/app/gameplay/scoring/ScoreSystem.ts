import { clamp } from "../../core/math/clamp";
import { GAMEPLAY_TUNING } from "../tuning";
import type { BonusCollectEvent, PassEvent, RankTier, ScoreState } from "../types";

const SCORE_PER_SECOND = 14;

export interface ScoreFrameInput {
  passEvents: readonly PassEvent[];
  bonusEvents: readonly BonusCollectEvent[];
  brokenWalls: number;
  jumpClears: number;
}

export class ScoreSystem {
  createInitial(bestScore: number): ScoreState {
    return {
      current: 0,
      best: bestScore,
      precisionChain: 0,
      survivalMs: 0,
      bonusScore: 0,
      nearMissCount: 0,
      perfectPassCount: 0,
      flowLevel: 0,
      phaseBonusScore: 0,
      phasePrecisionCount: 0,
      combo: 0,
      comboPeak: 0,
      comboTimerMs: 0,
      multiplier: 1,
      shardCount: 0,
      fireballBreakCount: 0,
      rank: "C",
    };
  }

  tick(previous: ScoreState, deltaMs: number, frame: ScoreFrameInput): ScoreState {
    const survivalMs = previous.survivalMs + Math.max(0, deltaMs);
    const survivalScore = Math.floor((survivalMs / 1000) * SCORE_PER_SECOND);

    let precisionChain = previous.precisionChain;
    let bonusScore = previous.bonusScore;
    let nearMissCount = previous.nearMissCount;
    let perfectPassCount = previous.perfectPassCount;
    let combo = previous.combo;
    let comboPeak = previous.comboPeak;
    let comboTimerMs = Math.max(0, previous.comboTimerMs - deltaMs);
    let shardCount = previous.shardCount;
    let fireballBreakCount = previous.fireballBreakCount;

    let rewardTriggers = 0;

    for (const event of frame.passEvents) {
      if (event.quality === "near_miss") {
        nearMissCount += 1;
        precisionChain += 1;
        const points = this.withRisk(GAMEPLAY_TUNING.skill.nearMissBonus, event.risk);
        bonusScore += this.comboBoost(points, combo);
        rewardTriggers += 1;
        continue;
      }

      if (event.quality === "perfect_pass") {
        perfectPassCount += 1;
        precisionChain += 2;
        const points = this.withRisk(GAMEPLAY_TUNING.skill.perfectPassBonus, event.risk + 0.15);
        bonusScore += this.comboBoost(points, combo + 1);
        rewardTriggers += 1;
        continue;
      }

      if (event.quality === "jump_clear") {
        precisionChain += 1;
        bonusScore += this.comboBoost(GAMEPLAY_TUNING.skill.jumpClearBonus, combo);
        rewardTriggers += 1;
        continue;
      }

      precisionChain = Math.max(0, precisionChain - GAMEPLAY_TUNING.skill.streakDecayOnClean);
    }

    if (frame.jumpClears > 0) {
      bonusScore += frame.jumpClears * GAMEPLAY_TUNING.skill.jumpClearBonus;
      rewardTriggers += frame.jumpClears;
    }

    if (frame.brokenWalls > 0) {
      fireballBreakCount += frame.brokenWalls;
      bonusScore += frame.brokenWalls * GAMEPLAY_TUNING.power.fireballBreakScore;
      precisionChain += frame.brokenWalls;
      rewardTriggers += frame.brokenWalls * 2;
    }

    for (const bonusEvent of frame.bonusEvents) {
      bonusScore += Math.max(0, bonusEvent.value);
      rewardTriggers += 1;

      if (bonusEvent.kind === "shard") {
        shardCount += 1;
      }

      if (bonusEvent.kind === "score_burst") {
        rewardTriggers += 1;
      }

      if (bonusEvent.kind === "fireball") {
        precisionChain += 1;
      }
    }

    if (rewardTriggers > 0) {
      combo = Math.min(99, combo + rewardTriggers);
      comboPeak = Math.max(comboPeak, combo);
      comboTimerMs = GAMEPLAY_TUNING.skill.comboTimeoutMs;
    } else if (comboTimerMs <= 0) {
      combo = Math.max(0, combo - 1);
      if (combo > 0) {
        comboTimerMs = 320;
      }
    }

    const multiplier = this.resolveMultiplier(combo);
    const total = survivalScore + Math.round(bonusScore * multiplier);
    const rank = this.resolveRank(total);

    return {
      current: total,
      best: Math.max(previous.best, total),
      precisionChain,
      survivalMs,
      bonusScore,
      nearMissCount,
      perfectPassCount,
      flowLevel: clamp(combo / GAMEPLAY_TUNING.skill.maxStreakForFlow, 0, 1),
      phaseBonusScore: 0,
      phasePrecisionCount: 0,
      combo,
      comboPeak,
      comboTimerMs,
      multiplier,
      shardCount,
      fireballBreakCount,
      rank,
    };
  }

  private resolveMultiplier(combo: number): number {
    const steps = Math.min(6, Math.floor(combo / 3));
    return 1 + steps * 0.12;
  }

  private resolveRank(score: number): RankTier {
    if (score >= 5200) {
      return "SS";
    }

    if (score >= 3400) {
      return "S";
    }

    if (score >= 2200) {
      return "A";
    }

    if (score >= 1000) {
      return "B";
    }

    return "C";
  }

  private comboBoost(base: number, combo: number): number {
    const comboRatio = clamp(combo / 20, 0, 1);
    return Math.round(base * (1 + comboRatio * 0.24));
  }

  private withRisk(base: number, risk: number): number {
    const riskBoost = clamp(risk, 0, 1.2) * 0.34;
    return Math.round(base * (1 + riskBoost));
  }
}
