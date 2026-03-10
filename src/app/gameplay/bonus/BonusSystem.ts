import { GAMEPLAY_TUNING } from "../tuning";
import type { BonusCollectEvent, BonusState, PlayerState, PowerState } from "../types";

export interface BonusFrameResult {
  power: PowerState;
  remainingBonuses: BonusState[];
  collected: BonusCollectEvent[];
  fireballActivated: boolean;
  missileActivated: boolean;
  ghostActivated: boolean;
}

export interface ShieldHitResult {
  power: PowerState;
  blocked: boolean;
}

export interface MissileShotTrigger {
  power: PowerState;
  fired: boolean;
}

export class BonusSystem {
  createInitialPower(): PowerState {
    return {
      fireballMsRemaining: 0,
      missileMsRemaining: 0,
      missileShotCooldownMs: 0,
      ghostMsRemaining: 0,
      shieldCharges: 0,
      magnetMsRemaining: 0,
      fireballPickupCount: 0,
      missilePickupCount: 0,
      ghostPickupCount: 0,
      fireballBreakCount: 0,
      missileBreakCount: 0,
    };
  }

  tickPower(previous: PowerState, deltaMs: number): PowerState {
    const step = Math.max(0, deltaMs);
    return {
      ...previous,
      fireballMsRemaining: Math.max(0, previous.fireballMsRemaining - step),
      missileMsRemaining: Math.max(0, previous.missileMsRemaining - step),
      missileShotCooldownMs: Math.max(0, previous.missileShotCooldownMs - step),
      ghostMsRemaining: Math.max(0, previous.ghostMsRemaining - step),
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
    let missileActivated = false;
    let ghostActivated = false;

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
        fireballActivated = power.fireballMsRemaining <= 0;
        power = this.activatePrimaryPower(power, "fireball");
        continue;
      }

      if (bonus.kind === "missile_burst") {
        missileActivated = power.missileMsRemaining <= 0;
        power = this.activatePrimaryPower(power, "missile");
        continue;
      }

      if (bonus.kind === "ghost_core") {
        ghostActivated = power.ghostMsRemaining <= 0;
        power = this.activatePrimaryPower(power, "ghost");
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
      missileActivated,
      ghostActivated,
    };
  }

  consumeMissileShot(previousPower: PowerState): MissileShotTrigger {
    if (previousPower.missileMsRemaining <= 0 || previousPower.missileShotCooldownMs > 0) {
      return {
        power: previousPower,
        fired: false,
      };
    }

    return {
      power: {
        ...previousPower,
        missileShotCooldownMs: GAMEPLAY_TUNING.power.missileShotEveryMs,
      },
      fired: true,
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

  registerMissileBreak(previousPower: PowerState, breakCount: number): PowerState {
    if (breakCount <= 0) {
      return previousPower;
    }

    return {
      ...previousPower,
      missileBreakCount: previousPower.missileBreakCount + breakCount,
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

  isMissileActive(power: PowerState): boolean {
    return power.missileMsRemaining > 0;
  }

  isGhostActive(power: PowerState): boolean {
    return power.ghostMsRemaining > 0;
  }

  private pickupRadius(power: PowerState): number {
    if (power.magnetMsRemaining > 0) {
      return GAMEPLAY_TUNING.bonus.magnetPickupRadiusNormalized;
    }

    return GAMEPLAY_TUNING.bonus.pickupRadiusNormalized;
  }

  private activatePrimaryPower(previousPower: PowerState, kind: "fireball" | "missile" | "ghost"): PowerState {
    const reset = {
      ...previousPower,
      fireballMsRemaining: 0,
      missileMsRemaining: 0,
      missileShotCooldownMs: 0,
      ghostMsRemaining: 0,
    };

    if (kind === "fireball") {
      return {
        ...reset,
        fireballMsRemaining: GAMEPLAY_TUNING.power.fireballDurationMs,
        fireballPickupCount: previousPower.fireballPickupCount + 1,
      };
    }

    if (kind === "missile") {
      return {
        ...reset,
        missileMsRemaining: GAMEPLAY_TUNING.power.missileDurationMs,
        missileShotCooldownMs: 0,
        missilePickupCount: previousPower.missilePickupCount + 1,
      };
    }

    return {
      ...reset,
      ghostMsRemaining: GAMEPLAY_TUNING.power.ghostDurationMs,
      ghostPickupCount: previousPower.ghostPickupCount + 1,
    };
  }
}
