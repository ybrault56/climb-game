import { GAMEPLAY_TUNING } from "../tuning";
import type { BonusCollectEvent, BonusState, PlayerState, PowerState } from "../types";

export interface BonusFrameResult {
  power: PowerState;
  remainingBonuses: BonusState[];
  collected: BonusCollectEvent[];
  fireballActivated: boolean;
}

export interface ShieldHitResult {
  power: PowerState;
  blocked: boolean;
}

export class BonusSystem {
  createInitialPower(): PowerState {
    return {
      fireballMsRemaining: 0,
      shieldCharges: 0,
      magnetMsRemaining: 0,
      fireballPickupCount: 0,
      fireballBreakCount: 0,
    };
  }

  tickPower(previous: PowerState, deltaMs: number): PowerState {
    const step = Math.max(0, deltaMs);
    return {
      ...previous,
      fireballMsRemaining: Math.max(0, previous.fireballMsRemaining - step),
      magnetMsRemaining: Math.max(0, previous.magnetMsRemaining - step),
    };
  }

  advanceBonuses(bonuses: readonly BonusState[], deltaMs: number, scrollSpeed: number): BonusState[] {
    const yStep = (Math.max(0, deltaMs) / 1000) * scrollSpeed;
    const remaining = new Array<BonusState>();

    for (const bonus of bonuses) {
      const y = bonus.y - yStep;
      if (y > GAMEPLAY_TUNING.collision.despawnY) {
        remaining.push({ ...bonus, y });
      }
    }

    return remaining;
  }

  collectBonuses(
    player: PlayerState,
    previousPower: PowerState,
    bonuses: readonly BonusState[],
  ): BonusFrameResult {
    const pickupRadius = this.pickupRadius(previousPower);
    const verticalWindow = GAMEPLAY_TUNING.collision.verticalWindowPx * 1.35;

    const collected: BonusCollectEvent[] = [];
    const remainingBonuses = new Array<BonusState>();

    let power = previousPower;
    let fireballActivated = false;

    for (const bonus of bonuses) {
      const inY = Math.abs(bonus.y - player.y) <= verticalWindow;
      const inX = Math.abs(bonus.x - player.x) <= pickupRadius;

      if (!inY || !inX) {
        remainingBonuses.push(bonus);
        continue;
      }

      collected.push({
        bonusId: bonus.id,
        kind: bonus.kind,
        value: bonus.value,
        x: bonus.x,
        y: bonus.y,
      });

      if (bonus.kind === "fireball") {
        const alreadyActive = power.fireballMsRemaining > 0;
        power = {
          ...power,
          fireballMsRemaining: Math.max(power.fireballMsRemaining, GAMEPLAY_TUNING.power.fireballDurationMs),
          fireballPickupCount: power.fireballPickupCount + 1,
        };
        if (!alreadyActive) {
          fireballActivated = true;
        }
        continue;
      }

      if (bonus.kind === "shield") {
        power = {
          ...power,
          shieldCharges: Math.min(2, power.shieldCharges + 1),
        };
        continue;
      }

      if (bonus.kind === "magnet") {
        power = {
          ...power,
          magnetMsRemaining: Math.max(power.magnetMsRemaining, GAMEPLAY_TUNING.power.magnetDurationMs),
        };
      }
    }

    return {
      power,
      remainingBonuses,
      collected,
      fireballActivated,
    };
  }

  registerFireballBreak(previousPower: PowerState, breakCount: number): PowerState {
    if (breakCount <= 0) {
      return previousPower;
    }

    return {
      ...previousPower,
      fireballBreakCount: previousPower.fireballBreakCount + breakCount,
    };
  }

  consumeShield(previousPower: PowerState): ShieldHitResult {
    if (previousPower.shieldCharges <= 0) {
      return {
        power: previousPower,
        blocked: false,
      };
    }

    return {
      power: {
        ...previousPower,
        shieldCharges: previousPower.shieldCharges - 1,
      },
      blocked: true,
    };
  }

  isFireballActive(power: PowerState): boolean {
    return power.fireballMsRemaining > 0;
  }

  private pickupRadius(power: PowerState): number {
    if (power.magnetMsRemaining > 0) {
      return GAMEPLAY_TUNING.bonus.magnetPickupRadiusNormalized;
    }

    return GAMEPLAY_TUNING.bonus.pickupRadiusNormalized;
  }
}


