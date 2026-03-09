# PHASE 10 - External Playtest Protocol

## Build And Launch
1. `pnpm install`
2. `pnpm build`
3. `pnpm dev --host`
4. Open the local URL on mobile (same network) and desktop.

## Reset Local Stats
In browser console:

```js
window.NeonShaftDebug.clearStats();
```

## Quick Commands During Playtest

```js
window.NeonShaftDebug.getSummary();
window.NeonShaftDebug.getStats();
window.NeonShaftDebug.printSummary();
```

## Recommended Session
1. Reset stats once at start.
2. Run `25` runs per tester minimum.
3. Split in 3 blocks:
   - Block A: 8 runs mobile portrait.
   - Block B: 8 runs mobile with audio on + haptics enabled.
   - Block C: 9 runs desktop fallback controls.
4. After each block: call `window.NeonShaftDebug.printSummary()`.
5. Export screenshots of summary tables for review.

## Observation Checklist
- Visual comfort:
  - no aggressive flash;
  - no eye strain after 10+ retries.
- Materiality:
  - obstacles read as objects (not flat lines);
  - orb and corridor feel layered and coherent.
- Chapter contrast:
  - progression is perceptible without text;
  - tension increase is felt visually and sonically.
- Brand sound:
  - near miss / perfect / phase / death / retry feel from one sonic family;
  - cues remain short and non-fatiguing.
- Gameplay clarity:
  - collision remains understandable;
  - phase shift timing remains readable.

## Validation Hints
- If testers report "too flat": increase chapter visual contrast or obstacle panel separation.
- If testers report "too noisy": reduce accent cue frequency or gain in `AudioService`.
- If testers report "hard to read": reduce panel alpha and keep obstacle silhouettes dominant.
