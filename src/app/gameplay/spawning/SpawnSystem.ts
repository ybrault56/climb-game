import { clamp } from "../../core/math/clamp";
import type { BonusKind, BonusState, DifficultySnapshot, ObstacleKind, ObstacleSignature, ObstacleState } from "../types";
import { GAMEPLAY_TUNING } from "../tuning";

type RunChapter = "calibration" | "lateral_nervous" | "fire_pressure" | "flow_mastery";

export interface SpawnAccumulator {
  elapsedSinceObstacleMs: number;
  elapsedSinceBonusMs: number;
  nextObstacleId: number;
  nextBonusId: number;
  lastGapCenterX: number;
  lastObstacleKind: ObstacleKind | null;
  spawnCount: number;
}

export interface SpawnTickResult {
  accumulator: SpawnAccumulator;
  spawnedObstacles: ObstacleState[];
  spawnedBonuses: BonusState[];
}

export class SpawnSystem {
  createAccumulator(): SpawnAccumulator {
    return {
      elapsedSinceObstacleMs: 0,
      elapsedSinceBonusMs: 0,
      nextObstacleId: 1,
      nextBonusId: 1,
      lastGapCenterX: 0,
      lastObstacleKind: null,
      spawnCount: 0,
    };
  }

  tick(
    accumulator: SpawnAccumulator,
    deltaMs: number,
    elapsedMs: number,
    difficulty: DifficultySnapshot,
    random: () => number = Math.random,
  ): SpawnTickResult {
    let elapsedSinceObstacleMs = accumulator.elapsedSinceObstacleMs + deltaMs;
    let elapsedSinceBonusMs = accumulator.elapsedSinceBonusMs + deltaMs;
    let nextObstacleId = accumulator.nextObstacleId;
    let nextBonusId = accumulator.nextBonusId;
    let lastGapCenterX = accumulator.lastGapCenterX;
    let lastObstacleKind = accumulator.lastObstacleKind;
    let spawnCount = accumulator.spawnCount;

    const spawnedObstacles: ObstacleState[] = [];
    const spawnedBonuses: BonusState[] = [];

    while (elapsedSinceObstacleMs >= difficulty.spawnEveryMs) {
      elapsedSinceObstacleMs -= difficulty.spawnEveryMs;
      const spawnAtMs = Math.max(0, elapsedMs - elapsedSinceObstacleMs);

      const kind = this.pickObstacleKind(spawnAtMs, difficulty, lastObstacleKind, spawnCount, random);
      const signature = this.signatureForKind(kind);
      const gapWidth = this.resolveGapWidth(kind, difficulty.gapWidth);
      const gapCenterX = this.resolveGapCenter(kind, gapWidth, lastGapCenterX, random);

      spawnedObstacles.push({
        id: nextObstacleId,
        y: GAMEPLAY_TUNING.spawn.obstacleSpawnY,
        gapCenterX,
        gapWidth,
        kind,
        thicknessPx: this.thicknessForKind(kind),
        signature,
        risk: this.riskForKind(kind),
      });

      nextObstacleId += 1;
      lastGapCenterX = gapCenterX;
      lastObstacleKind = kind;
      spawnCount += 1;
    }

    const bonusEveryMs = Math.max(
      GAMEPLAY_TUNING.bonus.minSpawnEveryMs,
      GAMEPLAY_TUNING.bonus.spawnEveryMs - difficulty.level * 12,
    );

    while (elapsedSinceBonusMs >= bonusEveryMs) {
      elapsedSinceBonusMs -= bonusEveryMs;
      const kind = this.pickBonusKind(difficulty, elapsedMs, lastObstacleKind, random);
      const x = this.pickBonusX(lastGapCenterX, random);

      spawnedBonuses.push({
        id: nextBonusId,
        x,
        y: GAMEPLAY_TUNING.bonus.spawnY,
        kind,
        value: this.valueForBonus(kind),
      });

      nextBonusId += 1;
    }

    return {
      accumulator: {
        elapsedSinceObstacleMs,
        elapsedSinceBonusMs,
        nextObstacleId,
        nextBonusId,
        lastGapCenterX,
        lastObstacleKind,
        spawnCount,
      },
      spawnedObstacles,
      spawnedBonuses,
    };
  }

  private pickObstacleKind(
    elapsedMs: number,
    difficulty: DifficultySnapshot,
    lastKind: ObstacleKind | null,
    spawnCount: number,
    random: () => number,
  ): ObstacleKind {
    const chapter = this.resolveChapter(elapsedMs);

    // Semi-authored highlights to create capture moments.
    if (chapter === "fire_pressure" && spawnCount % 7 === 4) {
      return "breakable_wall";
    }

    if (chapter === "lateral_nervous" && spawnCount % 6 === 3) {
      return "tight_gate";
    }

    const roll = random();
    const pressure = clamp(difficulty.level / GAMEPLAY_TUNING.difficulty.maxLevel, 0, 1);

    let kind: ObstacleKind;
    if (roll < GAMEPLAY_TUNING.spawn.tightGateChance + pressure * 0.08) {
      kind = "tight_gate";
    } else if (roll < GAMEPLAY_TUNING.spawn.tightGateChance + GAMEPLAY_TUNING.spawn.solidWallChance) {
      kind = "solid_wall";
    } else if (roll < GAMEPLAY_TUNING.spawn.tightGateChance + GAMEPLAY_TUNING.spawn.solidWallChance + GAMEPLAY_TUNING.spawn.lowWallChance) {
      kind = "low_wall";
    } else {
      kind = difficulty.level >= 4 ? "breakable_wall" : "solid_wall";
    }

    const jumpBased = kind === "low_wall" || kind === "breakable_wall";
    const previousJumpBased = lastKind === "low_wall" || lastKind === "breakable_wall";

    if (jumpBased && previousJumpBased) {
      return "solid_wall";
    }

    if (kind === "breakable_wall" && chapter === "calibration") {
      return "solid_wall";
    }

    return kind;
  }

