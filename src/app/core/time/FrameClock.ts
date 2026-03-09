export interface ClockSnapshot {
  nowMs: number;
  deltaMs: number;
  elapsedMs: number;
  frame: number;
}

export class FrameClock {
  private startMs: number | null = null;
  private previousMs: number | null = null;
  private frame = 0;

  reset(): void {
    this.startMs = null;
    this.previousMs = null;
    this.frame = 0;
  }

  tick(nowMs: number): ClockSnapshot {
    if (this.startMs === null || this.previousMs === null) {
      this.startMs = nowMs;
      this.previousMs = nowMs;
      return {
        nowMs,
        deltaMs: 0,
        elapsedMs: 0,
        frame: this.frame,
      };
    }

    const deltaMs = Math.max(0, nowMs - this.previousMs);
    this.previousMs = nowMs;
    this.frame += 1;

    return {
      nowMs,
      deltaMs,
      elapsedMs: nowMs - this.startMs,
      frame: this.frame,
    };
  }
}
