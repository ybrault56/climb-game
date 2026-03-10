
import Phaser from "phaser";
import { clamp } from "../../core/math/clamp";
import type {
  DeathPositionBucket,
  RunDeathCause,
  RunDeathObstacleKind,
} from "../../data/save/RunStats";
import { FrameClock } from "../../core/time/FrameClock";
import { resolveSceneServices } from "../contracts/SceneSystemContract";
import { FloatingTextFx } from "../fx/FloatingTextFx";
import type { SpawnAccumulator } from "../spawning/SpawnSystem";
import { GAMEPLAY_TUNING } from "../tuning";
import type {
  BonusCollectEvent,
  BonusKind,
  BonusState,
  ObstacleKind,
  ObstacleState,
  PassEvent,
  RunSnapshot,
} from "../types";
import { createRunStateFusion, resolveRunHeatState, type RunHeatState } from "../progression/RunStateFusion";
import { SCENE_KEYS } from "./sceneKeys";

interface FlowLine {
  line: Phaser.GameObjects.Rectangle;
  depth: number;
  speedFactor: number;
  phase: number;
  railFactor: number;
}

interface SideStreak {
  line: Phaser.GameObjects.Rectangle;
  side: -1 | 1;
  speedFactor: number;
  phase: number;
  baseOffset: number;
}

interface WallPanel {
  panel: Phaser.GameObjects.Rectangle;
  core: Phaser.GameObjects.Rectangle;
  side: -1 | 1;
  speedFactor: number;
  phase: number;
  baseOffset: number;
}

interface FeedbackPoint {
  x: number;
  y: number;
}

export class GameScene extends Phaser.Scene {
  private readonly clock = new FrameClock();

  private spawnAccumulator: SpawnAccumulator | null = null;
  private runBestScoreAtStart = 0;
  private unsubscribeRetry: (() => void) | null = null;

  private leftKey: Phaser.Input.Keyboard.Key | null = null;
  private rightKey: Phaser.Input.Keyboard.Key | null = null;
  private aKey: Phaser.Input.Keyboard.Key | null = null;
  private dKey: Phaser.Input.Keyboard.Key | null = null;
  private spaceKey: Phaser.Input.Keyboard.Key | null = null;

  private pointerActive = false;
  private pointerX: number | null = null;
  private movementPointerId: number | null = null;
  private pointerDownY = 0;
  private pointerDownAtMs = 0;
  private pointerJumpConsumed = false;
  private jumpRequested = false;

  private playerOrb: Phaser.GameObjects.Arc | null = null;
  private playerCore: Phaser.GameObjects.Arc | null = null;
  private playerSpecular: Phaser.GameObjects.Arc | null = null;
  private playerRim: Phaser.GameObjects.Arc | null = null;
  private playerHalo: Phaser.GameObjects.Arc | null = null;
  private fireAura: Phaser.GameObjects.Arc | null = null;
  private feedbackRing: Phaser.GameObjects.Arc | null = null;
  private comfortPulse: Phaser.GameObjects.Rectangle | null = null;

  private readonly trailDots: Phaser.GameObjects.Arc[] = [];
  private readonly flowLines: FlowLine[] = [];
  private readonly sideStreaks: SideStreak[] = [];
  private readonly wallPanels: WallPanel[] = [];

  private reactorGlow: Phaser.GameObjects.Arc | null = null;
  private obstacleGraphics: Phaser.GameObjects.Graphics | null = null;
  private bonusGraphics: Phaser.GameObjects.Graphics | null = null;
  private floatingTextFx: FloatingTextFx | null = null;

  private backgroundOffsetY = 0;
  private sensoryBoost = 0;
  private cameraDriftX = 0;
  private cameraTilt = 0;
  private lastCombo = 0;
  private collectedBonusCount = 0;
  private lastFireballPulseAtMs = 0;
  private lastGhostPulseAtMs = 0;
  private lastMagnetTickAtMs = 0;
  private lastSpeedParticleAtMs = 0;
  private hitStopTimer: Phaser.Time.TimerEvent | null = null;
  private runHeatState: RunHeatState = "flow";
  private runPressure = 0;

  constructor() {
    super(SCENE_KEYS.game);
  }

  create(): void {
    const services = resolveSceneServices();

    this.clock.reset();
    this.createVisualFrame();
    this.setupInput();
    this.createPlayerVisuals();
    this.floatingTextFx = new FloatingTextFx(this);

    this.unsubscribeRetry = services.events.on("run:retry", () => {
      this.restartRun();
    });

    this.restartRun();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.GAME_OUT, this.onPointerUp, this);

      for (const trailDot of this.trailDots) {
        trailDot.destroy();
      }
      this.trailDots.length = 0;

      for (const flowLine of this.flowLines) {
        flowLine.line.destroy();
      }
      this.flowLines.length = 0;

      for (const sideStreak of this.sideStreaks) {
        sideStreak.line.destroy();
      }
      this.sideStreaks.length = 0;

      for (const wallPanel of this.wallPanels) {
        wallPanel.panel.destroy();
        wallPanel.core.destroy();
      }
      this.wallPanels.length = 0;

      this.playerOrb?.destroy();
      this.playerCore?.destroy();
      this.playerSpecular?.destroy();
      this.playerRim?.destroy();
      this.playerHalo?.destroy();
      this.fireAura?.destroy();
      this.reactorGlow?.destroy();
      this.feedbackRing?.destroy();
      this.comfortPulse?.destroy();
      this.obstacleGraphics?.destroy();
      this.bonusGraphics?.destroy();

      this.playerOrb = null;
      this.playerCore = null;
      this.playerSpecular = null;
      this.playerRim = null;
      this.playerHalo = null;
      this.fireAura = null;
      this.reactorGlow = null;
      this.feedbackRing = null;
      this.comfortPulse = null;
      this.obstacleGraphics = null;
      this.bonusGraphics = null;
      this.floatingTextFx?.clear();
      this.floatingTextFx = null;

      if (this.hitStopTimer) {
        this.hitStopTimer.remove(false);
      }
      this.hitStopTimer = null;
      this.time.timeScale = 1;
      services.audio.setBedState("idle");

