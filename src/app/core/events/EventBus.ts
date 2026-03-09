export type EventPayloadMap = Record<string, unknown>;

type Listener<TPayload> = (payload: TPayload) => void;

export class EventBus<TEvents extends EventPayloadMap> {
  private readonly listeners = new Map<keyof TEvents, Set<Listener<unknown>>>();

  on<TKey extends keyof TEvents>(
    eventName: TKey,
    listener: Listener<TEvents[TKey]>,
  ): () => void {
    const existing = this.listeners.get(eventName) ?? new Set<Listener<unknown>>();
    existing.add(listener as Listener<unknown>);
    this.listeners.set(eventName, existing);

    return () => {
      const eventListeners = this.listeners.get(eventName);
      if (!eventListeners) {
        return;
      }
      eventListeners.delete(listener as Listener<unknown>);
      if (eventListeners.size === 0) {
        this.listeners.delete(eventName);
      }
    };
  }

  emit<TKey extends keyof TEvents>(eventName: TKey, payload: TEvents[TKey]): void {
    const eventListeners = this.listeners.get(eventName);
    if (!eventListeners) {
      return;
    }

    for (const listener of eventListeners) {
      (listener as Listener<TEvents[TKey]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
