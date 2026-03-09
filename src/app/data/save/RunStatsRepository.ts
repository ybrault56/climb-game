import type { StoragePort } from "../storage/StoragePort";
import { GAMEPLAY_TUNING } from "../../gameplay/tuning";
import { buildRunStatsSummary } from "./runStatsMath";
import type { NewRunStatEntry, RunStatEntry, RunStatsSummary } from "./RunStats";

const RUN_STATS_KEY = "run_stats_history";

export class RunStatsRepository {
  private cache: RunStatEntry[] | null = null;

  constructor(private readonly storage: StoragePort) {}

  append(entry: NewRunStatEntry): RunStatEntry {
    const nextEntry: RunStatEntry = {
      ...entry,
      id: `${entry.timestamp}-${Math.floor(Math.random() * 1_000_000)}`,
    };

    const current = this.listMutable();
    current.push(nextEntry);

    const overflow = current.length - GAMEPLAY_TUNING.runStatsHistoryLimit;
    if (overflow > 0) {
      current.splice(0, overflow);
    }

    this.save(current);
    return nextEntry;
  }

  list(): readonly RunStatEntry[] {
    return this.listMutable();
  }

  getLastRun(): RunStatEntry | null {
    const entries = this.listMutable();
    if (entries.length === 0) {
      return null;
    }

    return entries[entries.length - 1] ?? null;
  }

  markLastRunRetryImmediate(nowTimestamp = Date.now()): void {
    const entries = this.listMutable();
    if (entries.length === 0) {
      return;
    }

    const lastIndex = entries.length - 1;
    const lastRun = entries[lastIndex];
    if (!lastRun) {
      return;
    }

    const isImmediate = nowTimestamp - lastRun.timestamp <= GAMEPLAY_TUNING.immediateRetryWindowMs;
    entries[lastIndex] = {
      ...lastRun,
      retryImmediate: isImmediate,
    };

    this.save(entries);
  }

  clearStats(): void {
    this.cache = [];
    this.storage.remove(RUN_STATS_KEY);
  }

  getSummary(): RunStatsSummary {
    return buildRunStatsSummary(this.listMutable());
  }

  private listMutable(): RunStatEntry[] {
    if (this.cache) {
      return this.cache;
    }

    const raw = this.storage.getString(RUN_STATS_KEY);
    if (!raw) {
      this.cache = [];
      return this.cache;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        this.cache = [];
        return this.cache;
      }

      this.cache = parsed
        .map((entry) => this.normalizeRunStatEntry(entry))
        .filter((entry): entry is RunStatEntry => entry !== null);

      return this.cache;
    } catch {
      this.cache = [];
      return this.cache;
    }
  }

  private save(entries: readonly RunStatEntry[]): void {
    this.cache = [...entries];
    this.storage.setString(RUN_STATS_KEY, JSON.stringify(entries));
  }

  private normalizeRunStatEntry(value: unknown): RunStatEntry | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const candidate = value as Partial<RunStatEntry>;
    const hasBaseShape =
      typeof candidate.id === "string" &&
      typeof candidate.timestamp === "number" &&
      typeof candidate.durationMs === "number" &&
      typeof candidate.score === "number" &&
      typeof candidate.bestScoreAtRunStart === "number" &&
      typeof candidate.deathCause === "string" &&
      typeof candidate.deathXNormalized === "number" &&
      typeof candidate.deathPositionBucket === "string" &&
      typeof candidate.deathDifficultyLevel === "number" &&
      typeof candidate.deathScrollSpeed === "number" &&
      typeof candidate.deathObstacleKind === "string" &&
      typeof candidate.retryImmediate === "boolean";

    if (!hasBaseShape) {
      return null;
    }

    return {
      id: candidate.id!,
      timestamp: candidate.timestamp!,
      durationMs: candidate.durationMs!,
      score: candidate.score!,
      bestScoreAtRunStart: candidate.bestScoreAtRunStart!,
      deathCause: candidate.deathCause!,
      deathXNormalized: candidate.deathXNormalized!,
      deathPositionBucket: candidate.deathPositionBucket!,
      deathDifficultyLevel: candidate.deathDifficultyLevel!,
      deathScrollSpeed: candidate.deathScrollSpeed!,
      deathObstacleKind: candidate.deathObstacleKind!,
      retryImmediate: candidate.retryImmediate!,
      phaseUsedCount: this.toNumber(candidate.phaseUsedCount),
      phaseHitSavesCount: this.toNumber(candidate.phaseHitSavesCount),
      phasePerfectCount: this.toNumber(candidate.phasePerfectCount),
      phaseWasteCount: this.toNumber(candidate.phaseWasteCount),
      firstPhaseUseAtMs: this.toNullableNumber(candidate.firstPhaseUseAtMs),
      scoreFromPhase: this.toNumber(candidate.scoreFromPhase),
      diedWithinMsAfterPhase: this.toNullableNumber(candidate.diedWithinMsAfterPhase),
      deathWhilePhaseActive: this.toBoolean(candidate.deathWhilePhaseActive),
      deathJustAfterPhase: this.toBoolean(candidate.deathJustAfterPhase),
      phaseAvailableButUnused: this.toBoolean(candidate.phaseAvailableButUnused),
      jumpCount: this.toNumber(candidate.jumpCount),
      bonusCollectedCount: this.toNumber(candidate.bonusCollectedCount),
      fireballPickupCount: this.toNumber(candidate.fireballPickupCount),
      fireballBreakCount: this.toNumber(candidate.fireballBreakCount),
      shardCount: this.toNumber(candidate.shardCount),
      comboPeak: this.toNumber(candidate.comboPeak),
    };
  }

  private toNumber(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private toBoolean(value: unknown): boolean {
    return typeof value === "boolean" ? value : false;
  }
}
