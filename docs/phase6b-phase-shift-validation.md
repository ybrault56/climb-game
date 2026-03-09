# Phase 6B - Phase Shift Validation Protocol

## Reset stats
Run in browser console:

```js
window.NeonShaftDebug.clearStats()
```

Optional quick check:

```js
window.NeonShaftDebug.getStats()
window.NeonShaftDebug.getSummary()
window.NeonShaftDebug.printSummary()
```

## Recommended sample size
- Minimum: 30 runs
- Better confidence: 50 runs
- If tuning changed: reset and collect a fresh 30-run batch

## Metrics to watch
- `runsWithPhaseUseRate`
- `averagePhaseUsedCount`
- `usefulPhaseActivationRate`
- `wastedPhaseActivationRate`
- `deathJustAfterPhaseRate`
- `withPhaseAverageRunMs` vs `withoutPhaseAverageRunMs`
- `withPhaseAverageScore` vs `withoutPhaseAverageScore`

## Decision thresholds (practical)
- Healthy adoption: `runsWithPhaseUseRate >= 0.60`
- Useful timing (not spam): `usefulPhaseActivationRate >= 0.45`
- Waste contained: `wastedPhaseActivationRate <= 0.55`
- Post-phase frustration controlled: `deathJustAfterPhaseRate <= 0.18`
- Positive impact: `withPhaseAverageScore > withoutPhaseAverageScore`

## Symptom -> likely tuning action
- Phase rarely used (`runsWithPhaseUseRate` low):
  Increase readability of availability first, then consider slightly lower cooldown.
- Too many wasted activations:
  Slightly increase `phase.durationMs` or reduce visual ambiguity at activation.
- Many deaths right after phase:
  Slightly increase `phase.durationMs` or improve end-of-phase readability feedback.
- Runs with phase not better than runs without:
  Increase precision reward (`precisionScoreBonus`) or clutch reward (`collisionSaveScoreBonus`) conservatively.

## Reset cadence
- Always reset stats after each meaningful tuning change.
- Keep one changelog line per batch: date, parameters, key summary values.
