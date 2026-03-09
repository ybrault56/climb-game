import type { StoragePort } from "./StoragePort";

export class LocalStorageAdapter implements StoragePort {
  constructor(private readonly keyPrefix: string) {}

  getString(key: string): string | null {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage.getItem(this.fullKey(key));
  }

  setString(key: string, value: string): void {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(this.fullKey(key), value);
  }

  remove(key: string): void {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.removeItem(this.fullKey(key));
  }

  private fullKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }
}
