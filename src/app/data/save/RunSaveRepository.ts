import type { RunSnapshot } from "../../gameplay/types";
import type { StoragePort } from "../storage/StoragePort";

const RUN_SNAPSHOT_KEY = "run_snapshot";

export class RunSaveRepository {
  constructor(private readonly storage: StoragePort) {}

  save(snapshot: RunSnapshot): void {
    this.storage.setString(RUN_SNAPSHOT_KEY, JSON.stringify(snapshot));
  }

  clear(): void {
    this.storage.remove(RUN_SNAPSHOT_KEY);
  }
}
