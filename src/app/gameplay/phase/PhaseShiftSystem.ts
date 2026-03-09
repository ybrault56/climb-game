import type { PhaseShiftState } from "../types";
import { GAMEPLAY_TUNING } from "../tuning";

export interface PhaseActivationResult {
  state: PhaseShiftState;
  activated: boolean;
}

export interface PhaseCollisionResult {
  state: PhaseShiftState;
  saved: boolean;
}

export class PhaseShiftSystem {
  createInitial(): PhaseShiftState {
    return {
      activeMsRemaining: 0,
      cooldownMsRemaining: 0,
      activationCount: 0,
      savedCollisionCount: 0,
    };
  }

  tick(previous: PhaseShiftState, deltaMs: number): PhaseShiftState {
    const step = Math.max(0, deltaMs);

    return {
      ...previous,
      activeMsRemaining: Math.max(0, previous.activeMsRemaining - step),
      cooldownMsRemaining: Math.max(0, previous.cooldownMsRemaining - step),
    };
  }

  tryActivate(previous: PhaseShiftState): PhaseActivationResult {
    if (previous.activeMsRemaining > 0 || previous.cooldownMsRemaining > 0) {
      return {
        state: previous,
        activated: false,
      };
    }

    return {
      state: {
        ...previous,
        activeMsRemaining: GAMEPLAY_TUNING.phase.durationMs,
        cooldownMsRemaining: GAMEPLAY_TUNING.phase.cooldownMs,
        activationCount: previous.activationCount + 1,
      },
      activated: true,
    };
  }

  consumeCollisionSave(previous: PhaseShiftState): PhaseCollisionResult {
    if (!this.isActive(previous)) {
      return {
        state: previous,
        saved: false,
      };
    }

    return {
      state: {
        ...previous,
        savedCollisionCount: previous.savedCollisionCount + 1,
      },
      saved: true,
    };
  }

  isActive(phase: PhaseShiftState): boolean {
    return phase.activeMsRemaining > 0;
  }
}
