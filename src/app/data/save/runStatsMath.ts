import type { RunDeathCause, RunStatEntry, RunStatsSummary } from "./RunStats";

export function computeMedianRunMs(entries: readonly RunStatEntry[]): number {
  if (entries.length === 0) {
    return 0;
  }

  const sorted = entries
    .map((entry) => entry.durationMs)
    .sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }

  const left = sorted[middle - 1] ?? 0;
  const right = sorted[middle] ?? 0;
  return Math.round((left + right) * 0.5);
}

export function computeAverageRunMs(entries: readonly RunStatEntry[]): number {
  return averageBy(entries, (entry) => entry.durationMs);
}

export function computeDeathCauseDistribution(
  entries: readonly RunStatEntry[],
): Record<RunDeathCause, number> {
  const distribution: Record<RunDeathCause, number> = {
    obstacle_collision: 0,
    unknown: 0,
  };

  for (const entry of entries) {
    distribution[entry.deathCause] += 1;
  }

  return distribution;
}

export function computeImmediateRetryRate(entries: readonly RunStatEntry[]): number {
  return ratio(entries.filter((entry) => entry.retryImmediate).length, entries.length);
}

export function buildRunStatsSummary(entries: readonly RunStatEntry[]): RunStatsSummary {
  const totalPhaseUsed = entries.reduce((sum, entry) => sum + entry.phaseUsedCount, 0);
  const totalPhaseWaste = entries.reduce((sum, entry) => sum + entry.phaseWasteCount, 0);
  const totalUsefulPhaseActivations = Math.max(0, totalPhaseUsed - totalPhaseWaste);

  const withPhaseEntries = entries.filter((entry) => entry.phaseUsedCount > 0);
  const withoutPhaseEntries = entries.filter((entry) => entry.phaseUsedCount === 0);

  return {
    runCount: entries.length,
    averageRunMs: computeAverageRunMs(entries),
    medianRunMs: computeMedianRunMs(entries),
    deathCauseDistribution: computeDeathCauseDistribution(entries),
    immediateRetryRate: computeImmediateRetryRate(entries),
    runsWithPhaseUseRate: ratio(withPhaseEntries.length, entries.length),
    averagePhaseUsedCount: averageBy(entries, (entry) => entry.phaseUsedCount),
    usefulPhaseActivationRate: ratio(totalUsefulPhaseActivations, totalPhaseUsed),
    wastedPhaseActivationRate: ratio(totalPhaseWaste, totalPhaseUsed),
    deathJustAfterPhaseRate: ratio(entries.filter((entry) => entry.deathJustAfterPhase).length, entries.length),
    phaseAvailableButUnusedRate: ratio(entries.filter((entry) => entry.phaseAvailableButUnused).length, entries.length),
    withPhaseRunCount: withPhaseEntries.length,
    withoutPhaseRunCount: withoutPhaseEntries.length,
    withPhaseAverageRunMs: averageBy(withPhaseEntries, (entry) => entry.durationMs),
    withoutPhaseAverageRunMs: averageBy(withoutPhaseEntries, (entry) => entry.durationMs),
    withPhaseAverageScore: averageBy(withPhaseEntries, (entry) => entry.score),
    withoutPhaseAverageScore: averageBy(withoutPhaseEntries, (entry) => entry.score),
    averageJumpCount: averageBy(entries, (entry) => entry.jumpCount),
    averageBonusCollectedCount: averageBy(entries, (entry) => entry.bonusCollectedCount),
    averageFireballPickupCount: averageBy(entries, (entry) => entry.fireballPickupCount),
    averageFireballBreakCount: averageBy(entries, (entry) => entry.fireballBreakCount),
    averageShardCount: averageBy(entries, (entry) => entry.shardCount),
    averageComboPeak: averageBy(entries, (entry) => entry.comboPeak),
  };
}

function averageBy(entries: readonly RunStatEntry[], selector: (entry: RunStatEntry) => number): number {
  if (entries.length === 0) {
    return 0;
  }

  const total = entries.reduce((sum, entry) => sum + selector(entry), 0);
  return Math.round(total / entries.length);
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}
