import type { RunSnapshot } from "../../gameplay/types";

export interface HudViewModel {
  scoreLabel: string;
  bestLabel: string;
}

export function buildHudViewModel(snapshot: RunSnapshot): HudViewModel {
  return {
    scoreLabel: `${snapshot.score.current}`,
    bestLabel: `best ${snapshot.score.best}`,
  };
}
