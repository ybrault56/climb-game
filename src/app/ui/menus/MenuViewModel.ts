export interface MenuViewModel {
  title: string;
  subtitle: string;
  cta: string;
}

export const MAIN_MENU_VIEW_MODEL: MenuViewModel = {
  title: "NEON SHAFT",
  subtitle: "touch and drift",
  cta: "tap to drop",
};

export function buildResultViewModel(score: number, best: number): MenuViewModel {
  return {
    title: "run over",
    subtitle: `${score} / best ${best}`,
    cta: "tap to retry",
  };
}