      if (this.unsubscribeRetry) {
        this.unsubscribeRetry();
      }
      this.unsubscribeRetry = null;
    });
  }

  override update(time: number): void {
    const services = resolveSceneServices();
    const step = this.clock.tick(time);
    if (step.deltaMs <= 0) {
      return;
    }

    this.sensoryBoost = Math.max(0, this.sensoryBoost - step.deltaMs * 0.001);

    const current = services.store.getState();
    const fireballIntensity = this.fireballIntensity(current);

    if (current.status !== "running") {
      const fusion = this.resolveRunFusion(current, fireballIntensity);
      this.runHeatState = fusion.state;
      this.runPressure = fusion.pressure;

      services.audio.setBedState(current.status === "failed" ? "failed" : fusion.state);

      this.renderBackground(
        current.difficulty.scrollSpeed,
        current.player,
        current.score.flowLevel,
        fireballIntensity,
        step.deltaMs,
        fusion.pressure,
        fusion.state,
      );
      this.renderRun(current, fireballIntensity, fusion.pressure, fusion.state);
      return;
    }

    const inputFrame = services.systems.input.toInputFrame({
      pointerActive: this.pointerActive,
      pointerX: this.pointerX,
      moveLeft: Boolean(this.leftKey?.isDown) || Boolean(this.aKey?.isDown),
      moveRight: Boolean(this.rightKey?.isDown) || Boolean(this.dKey?.isDown),
      jump: this.consumeJumpRequest(),
      retry: false,
    });

    const player = services.systems.input.movePlayer(current.player, inputFrame, step.deltaMs);
    const justLanded =
      current.player.y > 4 &&
      player.y <= 0.01 &&
      player.velocityY === 0 &&
      current.player.velocityY < -80;

    const elapsedMs = current.elapsedMs + step.deltaMs;
    const difficulty = services.systems.difficulty.compute(elapsedMs);

    const powerTicked = services.systems.bonus.tickPower(current.power, step.deltaMs);

    const spawnAccumulator = this.spawnAccumulator ?? services.systems.spawning.createAccumulator();
    const spawnTick = services.systems.spawning.tick(spawnAccumulator, step.deltaMs, elapsedMs, difficulty);
    this.spawnAccumulator = spawnTick.accumulator;

    const mergedObstacles = current.obstacles.concat(spawnTick.spawnedObstacles);
    const mergedBonuses = current.bonuses.concat(spawnTick.spawnedBonuses);

    const advancedObstacles = services.systems.obstacles.advance(
      mergedObstacles,
      step.deltaMs,
      difficulty.scrollSpeed,
    );
    const advancedBonuses = services.systems.bonus.advanceBonuses(
      mergedBonuses,
      step.deltaMs,
      difficulty.scrollSpeed,
    );

    const bonusFrame = services.systems.bonus.collectBonuses(player, powerTicked, advancedBonuses);
    this.collectedBonusCount += bonusFrame.collected.length;

    let power = bonusFrame.power;
    const missileDestroyedIds: number[] = [];

    if (services.systems.bonus.isMissileActive(power)) {
      const missileShot = services.systems.bonus.consumeMissileShot(power);
      power = missileShot.power;

      if (missileShot.fired) {
        const missileTarget = services.systems.obstacles.selectMissileTarget(player, advancedObstacles);
        if (missileTarget) {
          const impactXNorm = services.systems.obstacles.impactXForObstacle(player.x, missileTarget);
          const impactX = this.normalizedXToScreen(impactXNorm);
          const impactY = this.logicalToScreenY(missileTarget.y);
          this.emitMissileTrace(this.normalizedXToScreen(player.x), this.playerGroundScreenY() - player.y, impactX, impactY);
          services.audio.play("missileShot");

          if (services.systems.obstacles.canMissileBreak(missileTarget.kind)) {
            missileDestroyedIds.push(missileTarget.id);
            power = services.systems.bonus.registerMissileBreak(power, 1);
            this.emitSparkBurst(impactX, impactY, 0xffaf76, 10, 0.92);
            this.emitSoftPulse(0.036, 96, 0xffa86d);
          } else {
            this.emitSparkBurst(impactX, impactY, 0xffdfbf, 6, 0.52);
          }
        }
      }
    }

    const obstaclesAfterMissile = services.systems.obstacles.excludeByIds(advancedObstacles, missileDestroyedIds);

    const collisionCheck = services.systems.obstacles.checkCollisions(
      player,
      obstaclesAfterMissile,
      services.systems.bonus.isFireballActive(power),
      services.systems.bonus.isGhostActive(power),
    );

    const brokenObstacleImpacts = this.resolveObstacleImpactPoints(
      obstaclesAfterMissile,
      collisionCheck.brokenObstacleIds,
      player.x,
    );

    const missileObstacleImpacts = this.resolveObstacleImpactPoints(
      advancedObstacles,
      missileDestroyedIds,
      player.x,
    );

    const obstaclesAfterBreak = services.systems.obstacles.excludeByIds(
      obstaclesAfterMissile,
      collisionCheck.brokenObstacleIds,
    );

    let collisionObstacle = collisionCheck.collisionObstacle;

    if (collisionObstacle) {
      const shieldResult = services.systems.bonus.consumeShield(power);
      power = shieldResult.power;
      if (shieldResult.blocked) {
        collisionObstacle = null;
        this.emitFeedbackRing(1.35, 0xa8f3ff, 0.34, 120);
        this.emitSoftPulse(0.03, 95, 0x93eeff);
        this.emitSparkBurst(this.normalizedXToScreen(player.x), this.playerGroundScreenY() - player.y, 0xa4f2ff, 7, 0.52);
        this.spawnFeedbackText({
          text: "SHIELD BLOCK",
          x: this.normalizedXToScreen(player.x),
          y: this.playerGroundScreenY() - player.y - 42,
          channel: "impact",
          tone: "major",
          color: "#CCF9FF",
          intensity: current.score.flowLevel,
        });
        services.audio.play("shieldHit");
      }
    }

    if (collisionCheck.brokenObstacleIds.length > 0) {
      power = services.systems.bonus.registerFireballBreak(power, collisionCheck.brokenObstacleIds.length);
    }

    const passEvents = collisionObstacle
      ? []
      : services.systems.obstacles.evaluatePassEvents(mergedObstacles, obstaclesAfterBreak, player);

    const score = services.systems.score.tick(current.score, step.deltaMs, {
      passEvents,
      bonusEvents: bonusFrame.collected,
      fireballBreakWalls: collisionCheck.brokenObstacleIds.length,
      missileBreakWalls: missileDestroyedIds.length,
      jumpClears: collisionCheck.jumpClearObstacleIds.length,
    });

    const next: RunSnapshot = {
      ...current,
      elapsedMs,
      player,
      power,
      obstacles: obstaclesAfterBreak,
      bonuses: bonusFrame.remainingBonuses,
      difficulty,
      score,
      status: "running",
    };

    const committed = collisionObstacle ? services.systems.runFlow.fail(next) : next;
    const nextFireballIntensity = this.fireballIntensity(committed);
    const fusion = this.resolveRunFusion(committed, nextFireballIntensity);
    this.runHeatState = fusion.state;
    this.runPressure = fusion.pressure;

    const fireballRatio = clamp(
      committed.power.fireballMsRemaining / GAMEPLAY_TUNING.power.fireballDurationMs,
      0,
      1,
    );
    const tensionLevel = clamp(
      0.15 +
        (committed.difficulty.level / GAMEPLAY_TUNING.difficulty.maxLevel) * 0.36 +
        committed.score.flowLevel * 0.22 +
        fireballRatio * 0.13 +
        clamp(fusion.pressure / 1.35, 0, 1) * 0.24,
      0.12,
      1,
    );
    services.audio.setTensionLevel(tensionLevel);
    services.audio.setBedState(fusion.state);

    services.store.setState(committed);
    services.events.emit("score:updated", {
      score: committed.score.current,
      best: committed.score.best,
    });

    this.handleLoopFeedback(
      current,
      committed,
      passEvents,
      bonusFrame.collected,
      collisionCheck.brokenObstacleIds.length,
      missileDestroyedIds.length,
      brokenObstacleImpacts,
      missileObstacleImpacts,
    );
    this.handleStateAudio(current, committed, justLanded);

    this.renderBackground(
      committed.difficulty.scrollSpeed,
      committed.player,
      committed.score.flowLevel,
      nextFireballIntensity,
      step.deltaMs,
      fusion.pressure,
      fusion.state,
    );
    this.renderRun(committed, nextFireballIntensity, fusion.pressure, fusion.state);

    if (committed.status === "running") {
      this.emitDirectionalSpeedParticles(committed, step.deltaMs);
    }

    if (collisionObstacle) {
      this.handleFailure(committed, "obstacle_collision", collisionObstacle.kind);
    }
  }

  private restartRun(): void {
    const services = resolveSceneServices();
    const bestScore = services.highscoreRepository.loadBestScore();
    const initialDifficulty = services.systems.difficulty.compute(0);
    const initialSnapshot = services.systems.runFlow.start(bestScore, initialDifficulty);

    this.runBestScoreAtStart = bestScore;
    this.spawnAccumulator = services.systems.spawning.createAccumulator();
    this.resetTrail();
    this.sensoryBoost = 0;
    this.cameraDriftX = 0;
    this.cameraTilt = 0;
    this.lastCombo = 0;
    this.collectedBonusCount = 0;
    this.lastFireballPulseAtMs = 0;
    this.lastGhostPulseAtMs = 0;
    this.lastMagnetTickAtMs = 0;
    this.lastSpeedParticleAtMs = 0;
    this.runHeatState = "flow";
    this.runPressure = 0;
    this.floatingTextFx?.clear();

    if (this.hitStopTimer) {
      this.hitStopTimer.remove(false);
    }
    this.hitStopTimer = null;
    this.time.timeScale = 1;

    if (this.fireAura) {
      this.fireAura.setAlpha(0);
      this.fireAura.setScale(1);
    }

    this.cameras.main.setScroll(0, 0);
    this.cameras.main.setZoom(GAMEPLAY_TUNING.motion.baseZoom);
    this.cameras.main.setRotation(0);

    services.audio.setTensionLevel(0.18);
    services.audio.setBedState("flow");
    services.store.setState(initialSnapshot);
    services.events.emit("run:started", initialSnapshot);
    this.emitFeedbackRing(1.2, 0xb6f5ff, 0.2, 110);
    this.emitSoftPulse(0.025, 84, 0x8ae9ff);
    services.audio.play("runStart");
  }

  private setupInput(): void {
    this.leftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT) ?? null;
    this.rightKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT) ?? null;
    this.aKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A) ?? null;
    this.dKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D) ?? null;
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) ?? null;

    this.input.addPointer(2);
    this.input.mouse?.disableContextMenu();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.GAME_OUT, this.onPointerUp, this);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.movementPointerId === null || this.movementPointerId === pointer.id) {
      this.movementPointerId = pointer.id;
      this.pointerActive = true;
      this.pointerX = this.pointerToNormalizedX(pointer.x);
      this.pointerDownY = pointer.y;
      this.pointerDownAtMs = this.time.now;
      this.pointerJumpConsumed = false;
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown || this.movementPointerId !== pointer.id) {
      return;
    }

    this.pointerActive = true;
    this.pointerX = this.pointerToNormalizedX(pointer.x);

    if (!this.pointerJumpConsumed && this.pointerDownY - pointer.y >= GAMEPLAY_TUNING.jump.swipeMinDeltaY) {
      this.requestJump();
      this.pointerJumpConsumed = true;
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.movementPointerId !== pointer.id) {
      return;
    }

    const downDuration = this.time.now - this.pointerDownAtMs;
    if (!this.pointerJumpConsumed && downDuration <= GAMEPLAY_TUNING.jump.tapMaxDurationMs) {
      this.requestJump();
    }

    this.movementPointerId = null;
    this.pointerActive = false;
    this.pointerX = null;
    this.pointerJumpConsumed = false;
  }

  private requestJump(): void {
    this.jumpRequested = true;
  }

  private consumeJumpRequest(): boolean {
    const keyboardJump = this.spaceKey ? Phaser.Input.Keyboard.JustDown(this.spaceKey) : false;
    const requested = this.jumpRequested || keyboardJump;
    this.jumpRequested = false;
    return requested;
  }

  private createVisualFrame(): void {
    const centerX = this.corridorCenterX();
    const corridorWidth = this.corridorWidth();
    const halfWidth = corridorWidth * 0.5;
    const nearY = this.scale.height + 32;
    const vanishingY = this.scale.height * 0.1;
    const nearHalf = halfWidth * 1.1;
    const farHalf = halfWidth * 0.24;

    this.add.rectangle(centerX, this.scale.height * 0.5, this.scale.width, this.scale.height, 0x04080f, 1).setDepth(-20);

    const shaft = this.add.graphics().setDepth(-18);
    shaft.fillStyle(0x0a131d, 0.98);
    shaft.beginPath();
    shaft.moveTo(centerX - nearHalf, nearY);
    shaft.lineTo(centerX - farHalf, vanishingY);
    shaft.lineTo(centerX + farHalf, vanishingY);
    shaft.lineTo(centerX + nearHalf, nearY);
    shaft.closePath();
    shaft.fillPath();

    const railSteps = [-0.95, -0.62, -0.32, 0, 0.32, 0.62, 0.95];
    for (const railFactor of railSteps) {
      const nearX = centerX + nearHalf * railFactor * 0.94;
      const farX = centerX + farHalf * railFactor * 0.5;
      this.add.line(0, 0, farX, vanishingY, nearX, nearY, 0x1f3b48, 0.72).setOrigin(0).setDepth(-17);
    }

    for (let index = 0; index < 12; index += 1) {
      const depth = index / 11;
      const railFactor = -1 + (index / 11) * 2;
      const speedFactor = 0.62 + Math.random() * 0.74;
      const phase = Math.random() * (this.scale.height + 170);
      const line = this.add
        .rectangle(centerX, this.scale.height * 0.5, 1.3, 38, GAMEPLAY_TUNING.accentColor, 0.11)
        .setDepth(-16);
      this.flowLines.push({ line, depth, speedFactor, phase, railFactor });
    }

    for (let index = 0; index < 14; index += 1) {
      const side: -1 | 1 = index % 2 === 0 ? -1 : 1;
      const speedFactor = 0.72 + Math.random() * 0.95;
      const phase = Math.random() * (this.scale.height + 220);
      const baseOffset = halfWidth + 16 + Math.random() * 26;
      const line = this.add
        .rectangle(centerX + side * baseOffset, this.scale.height * 0.5, 1.2, 42, GAMEPLAY_TUNING.accentSoftColor, 0.06)
        .setDepth(-15);
      this.sideStreaks.push({ line, side, speedFactor, phase, baseOffset });
    }
    for (let index = 0; index < 18; index += 1) {
      const side: -1 | 1 = index % 2 === 0 ? -1 : 1;
      const speedFactor = 0.58 + Math.random() * 0.72;
      const phase = Math.random() * (this.scale.height + 260);
      const baseOffset = halfWidth * 0.92 + 12 + Math.random() * 20;

      const panel = this.add
        .rectangle(centerX + side * baseOffset, this.scale.height * 0.5, 22, 48, 0x112131, 0.2)
        .setDepth(-16);
      const core = this.add
        .rectangle(centerX + side * baseOffset, this.scale.height * 0.5, 3, 26, GAMEPLAY_TUNING.accentSoftColor, 0.14)
        .setDepth(-15);
      this.wallPanels.push({ panel, core, side, speedFactor, phase, baseOffset });
    }

    this.reactorGlow = this.add
      .circle(centerX, vanishingY + 24, Math.max(26, halfWidth * 0.2), GAMEPLAY_TUNING.accentSoftColor, 0.16)
      .setDepth(-14)
      .setAlpha(0.24);

    this.obstacleGraphics = this.add.graphics().setDepth(15);
    this.bonusGraphics = this.add.graphics().setDepth(19);

    this.comfortPulse = this.add
      .rectangle(centerX, this.scale.height * 0.5, this.scale.width, this.scale.height, GAMEPLAY_TUNING.accentColor, 1)
      .setDepth(36)
      .setAlpha(0);
  }

  private createPlayerVisuals(): void {
    const x = this.normalizedXToScreen(0);
    const y = this.playerGroundScreenY();
    const radius = GAMEPLAY_TUNING.layout.playerRadiusPx;

    this.playerHalo = this.add.circle(x, y, radius * 3.8, GAMEPLAY_TUNING.accentColor, 0.18).setDepth(7);
    this.playerRim = this.add
      .circle(x, y, radius * 1.78, 0x96f4ff, 0.22)
      .setDepth(8)
      .setStrokeStyle(2, 0xe8fdff, 0.48);
    this.playerOrb = this.add
      .circle(x, y, radius * 1.26, 0x35cde1, 0.96)
      .setDepth(9)
      .setStrokeStyle(2.8, GAMEPLAY_TUNING.accentSoftColor, 0.86);
    this.playerCore = this.add.circle(x, y, radius * 0.58, 0xebfdff, 0.99).setDepth(10);
    this.playerSpecular = this.add.circle(x - radius * 0.32, y - radius * 0.34, radius * 0.26, 0xffffff, 0.8).setDepth(11);
    this.fireAura = this.add
      .circle(x, y, radius * 2.8, 0xff8d4a, 0.24)
      .setDepth(12)
      .setStrokeStyle(2.2, 0xffc07f, 0.34)
      .setAlpha(0);
    this.feedbackRing = this.add
      .circle(x, y, radius * 1.8, GAMEPLAY_TUNING.accentColor, 0)
      .setDepth(13)
      .setStrokeStyle(2, GAMEPLAY_TUNING.accentSoftColor, 0.5)
      .setAlpha(0);

    for (let index = 0; index < GAMEPLAY_TUNING.motion.trailCount; index += 1) {
      const dotRadius = Math.max(3, radius - index * 2);
      const trailDot = this.add
        .circle(x, y, dotRadius, GAMEPLAY_TUNING.accentColor, Math.max(0.06, 0.24 - index * 0.03))
        .setDepth(6 - index);
      this.trailDots.push(trailDot);
    }
  }

  private renderBackground(
    scrollSpeed: number,
    player: RunSnapshot["player"],
    flowLevel: number,
    fireballIntensity: number,
    deltaMs: number,
    runPressure: number,
    heatState: RunHeatState,
  ): void {
    this.backgroundOffsetY += (scrollSpeed * deltaMs) / 1000;

    const centerX = this.corridorCenterX();
    const nearY = this.scale.height + 20;
    const vanishingY = this.scale.height * 0.13;
    const farHalf = this.corridorHalfWidth() * 0.26;
    const nearHalf = this.corridorHalfWidth() * 1.02;

    const speedRatio = clamp(scrollSpeed / GAMEPLAY_TUNING.difficulty.maxScrollSpeed, 0, 1);
    const pressureNorm = clamp(runPressure / 1.1, 0, 1);
    const heatBoost = heatState === "rush" ? 0.24 : heatState === "heat" ? 0.12 : 0;
    const runIntensity = clamp(
      speedRatio * 0.68 +
        flowLevel * 0.52 +
        fireballIntensity * 0.42 +
        runPressure * 0.56 +
        this.sensoryBoost * 0.24 +
        heatBoost,
      0,
      2.35,
    );

    const flowLineColor = this.blendColor(GAMEPLAY_TUNING.accentColor, 0xffbd7f, pressureNorm * 0.78);
    const sideStreakColor = this.blendColor(GAMEPLAY_TUNING.accentSoftColor, 0xffc893, pressureNorm * 0.72);

    const travelHeight = this.scale.height + 180;
    for (const flowLine of this.flowLines) {
      const travel = (this.backgroundOffsetY * flowLine.speedFactor + flowLine.phase) % travelHeight;
      const t = clamp(travel / travelHeight, 0, 1);
      const perspective = Math.pow(t, 1.5);
      const y = Phaser.Math.Linear(vanishingY + 14, nearY, perspective);
      const depthWidth = Phaser.Math.Linear(farHalf, nearHalf, 0.2 + flowLine.depth * 0.8);
      const x = centerX + flowLine.railFactor * depthWidth * 0.78 + player.x * (8 + flowLine.depth * 14);
      flowLine.line.setPosition(x, y);
      flowLine.line.setDisplaySize(
        1.2 + flowLine.depth * 2 + runIntensity * 0.52,
        18 + perspective * 44 + runIntensity * 16,
      );
      flowLine.line.setFillStyle(flowLineColor, 1);
      flowLine.line.setAlpha(
        0.045 +
          flowLine.speedFactor *
            (0.042 + flowLevel * 0.046 + fireballIntensity * 0.07 + runIntensity * 0.024 + pressureNorm * 0.02),
      );
    }

    const sideTravelHeight = this.scale.height + 240;
    for (const sideStreak of this.sideStreaks) {
      const travel = (this.backgroundOffsetY * sideStreak.speedFactor + sideStreak.phase) % sideTravelHeight;
      const t = clamp(travel / sideTravelHeight, 0, 1);
      const perspective = Math.pow(t, 1.35);
      const y = Phaser.Math.Linear(vanishingY + 6, nearY + 28, perspective);
      const x =
        centerX +
        sideStreak.side * (sideStreak.baseOffset + perspective * 24 + runIntensity * 9 + pressureNorm * 5) +
        player.x * (8 + perspective * 6);
      sideStreak.line.setPosition(x, y);
      sideStreak.line.setDisplaySize(1 + runIntensity * 0.95, 14 + perspective * 42 + runIntensity * 18);
      sideStreak.line.setFillStyle(sideStreakColor, 1);
      sideStreak.line.setAlpha(0.018 + runIntensity * 0.055 + fireballIntensity * 0.05 + pressureNorm * 0.022);
    }

    const panelTravelHeight = this.scale.height + 280;
    const panelTint = this.blendColor(0x132534, 0x2d1f1a, pressureNorm * 0.8);
    const panelCoreTint = this.blendColor(GAMEPLAY_TUNING.accentSoftColor, 0xffbd7f, pressureNorm * 0.72);

    for (const wallPanel of this.wallPanels) {
      const travel = (this.backgroundOffsetY * wallPanel.speedFactor + wallPanel.phase) % panelTravelHeight;
      const t = clamp(travel / panelTravelHeight, 0, 1);
      const perspective = Math.pow(t, 1.42);
      const y = Phaser.Math.Linear(vanishingY + 10, nearY + 48, perspective);
      const x =
        centerX +
        wallPanel.side *
          (wallPanel.baseOffset + perspective * 36 + runIntensity * 10 + pressureNorm * 7 + Math.abs(player.x) * 2);
      const width = Phaser.Math.Linear(4, 30, perspective) + runIntensity * 1.2;
      const height = Phaser.Math.Linear(10, 74, perspective) + runIntensity * 5;

      wallPanel.panel.setPosition(x, y);
      wallPanel.panel.setDisplaySize(width, height);
      wallPanel.panel.setFillStyle(panelTint, 1);
      wallPanel.panel.setAlpha(0.12 + perspective * 0.26 + pressureNorm * 0.1);

      wallPanel.core.setPosition(x - wallPanel.side * (width * 0.22), y);
      wallPanel.core.setDisplaySize(Math.max(2, width * 0.14), Math.max(8, height * 0.5));
      wallPanel.core.setFillStyle(panelCoreTint, 1);
      wallPanel.core.setAlpha(0.12 + perspective * 0.2 + runIntensity * 0.06);
    }

    if (this.reactorGlow) {
      const reactorColor = this.blendColor(GAMEPLAY_TUNING.accentSoftColor, 0xffc58d, pressureNorm * 0.72);
      this.reactorGlow.setFillStyle(reactorColor, 1);
      this.reactorGlow.setScale(1 + runIntensity * 0.08 + Math.sin(this.backgroundOffsetY * 0.01) * 0.04);
      this.reactorGlow.setAlpha(0.16 + runIntensity * 0.08 + pressureNorm * 0.08);
    }

    const targetDrift =
      player.x * GAMEPLAY_TUNING.motion.cameraDriftPx +
      player.velocityX * GAMEPLAY_TUNING.motion.cameraVelocityInfluence * (1 + runIntensity * 0.24 + pressureNorm * 0.18);
    this.cameraDriftX += (targetDrift - this.cameraDriftX) * GAMEPLAY_TUNING.motion.cameraDriftLerp;
    this.cameras.main.setScroll(this.cameraDriftX, -player.y * 0.06);

    const velocityRatio = clamp(player.velocityX / GAMEPLAY_TUNING.input.maxVelocityForEffects, -1, 1);
    const targetTilt =
      -velocityRatio *
      (GAMEPLAY_TUNING.motion.cameraTiltMaxRad + fireballIntensity * 0.003 + runIntensity * 0.0025 + pressureNorm * 0.0012);
    this.cameraTilt += (targetTilt - this.cameraTilt) * GAMEPLAY_TUNING.motion.cameraTiltLerp;
    this.cameras.main.setRotation(this.cameraTilt);

    const heatZoomBoost = heatState === "rush" ? 0.016 : heatState === "heat" ? 0.008 : 0;
    const targetZoom =
      GAMEPLAY_TUNING.motion.baseZoom +
      speedRatio * GAMEPLAY_TUNING.motion.speedZoomMax +
      flowLevel * GAMEPLAY_TUNING.motion.flowZoomMax +
      fireballIntensity * 0.02 +
      this.sensoryBoost * 0.006 +
      runIntensity * 0.012 +
      pressureNorm * 0.015 +
      heatZoomBoost;
    const zoom = this.cameras.main.zoom + (targetZoom - this.cameras.main.zoom) * GAMEPLAY_TUNING.motion.zoomLerp;
    this.cameras.main.setZoom(zoom);
  }

  private renderRun(snapshot: RunSnapshot, fireballIntensity: number, runPressure: number, heatState: RunHeatState): void {
    const x = this.normalizedXToScreen(snapshot.player.x);
    const y = this.playerGroundScreenY() - snapshot.player.y;
    const pressure = clamp(runPressure / 1.1, 0, 1);
    const missileIntensity = this.missileIntensity(snapshot);
    const ghostIntensity = this.ghostIntensity(snapshot);
    const powerBoost = Math.max(fireballIntensity, missileIntensity * 0.86, ghostIntensity * 0.82);

    const heatColor = this.blendColor(0x37cbdd, 0xffa566, pressure * 0.78);
    const rimColor = this.blendColor(0x8cf2ff, 0xffd9ad, pressure * 0.76);
    const ghostColor = this.blendColor(0xb2efff, 0xe8fcff, 0.65 + pressure * 0.2);
    const missileColor = this.blendColor(0x9defff, 0xffc089, 0.72 + pressure * 0.18);
    const auraColor = heatState === "rush" ? 0xffad6d : heatState === "heat" ? 0x9cf1ff : GAMEPLAY_TUNING.accentColor;

    if (this.playerHalo) {
      this.playerHalo.setPosition(x, y);
      this.playerHalo.setScale(1 + snapshot.score.flowLevel * 0.12 + powerBoost * 0.28 + pressure * 0.1);
      this.playerHalo.setAlpha(0.14 + snapshot.score.flowLevel * 0.14 + powerBoost * 0.26 + this.sensoryBoost * 0.05 + pressure * 0.07);
    }

    if (this.playerRim) {
      this.playerRim.setPosition(x, y);
      this.playerRim.setScale(0.95 + snapshot.score.flowLevel * 0.09 + powerBoost * 0.16);
      const rimTint =
        ghostIntensity > 0.01
          ? this.blendColor(rimColor, ghostColor, ghostIntensity * 0.88)
          : missileIntensity > 0.01
            ? this.blendColor(rimColor, missileColor, missileIntensity * 0.84)
            : fireballIntensity > 0.01
              ? this.blendColor(rimColor, 0xffc087, fireballIntensity * 0.84)
              : rimColor;
      this.playerRim.setFillStyle(rimTint, 0.2 + powerBoost * 0.2 + pressure * 0.07);
    }

    if (this.playerOrb) {
      this.playerOrb.setPosition(x, y);
      const orbTint =
        ghostIntensity > 0.01
          ? this.blendColor(heatColor, ghostColor, ghostIntensity * 0.9)
          : missileIntensity > 0.01
            ? this.blendColor(heatColor, missileColor, missileIntensity * 0.86)
            : fireballIntensity > 0.01
              ? this.blendColor(heatColor, 0xff8a45, fireballIntensity * 0.9)
              : heatColor;
      this.playerOrb.setFillStyle(
        orbTint,
        0.92 + snapshot.score.flowLevel * 0.1 + powerBoost * 0.13 + pressure * 0.05,
      );
      this.playerOrb.setScale(1 + powerBoost * 0.08);
    }

    if (this.playerCore) {
      this.playerCore.setPosition(x, y);
      this.playerCore.setAlpha(0.84 + snapshot.score.flowLevel * 0.12 + powerBoost * 0.14 + pressure * 0.04);
      this.playerCore.setFillStyle(
        ghostIntensity > 0.01 ? 0xe8faff : missileIntensity > 0.01 ? 0xffe2c4 : 0xebfdff,
        1,
      );
    }

    if (this.playerSpecular) {
      this.playerSpecular.setPosition(
        x - GAMEPLAY_TUNING.layout.playerRadiusPx * 0.32,
        y - GAMEPLAY_TUNING.layout.playerRadiusPx * 0.34,
      );
      this.playerSpecular.setAlpha(0.64 + snapshot.score.flowLevel * 0.12 + powerBoost * 0.12);
      this.playerSpecular.setScale(1 + pressure * 0.14 + Math.sin(snapshot.elapsedMs * 0.018) * 0.04 + powerBoost * 0.06);
    }

    if (this.fireAura) {
      const auraPower = fireballIntensity * 0.9 + missileIntensity * 0.64 + ghostIntensity * 0.7;
      const auraTint =
        ghostIntensity > 0.01
          ? this.blendColor(auraColor, ghostColor, ghostIntensity * 0.86)
          : missileIntensity > 0.01
            ? this.blendColor(auraColor, 0xffc18a, missileIntensity * 0.84)
            : this.blendColor(auraColor, 0xffa96f, fireballIntensity * 0.8);
      this.fireAura.setPosition(x, y);
      this.fireAura.setScale(1 + auraPower * 0.26 + Math.sin(snapshot.elapsedMs * 0.02) * 0.06 + pressure * 0.08);
      this.fireAura.setFillStyle(auraTint, 1);
      this.fireAura.setStrokeStyle(2.2, this.blendColor(0xffc07f, 0xffe6c8, pressure * 0.4 + auraPower * 0.14), 0.34 + pressure * 0.08);
      this.fireAura.setAlpha(auraPower * 0.56 + pressure * 0.07);
    }

    if (this.feedbackRing) {
      this.feedbackRing.setPosition(x, y);
    }

    this.updateTrail(
      x,
      y,
      snapshot.score.flowLevel + this.sensoryBoost + pressure * 0.36 + missileIntensity * 0.18 + ghostIntensity * 0.14,
      snapshot.player.velocityX,
      fireballIntensity + missileIntensity * 0.58 + ghostIntensity * 0.26,
      runPressure,
    );
    this.drawObstacles(snapshot.obstacles, fireballIntensity, missileIntensity, ghostIntensity, runPressure, heatState);
    this.drawBonuses(snapshot.bonuses, fireballIntensity + missileIntensity * 0.42 + ghostIntensity * 0.2);
  }

  private drawObstacles(
    obstacles: readonly RunSnapshot["obstacles"][number][],
    fireballIntensity: number,
    missileIntensity: number,
    ghostIntensity: number,
    runPressure: number,
    heatState: RunHeatState,
  ): void {
    if (!this.obstacleGraphics) {
      return;
    }

    const g = this.obstacleGraphics;
    g.clear();

    const centerX = this.corridorCenterX();
    const halfWidth = this.corridorHalfWidth();
    const leftBoundary = centerX - halfWidth;
    const rightBoundary = centerX + halfWidth;
    const pressureNorm = clamp(runPressure / 1.1, 0, 1);

    for (const obstacle of obstacles) {
      const y = this.logicalToScreenY(obstacle.y);
      const proximity = clamp(1 - obstacle.y / GAMEPLAY_TUNING.spawn.obstacleSpawnY, 0, 1);
      const powerIntensity = clamp(fireballIntensity + missileIntensity * 0.72 + ghostIntensity * 0.24, 0, 1.6);
      const baseColor = this.obstacleColor(obstacle.kind, fireballIntensity, heatState, pressureNorm, powerIntensity);

      if (obstacle.kind === "solid_wall" || obstacle.kind === "tight_gate") {
        const gapCenterPx = centerX + obstacle.gapCenterX * halfWidth;
        const gapHalfPx = obstacle.gapWidth * halfWidth * 0.5;
        const leftWidth = Math.max(0, gapCenterPx - gapHalfPx - leftBoundary);
        const rightWidth = Math.max(0, rightBoundary - (gapCenterPx + gapHalfPx));

        if (leftWidth > 2) {
          this.drawObstaclePanel(
            g,
            leftBoundary,
            y,
            leftWidth,
            obstacle.thicknessPx,
            baseColor,
            proximity,
            powerIntensity,
            obstacle.kind,
            obstacle.signature,
            pressureNorm,
          );
        }

        if (rightWidth > 2) {
          this.drawObstaclePanel(
            g,
            rightBoundary - rightWidth,
            y,
            rightWidth,
            obstacle.thicknessPx,
            baseColor,
            proximity,
            powerIntensity,
            obstacle.kind,
            obstacle.signature,
            pressureNorm,
          );
        }

        if (obstacle.kind === "tight_gate") {
          const warningColor = this.blendColor(0xffc892, 0xff8f5f, pressureNorm * 0.66 + proximity * 0.18);
          g.lineStyle(2.4, warningColor, 0.48 + proximity * 0.26 + pressureNorm * 0.12);
          g.beginPath();
          g.moveTo(gapCenterPx - gapHalfPx + 4, y - obstacle.thicknessPx * 0.54);
          g.lineTo(gapCenterPx - gapHalfPx - 9, y + obstacle.thicknessPx * 0.54);
          g.moveTo(gapCenterPx + gapHalfPx - 4, y - obstacle.thicknessPx * 0.54);
          g.lineTo(gapCenterPx + gapHalfPx + 9, y + obstacle.thicknessPx * 0.54);
          g.strokePath();

          g.fillStyle(this.blendColor(0xffd4af, 0xff9d5d, pressureNorm * 0.68), 0.62 + proximity * 0.16);
          g.fillCircle(gapCenterPx - gapHalfPx - 4, y, 2.2 + proximity * 1.6);
          g.fillCircle(gapCenterPx + gapHalfPx + 4, y, 2.2 + proximity * 1.6);
        }

        if (obstacle.kind === "solid_wall") {
          const markerColor = this.blendColor(0xffca9a, 0xff8557, pressureNorm * 0.64);
          g.fillStyle(markerColor, 0.24 + proximity * 0.16 + pressureNorm * 0.08);
          g.fillRect(leftBoundary + 4, y - obstacle.thicknessPx * 0.25, 10, obstacle.thicknessPx * 0.5);
          g.fillRect(rightBoundary - 14, y - obstacle.thicknessPx * 0.25, 10, obstacle.thicknessPx * 0.5);
        }

        continue;
      }

      const bodyHeight = obstacle.kind === "low_wall" ? obstacle.thicknessPx * 0.84 : obstacle.thicknessPx * 1.04;
      const bodyY = y + (obstacle.kind === "low_wall" ? 8 : 0);
      this.drawObstaclePanel(
        g,
        leftBoundary,
        bodyY,
        halfWidth * 2,
        bodyHeight,
        baseColor,
        proximity,
        powerIntensity,
        obstacle.kind,
        obstacle.signature,
        pressureNorm,
      );

      if (obstacle.kind === "low_wall") {
        g.lineStyle(2.2, this.blendColor(0xe3fcff, 0xffc086, pressureNorm * 0.66), 0.3 + proximity * 0.22 + pressureNorm * 0.08);
        const step = Math.max(18, halfWidth * 0.23);
        for (let markerX = leftBoundary + 10; markerX < rightBoundary - 12; markerX += step) {
          g.beginPath();
          g.moveTo(markerX, bodyY + bodyHeight * 0.24);
          g.lineTo(markerX + 9, bodyY - bodyHeight * 0.14);
          g.lineTo(markerX + 18, bodyY + bodyHeight * 0.24);
          g.strokePath();
        }
      }

      if (obstacle.kind === "breakable_wall") {
        const warning = this.blendColor(0xffd8b4, 0xff8f5d, pressureNorm * 0.74 + proximity * 0.14);
        g.lineStyle(2.2, warning, 0.42 + proximity * 0.24 + pressureNorm * 0.12);
        const seam = 10 + Math.sin((obstacle.y + obstacle.id * 17) * 0.04) * 4;
        g.beginPath();
        g.moveTo(centerX - seam, bodyY - bodyHeight * 0.18);
        g.lineTo(centerX + seam, bodyY + bodyHeight * 0.18);
        g.moveTo(centerX - seam * 0.9, bodyY + bodyHeight * 0.2);
        g.lineTo(centerX + seam * 0.9, bodyY - bodyHeight * 0.24);
        g.strokePath();

        g.fillStyle(this.blendColor(0xffc693, 0xff8e5c, pressureNorm * 0.72), 0.34 + proximity * 0.2);
        g.fillCircle(centerX - seam * 0.65, bodyY, 2.2 + proximity * 1.3);
        g.fillCircle(centerX + seam * 0.65, bodyY, 2.2 + proximity * 1.3);
      }
    }
  }

  private drawBonuses(bonuses: readonly BonusState[], fireballIntensity: number): void {
    if (!this.bonusGraphics) {
      return;
    }

    const g = this.bonusGraphics;
    g.clear();

    for (const bonus of bonuses) {
      const x = this.normalizedXToScreen(bonus.x);
      const y = this.logicalToScreenY(bonus.y);
      const pulse = 1 + Math.sin((bonus.y + bonus.id * 23) * 0.04) * 0.08;
      const colors = this.bonusColor(bonus.kind);

      g.fillStyle(colors.core, Math.min(1, colors.alpha + 0.04));
      g.fillCircle(x, y, 6.2 * pulse);

      g.fillStyle(0xffffff, 0.12 + fireballIntensity * 0.06);
      g.fillCircle(x - 1.5, y - 2.5, 2.4 * pulse);

      g.lineStyle(1.8, colors.ring, 0.38 + fireballIntensity * 0.1);
      g.strokeCircle(x, y, 10.2 * (1 + pulse * 0.15 + fireballIntensity * 0.06));

      this.drawBonusIcon(g, bonus.kind, x, y, pulse, fireballIntensity);
    }
  }

  private drawObstaclePanel(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    centerY: number,
    width: number,
    height: number,
    baseColor: number,
    proximity: number,
    powerIntensity: number,
    kind: ObstacleKind,
    signature: ObstacleState["signature"],
    heatPressure: number,
  ): void {
    const top = centerY - height * 0.5;

    const panelTopTint = this.blendColor(0xf0fdff, 0xffd9b8, heatPressure * 0.76 + powerIntensity * 0.08);
    const panelShadow = this.blendColor(0x07131e, 0x22150f, heatPressure * 0.68);
    const warningTint = this.blendColor(0xffc58f, 0xff8650, heatPressure * 0.68 + proximity * 0.22);

    graphics.fillStyle(0x07121d, 0.5 + proximity * 0.22 + heatPressure * 0.1);
    graphics.fillRect(x, top + 2, width, height + 4);

    graphics.fillStyle(baseColor, 0.64 + proximity * 0.3 + powerIntensity * 0.1 + heatPressure * 0.1);
    graphics.fillRect(x, top, width, height);

    graphics.fillStyle(panelTopTint, 0.2 + proximity * 0.2 + heatPressure * 0.08);
    graphics.fillRect(x + 1, top + 1, Math.max(0, width - 2), Math.max(2, height * 0.18));

    graphics.fillStyle(panelShadow, 0.48 + heatPressure * 0.12);
    graphics.fillRect(x + 1, top + height - Math.max(2, height * 0.16), Math.max(0, width - 2), Math.max(2, height * 0.16));

    const panelCount = Math.max(2, Math.min(7, Math.floor(width / 28)));
    const panelStride = width / panelCount;
    for (let index = 1; index < panelCount; index += 1) {
      const grooveX = x + panelStride * index;
      graphics.fillStyle(panelShadow, 0.18 + heatPressure * 0.08);
      graphics.fillRect(grooveX - 1, top + 2, 2, Math.max(2, height - 4));
    }

    graphics.fillStyle(this.blendColor(GAMEPLAY_TUNING.accentSoftColor, 0xffc28d, heatPressure * 0.68 + powerIntensity * 0.1), 0.16 + proximity * 0.12 + powerIntensity * 0.06);
    graphics.fillRect(x + 2, centerY - Math.max(1.2, height * 0.08), Math.max(0, width - 4), Math.max(2, height * 0.16));

    if (kind === "solid_wall" || kind === "breakable_wall") {
      graphics.fillStyle(warningTint, 0.2 + proximity * 0.12);
      graphics.fillRect(x + 2, top + 2, Math.max(2, width * 0.08), Math.max(2, height - 4));
      graphics.fillRect(x + width - Math.max(2, width * 0.08) - 2, top + 2, Math.max(2, width * 0.08), Math.max(2, height - 4));
    }

    if (signature === "needle_gate") {
      graphics.lineStyle(1.6, this.blendColor(0xdafaff, 0xffcd9e, heatPressure * 0.76), 0.38 + proximity * 0.2 + heatPressure * 0.08);
      graphics.strokeRect(x + 1, top + 1, Math.max(0, width - 2), Math.max(0, height - 2));
      return;
    }

    if (signature === "chevron_shutter") {
      graphics.lineStyle(1.9, this.blendColor(0xddfbff, 0xffc694, heatPressure * 0.76), 0.34 + proximity * 0.2 + heatPressure * 0.08);
      graphics.beginPath();
      graphics.moveTo(x + width * 0.34, centerY - 2);
      graphics.lineTo(x + width * 0.5, centerY + height * 0.24);
      graphics.lineTo(x + width * 0.66, centerY - 2);
      graphics.strokePath();
      return;
    }

    if (signature === "prism_clamp") {
      graphics.lineStyle(2.1, this.blendColor(0xffdfc3, 0xffb176, heatPressure * 0.74), 0.38 + proximity * 0.24 + heatPressure * 0.1);
      graphics.beginPath();
      graphics.moveTo(x + width * 0.41, centerY - height * 0.3);
      graphics.lineTo(x + width * 0.5, centerY + height * 0.16);
      graphics.lineTo(x + width * 0.59, centerY - height * 0.3);
      graphics.strokePath();
    }
  }

  private drawBonusIcon(
    graphics: Phaser.GameObjects.Graphics,
    kind: BonusKind,
    x: number,
    y: number,
    pulse: number,
    fireballIntensity: number,
  ): void {
    if (kind === "shard") {
      graphics.fillStyle(0xe8fdff, 0.92);
      graphics.fillTriangle(x, y - 4 * pulse, x - 3.2 * pulse, y + 3.8 * pulse, x + 3.2 * pulse, y + 3.8 * pulse);
      return;
    }

    if (kind === "fireball") {
      graphics.fillStyle(0xffe2c4, 0.9);
      graphics.fillTriangle(x, y - 4.8 * pulse, x - 3 * pulse, y + 2.8 * pulse, x + 3.2 * pulse, y + 2.3 * pulse);
      graphics.fillStyle(0xffa663, 0.9 + fireballIntensity * 0.06);
      graphics.fillCircle(x, y + 1.2 * pulse, 2.5 * pulse);
      return;
    }

    if (kind === "missile_burst") {
      graphics.fillStyle(0xffe4ca, 0.94);
      graphics.fillTriangle(x, y - 4.6 * pulse, x - 2.2 * pulse, y + 3.2 * pulse, x + 2.2 * pulse, y + 3.2 * pulse);
      graphics.fillStyle(0xffb778, 0.9 + fireballIntensity * 0.05);
      graphics.fillRect(x - 1.2 * pulse, y + 1.2 * pulse, 2.4 * pulse, 3.4 * pulse);
      return;
    }

    if (kind === "ghost_core") {
      graphics.lineStyle(1.4, 0xe5fcff, 0.9);
      graphics.strokeCircle(x, y, 3.6 * pulse);
      graphics.fillStyle(0xcbf6ff, 0.84);
      graphics.fillCircle(x, y, 2 * pulse);
      graphics.fillStyle(0xffffff, 0.42);
      graphics.fillCircle(x - 1.2 * pulse, y - 1.2 * pulse, 1.1 * pulse);
      return;
    }

    if (kind === "score_burst") {
      graphics.lineStyle(1.8, 0xeafcff, 0.95);
      graphics.beginPath();
      graphics.moveTo(x - 4, y);
      graphics.lineTo(x + 4, y);
      graphics.moveTo(x, y - 4);
      graphics.lineTo(x, y + 4);
      graphics.strokePath();
      return;
    }

    if (kind === "shield") {
      graphics.fillStyle(0xe1fbff, 0.9);
      graphics.fillRoundedRect(x - 3.8 * pulse, y - 4.4 * pulse, 7.6 * pulse, 8.2 * pulse, 1.8);
      graphics.lineStyle(1.2, 0x82e8ff, 0.9);
      graphics.strokeRoundedRect(x - 3.8 * pulse, y - 4.4 * pulse, 7.6 * pulse, 8.2 * pulse, 1.8);
      return;
    }

    graphics.lineStyle(1.3, 0xe3fcff, 0.9);
    graphics.strokeCircle(x, y, 2.8 * pulse);
    graphics.beginPath();
    graphics.moveTo(x - 5, y);
    graphics.lineTo(x + 5, y);
    graphics.strokePath();
  }

  private handleLoopFeedback(
    previous: RunSnapshot,
    current: RunSnapshot,
    passEvents: readonly PassEvent[],
    bonusEvents: readonly BonusCollectEvent[],
    brokenWalls: number,
    missileBreakWalls: number,
    brokenWallImpacts: readonly FeedbackPoint[],
    missileWallImpacts: readonly FeedbackPoint[],
  ): void {
    const services = resolveSceneServices();
    const playerX = this.normalizedXToScreen(current.player.x);
    const playerY = this.playerGroundScreenY() - current.player.y;

    if (current.player.jumpCount > previous.player.jumpCount) {
      this.playMovementPulse(1.12);
      this.emitFeedbackRing(1.24, 0xc3f8ff, 0.28, 96);
      this.spawnFeedbackText({
        text: "JUMP",
        x: playerX,
        y: playerY - 34,
        channel: "event",
        tone: "minor",
        color: "#BEEFFF",
        intensity: current.score.flowLevel,
      });
      services.audio.play("jump");
    }

    let nearMissCount = 0;
    let perfectCount = 0;
    let jumpClearCount = 0;

    for (const event of passEvents) {
      if (event.quality === "near_miss") {
        nearMissCount += 1;
      } else if (event.quality === "perfect_pass") {
        perfectCount += 1;
      } else if (event.quality === "jump_clear") {
        jumpClearCount += 1;
      }
    }

    if (nearMissCount > 0) {
      this.sensoryBoost = Math.min(1.8, this.sensoryBoost + nearMissCount * 0.12);
      this.spawnFeedbackText({
        text: `NEAR +${nearMissCount * GAMEPLAY_TUNING.skill.nearMissBonus}`,
        x: playerX + 24,
        y: playerY - 56,
        channel: "event",
        tone: "major",
        color: "#9EEFFF",
        intensity: current.score.flowLevel,
        sizePx: 30,
      });
      this.emitSoftPulse(0.03, 96, 0x8fecff);
      this.emitSparkBurst(playerX + 20, playerY - 42, 0x8ceaff, 5, 0.52);
      services.audio.play("nearMiss");
    }

    if (perfectCount > 0) {
      this.sensoryBoost = Math.min(2, this.sensoryBoost + perfectCount * 0.18);
      this.spawnFeedbackText({
        text: `PERFECT x${perfectCount}`,
        x: playerX - 14,
        y: playerY - 78,
        channel: "event",
        tone: "critical",
        color: "#E8FDFF",
        intensity: current.score.flowLevel + perfectCount * 0.15,
        sizePx: 36,
      });
      this.emitFeedbackRing(1.36, 0xd4fdff, 0.36, 138);
      this.emitSparkBurst(playerX - 16, playerY - 62, 0xdbfcff, 9, 0.66);
      services.audio.play("perfectPass");
    }

    if (jumpClearCount > 0) {
      this.spawnFeedbackText({
        text: `UP +${jumpClearCount * GAMEPLAY_TUNING.skill.jumpClearBonus}`,
        x: playerX,
        y: playerY - 98,
        channel: "event",
        tone: "standard",
        color: "#A3F6FF",
        intensity: current.score.flowLevel,
        sizePx: 24,
      });
    }

    if (brokenWalls > 0) {
      this.sensoryBoost = Math.min(2.25, this.sensoryBoost + brokenWalls * 0.22);
      const scoreValue = brokenWalls * GAMEPLAY_TUNING.power.fireballBreakScore;
      const impact = brokenWallImpacts[0] ?? { x: playerX, y: playerY - 18 };
      this.spawnFeedbackText({
        text: `SMASH +${scoreValue}`,
        x: impact.x,
        y: impact.y - 18,
        channel: "impact",
        tone: "critical",
        color: "#FFC48D",
        intensity: current.score.flowLevel + brokenWalls * 0.26,
        sizePx: 38,
        holdMs: 260,
      });
      this.emitFeedbackRing(1.62, 0xffb177, 0.46, 156);
      this.emitSoftPulse(0.065, 146, 0xffb678);
      for (const impactPoint of brokenWallImpacts) {
        this.emitSparkBurst(impactPoint.x, impactPoint.y, 0xffbb83, 12, 1);
      }
      this.triggerHitStop(42, 0.76);
      services.audio.play("wallBreak");
      this.cameras.main.shake(58, 0.0019, true);
    }

    if (missileBreakWalls > 0) {
      this.sensoryBoost = Math.min(2.3, this.sensoryBoost + missileBreakWalls * 0.18);
      const scoreValue = missileBreakWalls * GAMEPLAY_TUNING.power.missileBreakScore;
      const impact = missileWallImpacts[0] ?? { x: playerX, y: playerY - 26 };
      this.spawnFeedbackText({
        text: `MISSILE +${scoreValue}`,
        x: impact.x,
        y: impact.y - 14,
        channel: "impact",
        tone: "major",
        color: "#FFD4AA",
        intensity: current.score.flowLevel + missileBreakWalls * 0.18,
        sizePx: 34,
        holdMs: 210,
      });
      this.emitFeedbackRing(1.46, 0xffbf89, 0.34, 128);
      for (const impactPoint of missileWallImpacts) {
        this.emitSparkBurst(impactPoint.x, impactPoint.y, 0xffc08e, 9, 0.88);
      }
    }

    for (const event of bonusEvents) {
      this.handleBonusCollected(event, current.score.flowLevel);
    }

    if (current.score.combo > this.lastCombo && current.score.combo % 4 === 0) {
      this.spawnFeedbackText({
        text: `COMBO x${current.score.combo}`,
        x: this.scale.width * 0.22,
        y: 84,
        channel: "combo",
        tone: current.score.combo >= 12 ? "critical" : "major",
        color: current.score.combo >= 12 ? "#FFF0D0" : "#C5FBFF",
        intensity: current.score.flowLevel,
        sizePx: current.score.combo >= 12 ? 34 : 28,
        holdMs: 210,
      });
      services.audio.play(current.score.combo >= 16 ? "comboUpHigh" : "comboUp");
    }

    if (current.score.rank !== previous.score.rank) {
      this.spawnFeedbackText({
        text: `RANK ${current.score.rank}`,
        x: this.scale.width * 0.5,
        y: 106,
        channel: "top",
        tone: "critical",
        color: "#E7FDFF",
        intensity: current.score.flowLevel,
        sizePx: 40,
        holdMs: 280,
        driftYPx: 56,
        depth: 39,
      });
      this.emitFeedbackRing(1.68, 0xe8fdff, 0.34, 190);
      services.audio.play("rankUp");
    }

    if (current.power.fireballMsRemaining > previous.power.fireballMsRemaining) {
      this.spawnFeedbackText({
        text: "FIREBALL",
        x: this.scale.width * 0.5,
        y: 136,
        channel: "top",
        tone: "critical",
        color: "#FFC68F",
        intensity: 1,
        sizePx: 46,
        holdMs: 320,
        driftYPx: 68,
        depth: 40,
      });
      this.emitSoftPulse(0.075, 170, 0xffb97d);
      this.emitFeedbackRing(1.74, 0xffbc84, 0.4, 220);
      this.emitSparkBurst(playerX, playerY - 8, 0xffb27d, 16, 1.08);
      services.audio.play("fireballIgnite");
      this.cameras.main.shake(66, 0.00195, true);
    }

    if (current.power.missileMsRemaining > previous.power.missileMsRemaining) {
      this.spawnFeedbackText({
        text: "MISSILE BURST",
        x: this.scale.width * 0.5,
        y: 138,
        channel: "top",
        tone: "critical",
        color: "#FFD8B0",
        intensity: 1,
        sizePx: 42,
        holdMs: 280,
        driftYPx: 58,
        depth: 40,
      });
      this.emitFeedbackRing(1.64, 0xffca95, 0.35, 180);
      this.emitSparkBurst(playerX, playerY - 10, 0xffc793, 12, 0.92);
      services.audio.play("missilePickup");
    }

    if (current.power.ghostMsRemaining > previous.power.ghostMsRemaining) {
      this.spawnFeedbackText({
        text: "GHOST CORE",
        x: this.scale.width * 0.5,
        y: 138,
        channel: "top",
        tone: "major",
        color: "#CCF4FF",
        intensity: 1,
        sizePx: 40,
        holdMs: 260,
        driftYPx: 56,
        depth: 40,
      });
      this.emitFeedbackRing(1.58, 0xb8efff, 0.34, 170);
      this.emitSoftPulse(0.038, 132, 0xa2ecff);
      services.audio.play("ghostPickup");
    }

    this.lastCombo = current.score.combo;
  }

  private handleBonusCollected(event: BonusCollectEvent, flowLevel: number): void {
    const services = resolveSceneServices();
    const x = this.normalizedXToScreen(event.x);
    const y = this.logicalToScreenY(event.y);

    if (event.kind === "shard") {
      this.spawnFeedbackText({
        text: `+${event.value}`,
        x,
        y: y - 8,
        channel: "pickup",
        tone: "minor",
        color: "#97EEFF",
        intensity: flowLevel,
      });
      this.emitSparkBurst(x, y, 0x93ecff, 4, 0.34);
      services.audio.play("shardPickup");
      return;
    }

    if (event.kind === "score_burst") {
      this.spawnFeedbackText({
        text: `BURST +${event.value}`,
        x,
        y: y - 10,
        channel: "pickup",
        tone: "major",
        color: "#D6FCFF",
        intensity: flowLevel,
        sizePx: 30,
      });
      this.emitSparkBurst(x, y, 0xd6fcff, 8, 0.56);
      services.audio.play("scoreBurstPickup");
      return;
    }

    if (event.kind === "fireball") {
      this.spawnFeedbackText({
        text: "FIRE +",
        x,
        y: y - 12,
        channel: "pickup",
        tone: "major",
        color: "#FFCB94",
        intensity: 1,
        sizePx: 32,
      });
      this.emitSparkBurst(x, y, 0xffbe84, 8, 0.66);
      services.audio.play("fireballPickup");
      return;
    }

    if (event.kind === "missile_burst") {
      this.spawnFeedbackText({
        text: "MISSILE +",
        x,
        y: y - 12,
        channel: "pickup",
        tone: "major",
        color: "#FFD7AF",
        intensity: 1,
        sizePx: 32,
      });
      this.emitSparkBurst(x, y, 0xffc793, 9, 0.7);
      services.audio.play("missilePickup");
      return;
    }

    if (event.kind === "ghost_core") {
      this.spawnFeedbackText({
        text: "GHOST +",
        x,
        y: y - 12,
        channel: "pickup",
        tone: "major",
        color: "#C7F5FF",
        intensity: 1,
        sizePx: 32,
      });
      this.emitSparkBurst(x, y, 0xc2f4ff, 8, 0.62);
      services.audio.play("ghostPickup");
      return;
    }

    if (event.kind === "shield") {
      this.spawnFeedbackText({
        text: "SHIELD +",
        x,
        y: y - 10,
        channel: "pickup",
        tone: "standard",
        color: "#B7F4FF",
        intensity: flowLevel,
        sizePx: 26,
      });
      this.emitSparkBurst(x, y, 0xaef3ff, 6, 0.44);
      services.audio.play("shieldPickup");
      return;
    }

    this.spawnFeedbackText({
      text: "MAGNET",
      x,
      y: y - 10,
      channel: "pickup",
      tone: "standard",
      color: "#BCF8FF",
      intensity: flowLevel,
      sizePx: 26,
    });
    this.emitSparkBurst(x, y, 0xc5f9ff, 6, 0.44);
    services.audio.play("magnetPickup");
  }

  private spawnFeedbackText(options: {
    text: string;
    x: number;
    y: number;
    channel: "combo" | "event" | "pickup" | "impact" | "top";
    tone: "minor" | "standard" | "major" | "critical";
    color: string;
    intensity?: number;
    sizePx?: number;
    holdMs?: number;
    driftYPx?: number;
    depth?: number;
  }): void {
    const request: {
      text: string;
      x: number;
      y: number;
      channel: "combo" | "event" | "pickup" | "impact" | "top";
      tone: "minor" | "standard" | "major" | "critical";
      color: string;
      intensity?: number;
      sizePx?: number;
      holdMs?: number;
      driftYPx?: number;
      depth?: number;
    } = {
      text: options.text,
      x: options.x,
      y: options.y,
      channel: options.channel,
      tone: options.tone,
      color: options.color,
    };

    if (options.intensity !== undefined) {
      request.intensity = options.intensity;
    }

    if (options.sizePx !== undefined) {
      request.sizePx = options.sizePx;
    }

    if (options.holdMs !== undefined) {
      request.holdMs = options.holdMs;
    }

    if (options.driftYPx !== undefined) {
      request.driftYPx = options.driftYPx;
    }

    if (options.depth !== undefined) {
      request.depth = options.depth;
    }

    this.floatingTextFx?.show(request);
  }

  private emitSparkBurst(x: number, y: number, color: number, count: number, spread: number): void {
    const particles = Math.max(1, Math.min(14, count));

    for (let index = 0; index < particles; index += 1) {
      const angle = (Math.PI * 2 * index) / particles + Math.random() * 0.4;
      const speed = 14 + Math.random() * 26 * spread;
      const lifeMs = 180 + Math.random() * 160;
      const spark = this.add
        .circle(x, y, 1.8 + Math.random() * 1.8, color, 0.95)
        .setDepth(33)
        .setAlpha(0.85);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: lifeMs,
        ease: "Sine.Out",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private emitMissileTrace(fromX: number, fromY: number, toX: number, toY: number): void {
    const trace = this.add
      .line(0, 0, fromX, fromY, toX, toY, 0xffd1a3, 0.82)
      .setOrigin(0)
      .setDepth(34)
      .setLineWidth(1.2, 0.2)
      .setAlpha(0.92);

    this.tweens.add({
      targets: trace,
      alpha: 0,
      duration: 94,
      ease: "Sine.Out",
      onComplete: () => trace.destroy(),
    });

    const impactRing = this.add
      .circle(toX, toY, 9, 0xffd8b8, 0)
      .setDepth(34)
      .setStrokeStyle(1.6, 0xffd2a6, 0.74)
      .setAlpha(0.72);

    this.tweens.add({
      targets: impactRing,
      scaleX: 1.55,
      scaleY: 1.55,
      alpha: 0,
      duration: 126,
      ease: "Sine.Out",
      onComplete: () => impactRing.destroy(),
    });
  }
  private emitDirectionalSpeedParticles(snapshot: RunSnapshot, deltaMs: number): void {
    const speedRatio = clamp(snapshot.difficulty.scrollSpeed / GAMEPLAY_TUNING.difficulty.maxScrollSpeed, 0, 1);
    const pressureBoost = clamp(this.runPressure / 1.1, 0, 1) * 0.84;
    const heatBias = this.runHeatState === "rush" ? 0.22 : this.runHeatState === "heat" ? 0.1 : 0;
    const intensity = clamp(
      speedRatio * 0.62 + snapshot.score.flowLevel * 0.68 + this.sensoryBoost * 0.25 + pressureBoost + heatBias,
      0,
      2.4,
    );
    if (intensity < 0.55) {
      return;
    }

    const now = this.time.now;
    const intervalMs = Math.max(40, 106 - intensity * 34 - Math.min(18, deltaMs * 0.08));
    if (now - this.lastSpeedParticleAtMs < intervalMs) {
      return;
    }
    this.lastSpeedParticleAtMs = now;

    const baseX = this.normalizedXToScreen(snapshot.player.x);
    const baseY = this.playerGroundScreenY() - snapshot.player.y;
    const side = Math.random() < 0.5 ? -1 : 1;
    const color = snapshot.power.fireballMsRemaining > 0 ? 0xffb783 : this.blendColor(GAMEPLAY_TUNING.accentSoftColor, 0xffc995, pressureBoost * 0.72 + heatBias * 0.8);

    const streak = this.add
      .rectangle(
        baseX + side * (GAMEPLAY_TUNING.layout.playerRadiusPx * (1.8 + Math.random() * 1.6)),
        baseY + Phaser.Math.Between(-14, 14),
        1.2 + intensity * 0.9,
        20 + intensity * 30,
        color,
        0.22 + intensity * 0.1,
      )
      .setDepth(14)
      .setAngle(side * (6 + intensity * 10));

    this.tweens.add({
      targets: streak,
      y: streak.y - (70 + intensity * 68),
      x: streak.x + side * (7 + intensity * 9),
      alpha: 0,
      scaleY: 0.2,
      duration: 220 + intensity * 90,
      ease: "Cubic.Out",
      onComplete: () => streak.destroy(),
    });
  }
  private resolveObstacleImpactPoints(
    obstacles: readonly ObstacleState[],
    obstacleIds: readonly number[],
    fallbackX: number,
  ): FeedbackPoint[] {
    if (obstacleIds.length === 0) {
      return [];
    }

    const byId = new Map<number, ObstacleState>();
    for (const obstacle of obstacles) {
      byId.set(obstacle.id, obstacle);
    }

    const points: FeedbackPoint[] = [];
    for (const obstacleId of obstacleIds) {
      const obstacle = byId.get(obstacleId);
      if (!obstacle) {
        points.push({
          x: this.normalizedXToScreen(fallbackX),
          y: this.playerGroundScreenY() - 14,
        });
        continue;
      }

      const impactX = obstacle.kind === "breakable_wall" || obstacle.kind === "low_wall"
        ? this.normalizedXToScreen(fallbackX)
        : this.normalizedXToScreen(obstacle.gapCenterX);

      points.push({
        x: impactX,
        y: this.logicalToScreenY(obstacle.y),
      });
    }

    return points;
  }

  private handleStateAudio(previous: RunSnapshot, current: RunSnapshot, justLanded: boolean): void {
    const services = resolveSceneServices();

    if (justLanded) {
      services.audio.play("landing");
      this.emitSparkBurst(
        this.normalizedXToScreen(current.player.x),
        this.playerGroundScreenY(),
        0x8de9ff,
        4,
        0.3,
      );
    }

    if (current.power.fireballMsRemaining > 0) {
      if (current.elapsedMs - this.lastFireballPulseAtMs >= 330) {
        services.audio.play("fireballActive");
        this.lastFireballPulseAtMs = current.elapsedMs;
      }
    } else if (previous.power.fireballMsRemaining > 0) {
      this.lastFireballPulseAtMs = current.elapsedMs;
    }

    if (current.power.ghostMsRemaining > 0) {
      if (current.elapsedMs - this.lastGhostPulseAtMs >= 360) {
        services.audio.play("ghostPulse");
        this.lastGhostPulseAtMs = current.elapsedMs;
      }
    } else if (previous.power.ghostMsRemaining > 0) {
      this.lastGhostPulseAtMs = current.elapsedMs;
    }

    if (current.power.magnetMsRemaining > 0) {
      if (current.elapsedMs - this.lastMagnetTickAtMs >= 540) {
        services.audio.play("magnetTick");
        this.lastMagnetTickAtMs = current.elapsedMs;
      }
    } else if (previous.power.magnetMsRemaining > 0) {
      this.lastMagnetTickAtMs = current.elapsedMs;
    }
  }

  private triggerHitStop(durationMs: number, timeScale: number): void {
    if (this.hitStopTimer) {
      this.hitStopTimer.remove(false);
    }

    this.time.timeScale = clamp(timeScale, 0.24, 1);
    this.hitStopTimer = this.time.delayedCall(durationMs, () => {
      this.time.timeScale = 1;
      this.hitStopTimer = null;
    });
  }

  private handleFailure(
    snapshot: RunSnapshot,
    deathCause: RunDeathCause,
    deathObstacleKind: RunDeathObstacleKind,
  ): void {
    const services = resolveSceneServices();

    services.systems.fx.playFailureFx(this.cameras.main);
    services.audio.play("endRun");
    services.audio.setTensionLevel(0.12);
    services.audio.setBedState("failed");
    this.runPressure = Math.max(0.24, this.runPressure * 0.66);
    this.triggerHitStop(58, 0.56);

    services.highscoreRepository.saveBestScore(snapshot.score.best);
    services.runSaveRepository.save(snapshot);
    services.runStatsRepository.append({
      timestamp: Date.now(),
      durationMs: Math.round(snapshot.elapsedMs),
      score: snapshot.score.current,
      bestScoreAtRunStart: this.runBestScoreAtStart,
      deathCause,
      deathXNormalized: Number(snapshot.player.x.toFixed(3)),
      deathPositionBucket: this.toPositionBucket(snapshot.player.x),
      deathDifficultyLevel: snapshot.difficulty.level,
      deathScrollSpeed: snapshot.difficulty.scrollSpeed,
      deathObstacleKind,
      retryImmediate: false,
      phaseUsedCount: 0,
      phaseHitSavesCount: 0,
      phasePerfectCount: 0,
      phaseWasteCount: 0,
      firstPhaseUseAtMs: null,
      scoreFromPhase: 0,
      diedWithinMsAfterPhase: null,
      deathWhilePhaseActive: false,
      deathJustAfterPhase: false,
      phaseAvailableButUnused: false,
      jumpCount: snapshot.player.jumpCount,
      bonusCollectedCount: this.collectedBonusCount,
      fireballPickupCount: snapshot.power.fireballPickupCount,
      fireballBreakCount: snapshot.power.fireballBreakCount + snapshot.power.missileBreakCount,
      shardCount: snapshot.score.shardCount,
      comboPeak: snapshot.score.comboPeak,
    });

    services.events.emit("run:failed", snapshot);

    const deathX = this.normalizedXToScreen(snapshot.player.x);
    const deathY = this.playerGroundScreenY() - snapshot.player.y;

    this.emitFeedbackRing(1.9, 0xd8fbff, 0.5, GAMEPLAY_TUNING.failureTransitionDelayMs + 96);
    this.emitSoftPulse(0.075, 220, 0xd2fbff);
    this.emitSparkBurst(deathX, deathY, 0xd6f8ff, 10, 0.74);
    this.spawnFeedbackText({
      text: "BREACH",
      x: this.scale.width * 0.5,
      y: this.scale.height * 0.34,
      channel: "top",
      tone: "critical",
      color: "#EAFDFF",
      intensity: 1,
      sizePx: 40,
      holdMs: 280,
      driftYPx: 52,
      depth: 40,
    });
  }

  private updateTrail(
    targetX: number,
    targetY: number,
    flowValue: number,
    velocityX: number,
    fireballIntensity: number,
    runPressure: number,
  ): void {
    let currentTargetX = targetX;
    let currentTargetY = targetY;
    const flow = clamp(flowValue, 0, 2.4);
    const velocityRatio = clamp(velocityX / GAMEPLAY_TUNING.input.maxVelocityForEffects, -1, 1);
    const speedEnergy = Math.abs(velocityRatio);
    const trailEnergy = clamp(flow * 0.5 + speedEnergy * 0.72 + fireballIntensity * 0.88 + runPressure * 0.44, 0, 2.6);
    const velocityLagBase = -velocityRatio * GAMEPLAY_TUNING.motion.trailVelocityOffsetPx * (1 + trailEnergy * 0.2);

    for (let index = 0; index < this.trailDots.length; index += 1) {
      const trailDot = this.trailDots[index];
      if (!trailDot) {
        continue;
      }

      const lagFactor = 0.22 + index * 0.17 + trailEnergy * 0.03;
      const desiredX = currentTargetX + velocityLagBase * lagFactor;
      const desiredY = currentTargetY + (2 + index * 2.4 + trailEnergy * 1.5);

      trailDot.x += (desiredX - trailDot.x) * GAMEPLAY_TUNING.motion.trailLerp;
      trailDot.y += (desiredY - trailDot.y) * GAMEPLAY_TUNING.motion.trailLerp;
      trailDot.setAlpha(
        Math.max(0.05, 0.23 - index * 0.028) +
          flow * 0.07 +
          fireballIntensity * 0.1 +
          speedEnergy * 0.07,
      );
      trailDot.setScale(1 + flow * 0.24 + fireballIntensity * 0.2 + speedEnergy * 0.1);

      if (fireballIntensity > 0.01) {
        trailDot.setFillStyle(0xffa96f, 1);
      } else {
        trailDot.setFillStyle(trailEnergy > 1.2 ? GAMEPLAY_TUNING.accentSoftColor : GAMEPLAY_TUNING.accentColor, 1);
      }

      currentTargetX = trailDot.x;
      currentTargetY = trailDot.y;
    }
  }

  private resetTrail(): void {
    if (!this.playerOrb) {
      return;
    }

    for (const trailDot of this.trailDots) {
      trailDot.setPosition(this.playerOrb.x, this.playerOrb.y);
      trailDot.setScale(1);
    }
  }

  private fireballIntensity(snapshot: RunSnapshot): number {
    return clamp(snapshot.power.fireballMsRemaining / GAMEPLAY_TUNING.power.fireballDurationMs, 0, 1);
  }

  private missileIntensity(snapshot: RunSnapshot): number {
    return clamp(snapshot.power.missileMsRemaining / GAMEPLAY_TUNING.power.missileDurationMs, 0, 1);
  }

  private ghostIntensity(snapshot: RunSnapshot): number {
    return clamp(snapshot.power.ghostMsRemaining / GAMEPLAY_TUNING.power.ghostDurationMs, 0, 1);
  }

  private playMovementPulse(scaleBoost = 1): void {
    if (!this.playerOrb) {
      return;
    }

    this.tweens.killTweensOf(this.playerOrb);
    this.playerOrb.setScale(1);
    this.tweens.add({
      targets: this.playerOrb,
      scaleX: GAMEPLAY_TUNING.motion.playerPulseScale * scaleBoost,
      scaleY: GAMEPLAY_TUNING.motion.playerPulseScale * scaleBoost,
      duration: GAMEPLAY_TUNING.motion.playerPulseDurationMs,
      yoyo: true,
      ease: "Sine.Out",
    });
  }

  private emitFeedbackRing(scaleTo: number, color: number, alpha: number, durationMs: number): void {
    if (!this.feedbackRing) {
      return;
    }

    this.tweens.killTweensOf(this.feedbackRing);
    this.feedbackRing.setStrokeStyle(2, color, alpha);
    this.feedbackRing.setScale(1);
    this.feedbackRing.setAlpha(alpha);

    this.tweens.add({
      targets: this.feedbackRing,
      scaleX: scaleTo,
      scaleY: scaleTo,
      alpha: 0,
      duration: durationMs,
      ease: "Sine.Out",
    });
  }

  private emitSoftPulse(alpha: number, durationMs: number, color: number): void {
    if (!this.comfortPulse) {
      return;
    }

    this.tweens.killTweensOf(this.comfortPulse);
    this.comfortPulse.setFillStyle(color, 1);
    this.comfortPulse.setAlpha(Math.max(0, alpha));

    this.tweens.add({
      targets: this.comfortPulse,
      alpha: 0,
      duration: durationMs,
      ease: "Sine.Out",
    });
  }

  private resolveRunFusion(snapshot: RunSnapshot, fireballIntensity: number): { pressure: number; state: RunHeatState } {
    const fusion = createRunStateFusion(snapshot, fireballIntensity);
    const speedPressure =
      clamp(snapshot.difficulty.scrollSpeed / GAMEPLAY_TUNING.difficulty.maxScrollSpeed, 0, 1) * 0.42;
    const pressure = clamp(fusion.pressure + speedPressure + this.sensoryBoost * 0.12, 0, 1.6);

    return {
      pressure,
      state: resolveRunHeatState(pressure),
    };
  }

  private blendColor(from: number, to: number, factor: number): number {
    const t = clamp(factor, 0, 1);
    const source = Phaser.Display.Color.ValueToColor(from);
    const target = Phaser.Display.Color.ValueToColor(to);
    const blended = Phaser.Display.Color.Interpolate.ColorWithColor(source, target, 100, Math.round(t * 100));
    return Phaser.Display.Color.GetColor(blended.r, blended.g, blended.b);
  }
  private obstacleColor(
    kind: ObstacleKind,
    fireballIntensity: number,
    heatState: RunHeatState,
    heatPressure: number,
    powerIntensity: number,
  ): number {
    const warmBlend = heatState === "rush" ? 0.78 : heatState === "heat" ? 0.46 : 0.2;

    if (kind === "breakable_wall") {
      const base = fireballIntensity > 0.1 ? 0xff9f62 : 0xffa66f;
      return this.blendColor(base, 0xff8550, warmBlend * 0.84 + heatPressure * 0.24 + powerIntensity * 0.1);
    }

    if (kind === "low_wall") {
      return this.blendColor(0x6fdfff, 0xffb97d, warmBlend * 0.56 + heatPressure * 0.14 + powerIntensity * 0.08);
    }

    if (kind === "tight_gate") {
      return this.blendColor(0x79f1ff, 0xffb374, warmBlend * 0.64 + heatPressure * 0.18 + powerIntensity * 0.08);
    }

    return this.blendColor(0x5fd3f2, 0xffa96f, warmBlend * 0.62 + heatPressure * 0.2 + powerIntensity * 0.08);
  }

  private bonusColor(kind: BonusKind): { core: number; ring: number; alpha: number } {
    if (kind === "fireball") {
      return { core: 0xff9d5a, ring: 0xffc089, alpha: 0.95 };
    }

    if (kind === "missile_burst") {
      return { core: 0xffb06f, ring: 0xffd3ab, alpha: 0.95 };
    }

    if (kind === "ghost_core") {
      return { core: 0xc9f4ff, ring: 0xe7fcff, alpha: 0.93 };
    }

    if (kind === "score_burst") {
      return { core: 0xd6fbff, ring: 0xeafdff, alpha: 0.92 };
    }

    if (kind === "shield") {
      return { core: 0x9bf2ff, ring: 0xcff9ff, alpha: 0.9 };
    }

    if (kind === "magnet") {
      return { core: 0xb2f8ff, ring: 0xe0fcff, alpha: 0.9 };
    }

    return { core: 0x76ebff, ring: 0xaef5ff, alpha: 0.86 };
  }

  private corridorWidth(): number {
    return Math.max(
      GAMEPLAY_TUNING.layout.corridorMinWidthPx,
      Math.min(GAMEPLAY_TUNING.layout.corridorMaxWidthPx, this.scale.width * GAMEPLAY_TUNING.layout.corridorWidthRatio),
    );
  }

  private corridorHalfWidth(): number {
    return this.corridorWidth() * 0.5;
  }

  private corridorCenterX(): number {
    return this.scale.width * 0.5;
  }

  private normalizedXToScreen(normalizedX: number): number {
    return this.corridorCenterX() + normalizedX * this.corridorHalfWidth();
  }

  private pointerToNormalizedX(screenX: number): number {
    return clamp((screenX - this.corridorCenterX()) / this.corridorHalfWidth(), -1, 1);
  }

  private playerGroundScreenY(): number {
    return this.scale.height - GAMEPLAY_TUNING.layout.playerBottomOffsetPx;
  }

  private logicalToScreenY(logicalY: number): number {
    return this.playerGroundScreenY() - logicalY;
  }

  private toPositionBucket(x: number): DeathPositionBucket {
    if (x < -0.33) {
      return "left";
    }
    if (x > 0.33) {
      return "right";
    }
    return "center";
  }
}





