  private pickBonusKind(
    difficulty: DifficultySnapshot,
    elapsedMs: number,
    lastKind: ObstacleKind | null,
    random: () => number,
  ): BonusKind {
    const chapter = this.resolveChapter(elapsedMs);

    if (lastKind === "breakable_wall" && random() < 0.5) {
      return "fireball";
    }

    const pressure = clamp(difficulty.level / GAMEPLAY_TUNING.difficulty.maxLevel, 0, 1);
    const roll = random();

    const fireballChance = GAMEPLAY_TUNING.bonus.fireballChance + (chapter === "fire_pressure" ? 0.06 : 0) + pressure * 0.02;
    const scoreBurstChance = GAMEPLAY_TUNING.bonus.scoreBurstChance + pressure * 0.04;

    if (roll < fireballChance) {
      return "fireball";
    }

    if (roll < fireballChance + scoreBurstChance) {
      return "score_burst";
    }

    if (roll < fireballChance + scoreBurstChance + GAMEPLAY_TUNING.bonus.shieldChance) {
      return "shield";
    }

    if (roll < fireballChance + scoreBurstChance + GAMEPLAY_TUNING.bonus.shieldChance + GAMEPLAY_TUNING.bonus.magnetChance) {
      return "magnet";
    }

    return "shard";
  }

  private pickBonusX(lastGapCenterX: number, random: () => number): number {
    const offset = (random() * 2 - 1) * 0.28;
    return clamp(lastGapCenterX + offset, -0.9, 0.9);
  }

  private valueForBonus(kind: BonusKind): number {
    if (kind === "shard") {
      return GAMEPLAY_TUNING.bonus.shardValue;
    }

    if (kind === "score_burst") {
      return GAMEPLAY_TUNING.bonus.scoreBurstValue;
    }

    if (kind === "fireball") {
      return GAMEPLAY_TUNING.power.fireballPickupScore;
    }

    return 14;
  }

  private resolveGapWidth(kind: ObstacleKind, baseGapWidth: number): number {
    if (kind === "tight_gate") {
      return clamp(baseGapWidth * 0.72, GAMEPLAY_TUNING.difficulty.minGapWidth, GAMEPLAY_TUNING.difficulty.startGapWidth);
    }

    if (kind === "solid_wall") {
      return clamp(baseGapWidth * 0.9, GAMEPLAY_TUNING.difficulty.minGapWidth, GAMEPLAY_TUNING.difficulty.startGapWidth);
    }

    return 0;
  }

  private resolveGapCenter(kind: ObstacleKind, gapWidth: number, lastGapCenterX: number, random: () => number): number {
    if (kind === "low_wall" || kind === "breakable_wall") {
      return 0;
    }

    const maxCenter = Math.max(0.08, 1 - gapWidth * 0.5 - 0.03);
    const shift = (random() * 2 - 1) * GAMEPLAY_TUNING.spawn.maxGapShiftPerSpawn;
    return clamp(lastGapCenterX + shift, -maxCenter, maxCenter);
  }

  private thicknessForKind(kind: ObstacleKind): number {
    if (kind === "tight_gate") {
      return GAMEPLAY_TUNING.layout.obstacleBaseThicknessPx + 5;
    }

    if (kind === "solid_wall") {
      return GAMEPLAY_TUNING.layout.obstacleBaseThicknessPx + 2;
    }

    if (kind === "breakable_wall") {
      return GAMEPLAY_TUNING.layout.obstacleBaseThicknessPx + 9;
    }

    return GAMEPLAY_TUNING.layout.obstacleBaseThicknessPx - 2;
  }

  private signatureForKind(kind: ObstacleKind): ObstacleSignature {
    if (kind === "tight_gate") {
      return "needle_gate";
    }

    if (kind === "low_wall") {
      return "chevron_shutter";
    }

    if (kind === "breakable_wall") {
      return "prism_clamp";
    }

    return "neutral";
  }

  private riskForKind(kind: ObstacleKind): number {
    if (kind === "tight_gate") {
      return 1;
    }

    if (kind === "breakable_wall") {
      return 0.9;
    }

    if (kind === "low_wall") {
      return 0.72;
    }

    return 0.58;
  }

  private resolveChapter(elapsedMs: number): RunChapter {
    if (elapsedMs < 9_000) {
      return "calibration";
    }

    if (elapsedMs < 17_000) {
      return "lateral_nervous";
    }

    if (elapsedMs < 25_000) {
      return "fire_pressure";
    }

    return "flow_mastery";
  }
}
