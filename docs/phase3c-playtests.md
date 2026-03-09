# Phase 3C - Manual Playtest Protocol (Data-driven)

## 1) Fast local stats usage

Use browser devtools console:

```ts
window.NeonShaftDebug.getStats()
window.NeonShaftDebug.getSummary()
window.NeonShaftDebug.printSummary()
window.NeonShaftDebug.clearStats()
```

`printSummary()` prints:
- run count
- median and average run length
- immediate retry rate
- short run (<3s) rate
- death cause distribution
- death position distribution (left/center/right)
- death obstacle distribution

## 2) Minimal playtest protocol

1. `window.NeonShaftDebug.clearStats()`
2. Warmup: 5 runs (not analyzed)
3. Batch A: 15 runs mobile portrait
4. Batch B: 15 runs mobile portrait after 2 min break
5. Batch C: 15 runs desktop mouse/keyboard
6. After each batch: `window.NeonShaftDebug.printSummary()`

Recommended minimum before tuning decision:
- 45 measured runs total

## 3) What to observe first

Primary indicators:
- `medianRunMs`
- `immediateRetryRate`
- short run rate (`runs < 3000ms`)
- death position distribution
- death obstacle distribution

## 4) Symptom -> tuning mapping

Allowed tuning knobs only:
- `GAMEPLAY_TUNING.input.pointerFollowSpeed`
- `GAMEPLAY_TUNING.input.keyboardDriftSpeed`
- `GAMEPLAY_TUNING.collision.horizontalForgivenessNormalized`
- `GAMEPLAY_TUNING.difficulty.startSpawnEveryMs`
- `GAMEPLAY_TUNING.difficulty.minSpawnEveryMs`
- `GAMEPLAY_TUNING.difficulty.startGapWidth`
- `GAMEPLAY_TUNING.difficulty.minGapWidth`
- `GAMEPLAY_TUNING.spawn.maxGapShiftPerSpawn`

Guidelines:
- Too many runs `<3000ms` (>35%):
  - increase `startSpawnEveryMs` by `+20` to `+40`
  - and/or increase `startGapWidth` by `+0.02`
- Median too low (<5s) with low retry rate (<55%):
  - increase `collision.horizontalForgivenessNormalized` by `+0.01`
  - reduce `maxGapShiftPerSpawn` by `-0.05`
- Median too high (>12s) and retry still high (>75%):
  - reduce `minSpawnEveryMs` by `-10` to `-20`
  - reduce `minGapWidth` by `-0.01`
- Death concentration on left or right (>45%):
  - check control comfort first
  - then reduce `maxGapShiftPerSpawn` slightly
- Death concentration on one obstacle kind (>70%):
  - reduce its effective pressure by easing spawn/gap settings

Rule:
- change one parameter at a time
- re-test at least 20 runs after each change

## 5) Exact V1 validation criteria

Consider V1 gameplay tuning validated when all are true:
- at least 45 measured runs
- median run length between 5s and 11s
- short run (<3s) rate <= 30%
- immediate retry rate >= 60%
- no side concentration > 45% of deaths
- no single obstacle kind > 70% of deaths

## 6) When to move to Phase 4 polish

Move to Phase 4 only if:
- all V1 criteria above are met in two consecutive playtest batches
- no recurring unfair death complaints during manual sessions
- no more than one minor tuning knob change remains under discussion
