export type StoreUpdater<TState> = (previous: TState) => TState;
type StoreListener<TState> = (next: TState, previous: TState) => void;

export class GameStore<TState> {
  private readonly listeners = new Set<StoreListener<TState>>();

  constructor(private state: TState) {}

  getState(): TState {
    return this.state;
  }

  setState(next: TState | StoreUpdater<TState>): void {
    const previous = this.state;
    this.state = typeof next === "function" ? (next as StoreUpdater<TState>)(previous) : next;

    for (const listener of this.listeners) {
      listener(this.state, previous);
    }
  }

  subscribe(listener: StoreListener<TState>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
