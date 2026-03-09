import type { StoragePort } from "../storage/StoragePort";

const SETTINGS_KEY = "settings";

export interface GameSettings {
  vibrationEnabled: boolean;
  reducedFx: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  vibrationEnabled: true,
  reducedFx: false,
};

export class SettingsRepository {
  constructor(private readonly storage: StoragePort) {}

  load(): GameSettings {
    const raw = this.storage.getString(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        vibrationEnabled: parsed.vibrationEnabled ?? DEFAULT_SETTINGS.vibrationEnabled,
        reducedFx: parsed.reducedFx ?? DEFAULT_SETTINGS.reducedFx,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  save(settings: GameSettings): void {
    this.storage.setString(SETTINGS_KEY, JSON.stringify(settings));
  }
}
