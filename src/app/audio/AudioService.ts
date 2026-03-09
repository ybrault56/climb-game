import { clamp } from "../core/math/clamp";
import { GAMEPLAY_TUNING } from "../gameplay/tuning";

export type AudioCue =
  | "uiTap"
  | "runStart"
  | "nearMiss"
  | "perfectPass"
  | "phaseShift"
  | "collision"
  | "retry"
  | "needleGateAccent"
  | "chevronShutterAccent"
  | "prismClampAccent";

interface CueProfile {
  frequency: number;
  endFrequency: number;
  durationMs: number;
  gain: number;
  type: OscillatorType;
  hapticPattern?: number | number[];
  hapticMinIntervalMs?: number;
  brandLayer?: boolean;
}

const CUE_PROFILES: Record<AudioCue, CueProfile> = {
  uiTap: {
    frequency: 620,
    endFrequency: 540,
    durationMs: 44,
    gain: 0.012,
    type: "triangle",
  },
  runStart: {
    frequency: 320,
    endFrequency: 520,
    durationMs: 78,
    gain: 0.013,
    type: "sine",
  },
  nearMiss: {
    frequency: 900,
    endFrequency: 1080,
    durationMs: 36,
    gain: 0.009,
    type: "triangle",
    hapticPattern: 7,
    brandLayer: true,
  },
  perfectPass: {
    frequency: 680,
    endFrequency: 1320,
    durationMs: 70,
    gain: 0.014,
    type: "sine",
    hapticPattern: [8, 12, 8],
    brandLayer: true,
  },
  phaseShift: {
    frequency: 520,
    endFrequency: 980,
    durationMs: 92,
    gain: 0.016,
    type: "triangle",
    hapticPattern: [10, 12, 10],
    brandLayer: true,
  },
  collision: {
    frequency: 170,
    endFrequency: 88,
    durationMs: 108,
    gain: 0.022,
    type: "triangle",
    hapticPattern: [14, 12, 16],
    hapticMinIntervalMs: 70,
    brandLayer: true,
  },
  retry: {
    frequency: 520,
    endFrequency: 760,
    durationMs: 56,
    gain: 0.012,
    type: "sine",
    hapticPattern: 9,
    brandLayer: true,
  },
  needleGateAccent: {
    frequency: 1020,
    endFrequency: 1380,
    durationMs: 28,
    gain: 0.006,
    type: "sine",
  },
  chevronShutterAccent: {
    frequency: 760,
    endFrequency: 980,
    durationMs: 30,
    gain: 0.0065,
    type: "triangle",
  },
  prismClampAccent: {
    frequency: 430,
    endFrequency: 720,
    durationMs: 34,
    gain: 0.007,
    type: "triangle",
  },
};

interface BrowserWindowWithAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export class AudioService {
  private context: AudioContext | null = null;
  private lastHapticAt = 0;
  private tensionLevel = 0.18;

  setTensionLevel(level: number): void {
    this.tensionLevel = clamp(level, 0, 1);
  }

  play(cue: AudioCue): void {
    const profile = CUE_PROFILES[cue];
    this.playTone(profile);
    this.playHaptic(profile);
  }

  private playTone(profile: CueProfile): void {
    const context = this.ensureAudioContext();
    if (!context) {
      return;
    }

    const durationSec = profile.durationMs / 1000;
    const now = context.currentTime;
    const tensionPitch = 1 + this.tensionLevel * 0.06;
    const tensionGain = 0.92 + this.tensionLevel * 0.16;

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = profile.type;
    oscillator.frequency.setValueAtTime(profile.frequency * tensionPitch, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(50, profile.endFrequency * tensionPitch),
      now + durationSec,
    );

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(
      profile.gain * tensionGain,
      now + Math.min(0.018, durationSec * 0.45),
    );
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    let brandOscillator: OscillatorNode | null = null;
    let brandGainNode: GainNode | null = null;

    if (profile.brandLayer) {
      brandOscillator = context.createOscillator();
      brandGainNode = context.createGain();

      brandOscillator.type = "sine";
      brandOscillator.frequency.setValueAtTime(profile.frequency * 0.56 * (1 + this.tensionLevel * 0.04), now);
      brandOscillator.frequency.exponentialRampToValueAtTime(
        Math.max(50, profile.endFrequency * 0.52 * (1 + this.tensionLevel * 0.03)),
        now + durationSec,
      );

      brandGainNode.gain.setValueAtTime(0.0001, now);
      brandGainNode.gain.linearRampToValueAtTime(
        profile.gain * (0.35 + this.tensionLevel * 0.12),
        now + Math.min(0.022, durationSec * 0.5),
      );
      brandGainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      brandOscillator.connect(brandGainNode);
      brandGainNode.connect(context.destination);
      brandOscillator.start(now);
      brandOscillator.stop(now + durationSec + 0.03);
    }

    oscillator.start(now);
    oscillator.stop(now + durationSec + 0.03);
    oscillator.onended = () => {
      oscillator.disconnect();
      gainNode.disconnect();
      if (brandOscillator) {
        brandOscillator.disconnect();
      }
      if (brandGainNode) {
        brandGainNode.disconnect();
      }
    };
  }

  private playHaptic(profile: CueProfile): void {
    if (!GAMEPLAY_TUNING.material.hapticEnabled || profile.hapticPattern === undefined) {
      return;
    }

    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
      return;
    }

    const now = Date.now();
    const minInterval = profile.hapticMinIntervalMs ?? GAMEPLAY_TUNING.material.hapticMinIntervalMs;
    if (now - this.lastHapticAt < minInterval) {
      return;
    }

    navigator.vibrate(profile.hapticPattern);
    this.lastHapticAt = now;
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === "undefined") {
      return null;
    }

    const browserWindow = window as BrowserWindowWithAudio;
    const contextCtor = window.AudioContext ?? browserWindow.webkitAudioContext;
    if (!contextCtor) {
      return null;
    }

    if (!this.context) {
      this.context = new contextCtor({ latencyHint: "interactive" });
    }

    if (this.context.state === "suspended") {
      void this.context.resume().catch(() => {
        // Audio can remain suspended until a user gesture.
      });
    }

    return this.context;
  }
}
