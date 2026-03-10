import { clamp } from "../../core/math/clamp";
import { GAMEPLAY_TUNING } from "../tuning";
import type { ObstacleKind, ObstacleState, PassEvent, PlayerState } from "../types";

export interface CollisionCheckResult {
  collisionObstacle: ObstacleState | null;
  brokenObstacleIds: readonly number[];
  jumpClearObstacleIds: readonly number[];
}

export class ObstacleSystem {
  advance(obstacles: readonly ObstacleState[], deltaMs: number, scrollSpeed: number): ObstacleState[] {
    const nextYStep = (Math.max(0, deltaMs) / 1000) * scrollSpeed;
    const nextObstacles = new Array<ObstacleState>();

    for (const obstacle of obstacles) {
      const y = obstacle.y - nextYStep;
      if (y > GAMEPLAY_TUNING.collision.despawnY) {
        nextObstacles.push({ ...obstacle, y });
      }
    }

    return nextObstacles;
  }

  checkCollisions(
    player: PlayerState,
    obstacles: readonly ObstacleState[],
    fireballActive: boolean,
    ghostActive: boolean,
  ): CollisionCheckResult {
    const brokenObstacleIds: number[] = [];
    const jumpClearObstacleIds: number[] = [];

    if (ghostActive) {
      return {
        collisionObstacle: null,
        brokenObstacleIds,
        jumpClearObstacleIds,
      };
    }

    for (const obstacle of obstacles) {
      if (Math.abs(obstacle.y - player.y) > GAMEPLAY_TUNING.collision.verticalWindowPx) {
        continue;
      }

      if (obstacle.kind === "low_wall") {
        if (player.y >= GAMEPLAY_TUNING.collision.lowWallJumpClearY) {
          jumpClearObstacleIds.push(obstacle.id);
          continue;
        }

        return {
          collisionObstacle: obstacle,
          brokenObstacleIds,
          jumpClearObstacleIds,
        };
      }

      if (obstacle.kind === "breakable_wall") {
        if (fireballActive) {
          brokenObstacleIds.push(obstacle.id);
          continue;
        }

        if (player.y >= GAMEPLAY_TUNING.collision.breakableJumpClearY) {
          jumpClearObstacleIds.push(obstacle.id);
          continue;
        }

        return {
          collisionObstacle: obstacle,
          brokenObstacleIds,
          jumpClearObstacleIds,
        };
      }

      if (!this.isPlayerInsideGap(player.x, obstacle)) {
        return {
          collisionObstacle: obstacle,
          brokenObstacleIds,
          jumpClearObstacleIds,
        };
      }
    }

    return {
      collisionObstacle: null,
      brokenObstacleIds,
      jumpClearObstacleIds,
    };
  }

  selectMissileTarget(player: PlayerState, obstacles: readonly ObstacleState[]): ObstacleState | null {
    let best: ObstacleState | null = null;
    let bestScore = -Infinity;

    for (const obstacle of obstacles) {
      const aheadY = obstacle.y - player.y;
      if (aheadY < 12 || aheadY > 260) {
        continue;
      }

      const targetX = this.impactXForObstacle(player.x, obstacle);
      const lateralDistance = Math.abs(targetX - player.x);
      const proximity = 1 - clamp(aheadY / 260, 0, 1);
      const breakWeight = this.canMissileBreak(obstacle.kind) ? 0.55 : 0;
      const score = proximity * 0.95 + obstacle.risk * 0.62 + breakWeight - lateralDistance * 0.6;

      if (score > bestScore) {
        bestScore = score;
        best = obstacle;
      }
    }

    return best;
  }

  canMissileBreak(kind: ObstacleKind): boolean {
    return kind === "tight_gate" || kind === "low_wall" || kind === "breakable_wall";
  }

  impactXForObstacle(playerX: number, obstacle: ObstacleState): number {
    if (obstacle.kind === "low_wall" || obstacle.kind === "breakable_wall") {
      return playerX;
    }

    return obstacle.gapCenterX;
  }

  evaluatePassEvents(
    previousObstacles: readonly ObstacleState[],
    currentObstacles: readonly ObstacleState[],
    player: PlayerState,
  ): PassEvent[] {
    const previousById = new Map<number, ObstacleState>();
    for (const obstacle of previousObstacles) {
      previousById.set(obstacle.id, obstacle);
    }

    const passEvents: PassEvent[] = [];

    for (const obstacle of currentObstacles) {
      const previous = previousById.get(obstacle.id);
      if (!previous) {
        continue;
      }

      const crossedPlayerLine = previous.y > player.y && obstacle.y <= player.y;
      if (!crossedPlayerLine) {
        continue;
      }

      passEvents.push({
        obstacleId: obstacle.id,
        obstacleKind: obstacle.kind,
        obstacleSignature: obstacle.signature,
        quality: this.classifyPass(player, obstacle),
        risk: obstacle.risk,
      });
    }

    return passEvents;
  }

  excludeByIds(obstacles: readonly ObstacleState[], idsToRemove: readonly number[]): ObstacleState[] {
    if (idsToRemove.length === 0) {
      return [...obstacles];
    }

    const idSet = new Set(idsToRemove);
    return obstacles.filter((obstacle) => !idSet.has(obstacle.id));
  }

  private classifyPass(player: PlayerState, obstacle: ObstacleState): PassEvent["quality"] {
    if (obstacle.kind === "low_wall" || obstacle.kind === "breakable_wall") {
      return player.y >= GAMEPLAY_TUNING.collision.lowWallJumpClearY ? "jump_clear" : "clean_pass";
    }

    const distanceToCenter = Math.abs(player.x - obstacle.gapCenterX);

    if (distanceToCenter <= GAMEPLAY_TUNING.skill.perfectCenterThresholdNormalized) {
      return "perfect_pass";
    }

    const safeRadius = this.safeRadius(obstacle);
    const distanceToEdge = safeRadius - distanceToCenter;

    if (distanceToEdge <= GAMEPLAY_TUNING.skill.nearMissEdgeThresholdNormalized) {
      return "near_miss";
    }

    return "clean_pass";
  }

  private isPlayerInsideGap(playerX: number, obstacle: ObstacleState): boolean {
    return Math.abs(playerX - obstacle.gapCenterX) <= this.safeRadius(obstacle);
  }

  private safeRadius(obstacle: ObstacleState): number {
    const halfGap = obstacle.gapWidth * 0.5;
    return Math.max(
      0.01,
      halfGap - GAMEPLAY_TUNING.collision.playerCollisionRadiusNormalized +
        GAMEPLAY_TUNING.collision.horizontalForgivenessNormalized,
    );
  }
}
