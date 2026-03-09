import type { StoragePort } from "../storage/StoragePort";

const HIGHSCORE_KEY = "highscore";

export class HighscoreRepository {
  constructor(private readonly storage: StoragePort) {}

  loadBestScore(): number {
    const raw = this.storage.getString(HIGHSCORE_KEY);
    if (!raw) {
      return 0;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return Math.floor(parsed);
  }

  saveBestScore(score: number): void {
    this.storage.setString(HIGHSCORE_KEY, String(Math.max(0, Math.floor(score))));
  }
}
