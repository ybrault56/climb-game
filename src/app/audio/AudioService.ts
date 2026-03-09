import { clamp } from "../core/math/clamp";
import { GAMEPLAY_TUNING } from "../gameplay/tuning";

export type AudioCue =
  | "uiTap"
  | "runStart"
  | "nearMiss"
  | "perfectPass"
  | "collision"
  | "endRun"
  | "retry"
  | "needleGateAccent"
  | "chevronShutterAccent"
  | "prismClampAccent"
  | "shardPickup"
  | "scoreBurstPickup"
  | "fireballPickup"
  | "fireballIgnite"
  | "fireballActive"
  | "wallBreak"
  | "shieldPickup"
  | "shieldHit"
  | "magnetPickup"
  | "magnetTick"
  | "jump"
  | "landing"
  | "comboUp"
  | "comboUpHigh"
  | "rankUp";

interface CueProfile {
  frequency: number;
  endFrequency: number;
  durationMs: number;
  gain: number;
  type: OscillatorType;
  attackMs?: number;
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
  collision: {
    frequency: 160,
    endFrequency: 92,
    durationMs: 96,
    gain: 0.0225,
    type: "sawtooth",
    attackMs: 7,
    hapticPattern: [14, 12, 16],
    hapticMinIntervalMs: 70,
    brandLayer: true,
  },
  endRun: {
    frequency: 150,
    endFrequency: 72,
    durationMs: 172,
    gain: 0.029,
    type: "sawtooth",
    attackMs: 6,
    hapticPattern: [18, 12, 24],
    hapticMinIntervalMs: 88,
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
  shardPickup: {
    frequency: 870,
    endFrequency: 1160,
    durationMs: 34,
    gain: 0.008,
    type: "triangle",
    brandLayer: true,
  },
  scoreBurstPickup: {
    frequency: 620,
    endFrequency: 1280,
    durationMs: 82,
    gain: 0.0145,
    type: "sine",
    hapticPattern: [6, 10, 6],
    brandLayer: true,
  },
  fireballPickup: {
    frequency: 460,
    endFrequency: 1180,
    durationMs: 94,
    gain: 0.0175,
    type: "sawtooth",
    attackMs: 7,
    hapticPattern: [10, 12, 8],
    brandLayer: true,
  },
  fireballIgnite: {
    frequency: 380,
    endFrequency: 1320,
    durationMs: 120,
    gain: 0.02,
    type: "sawtooth",
    attackMs: 6,
    hapticPattern: [12, 14, 10],
    brandLayer: true,
  },
  fireballActive: {
    frequency: 370,
    endFrequency: 580,
    durationMs: 46,
    gain: 0.0095,
    type: "triangle",
    attackMs: 8,
    brandLayer: true,
  },
  wallBreak: {
    frequency: 210,
    endFrequency: 680,
    durationMs: 108,
    gain: 0.022,
    type: "sawtooth",
    attackMs: 6,
    hapticPattern: [10, 14, 8],
    brandLayer: true,
  },
  shieldPickup: {
    frequency: 690,
    endFrequency: 920,
    durationMs: 62,
    gain: 0.011,
    type: "sine",
    hapticPattern: 7,
    brandLayer: true,
  },
  shieldHit: {
    frequency: 340,
    endFrequency: 760,
    durationMs: 82,
    gain: 0.0145,
    type: "square",
    attackMs: 6,
    hapticPattern: [9, 8, 9],
    brandLayer: true,
  },
  magnetPickup: {
    frequency: 560,
    endFrequency: 780,
    durationMs: 70,
    gain: 0.011,
    type: "sine",
    hapticPattern: 8,
    brandLayer: true,
  },
  magnetTick: {
    frequency: 500,
    endFrequency: 620,
    durationMs: 38,
    gain: 0.006,
    type: "sine",
    brandLayer: true,
  },
  jump: {
    frequency: 540,
    endFrequency: 790,
    durationMs: 52,
    gain: 0.0105,
    type: "triangle",
    hapticPattern: 6,
    brandLayer: true,
  },
  landing: {
    frequency: 300,
    endFrequency: 220,
    durationMs: 48,
    gain: 0.01,
    type: "triangle",
    hapticPattern: 6,
    brandLayer: true,
  },
  comboUp: {
    frequency: 760,
    endFrequency: 1160,
    durationMs: 60,
    gain: 0.011,
    type: "triangle",
    attackMs: 8,
    brandLayer: true,
  },
  comboUpHigh: {
    frequency: 820,
    endFrequency: 1380,
    durationMs: 82,
    gain: 0.014,
    type: "sawtooth",
    attackMs: 6,
    hapticPattern: [7, 10, 7],
    brandLayer: true,
  },
  rankUp: {
    frequency: 560,
    endFrequency: 1560,
    durationMs: 138,
    gain: 0.018,
    type: "sawtooth",
    attackMs: 6,
    hapticPattern: [9, 12, 9],
    brandLayer: true,
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
    const tensionPitch = 1 + this.tensionLevel * 0.065;
    const tensionGain = 0.9 + this.tensionLevel * 0.18;

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
      now + (profile.attackMs !== undefined ? profile.attackMs / 1000 : Math.min(0.018, durationSec * 0.45)),
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
      brandOscillator.frequency.setValueAtTime(
        profile.frequency * 0.55 * (1 + this.tensionLevel * 0.05),
        now,
      );
      brandOscillator.frequency.exponentialRampToValueAtTime(
        Math.max(50, profile.endFrequency * 0.53 * (1 + this.tensionLevel * 0.04)),
        now + durationSec,
      );

      brandGainNode.gain.setValueAtTime(0.0001, now);
      brandGainNode.gain.linearRampToValueAtTime(
        profile.gain * (0.33 + this.tensionLevel * 0.12),
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
