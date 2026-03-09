import type { AnalyticsEvent, AnalyticsPort } from "./AnalyticsPort";

export class NoopAnalytics implements AnalyticsPort {
  track(_event: AnalyticsEvent): void {
    // No-op for phase 1.
  }
}
