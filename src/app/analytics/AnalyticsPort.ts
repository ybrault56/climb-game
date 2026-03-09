export interface AnalyticsEvent {
  name: string;
  payload?: Record<string, number | string | boolean>;
}

export interface AnalyticsPort {
  track(event: AnalyticsEvent): void;
}
