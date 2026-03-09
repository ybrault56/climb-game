
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
  private lastMagnetTickAtMs = 0;
  private lastSpeedParticleAtMs = 0;
  private hitStopTimer: Phaser.Time.TimerEvent | null = null;

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

      this.playerOrb?.destroy();
      this.playerCore?.destroy();
      this.playerSpecular?.destroy();
      this.playerRim?.destroy();
      this.playerHalo?.destroy();
      this.fireAura?.destroy();
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
      this.renderBackground(
        current.difficulty.scrollSpeed,
        current.player,
        current.score.flowLevel,
        fireballIntensity,
        step.deltaMs,
      );
      this.renderRun(current, fireballIntensity);
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

    const collisionCheck = services.systems.obstacles.checkCollisions(
      player,
      advancedObstacles,
      services.systems.bonus.isFireballActive(bonusFrame.power),
    );

    const brokenObstacleImpacts = this.resolveObstacleImpactPoints(
      advancedObstacles,
      collisionCheck.brokenObstacleIds,
      player.x,
    );

    const obstaclesAfterBreak = services.systems.obstacles.excludeByIds(
      advancedObstacles,
      collisionCheck.brokenObstacleIds,
    );

    let power = bonusFrame.power;
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
      brokenWalls: collisionCheck.brokenObstacleIds.length,
      jumpClears: collisionCheck.jumpClearObstacleIds.length,
    });

    const fireballRatio = clamp(
      power.fireballMsRemaining / GAMEPLAY_TUNING.power.fireballDurationMs,
      0,
      1,
    );
    const tensionLevel = clamp(
      0.16 +
        (difficulty.level / GAMEPLAY_TUNING.difficulty.maxLevel) * 0.44 +
        score.flowLevel * 0.28 +
        fireballRatio * 0.14,
      0.12,
      1,
    );
    services.audio.setTensionLevel(tensionLevel);

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
      brokenObstacleImpacts,
    );
    this.handleStateAudio(current, committed, justLanded);

    const nextFireballIntensity = this.fireballIntensity(committed);
    this.renderBackground(
      committed.difficulty.scrollSpeed,
      committed.player,
      committed.score.flowLevel,
      nextFireballIntensity,
      step.deltaMs,
    );
    this.renderRun(committed, nextFireballIntensity);

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
    this.lastMagnetTickAtMs = 0;
    this.lastSpeedParticleAtMs = 0;
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
    services.store.setState(initialSnapshot);
    services.events.emit("run:started", initialSnapshot);
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

    this.playerHalo = this.add.circle(x, y, radius * 3.3, GAMEPLAY_TUNING.accentColor, 0.16).setDepth(7);
    this.playerRim = this.add
      .circle(x, y, radius * 1.65, 0x8cf2ff, 0.2)
      .setDepth(8)
      .setStrokeStyle(1.8, 0xe8fdff, 0.42);
    this.playerOrb = this.add
      .circle(x, y, radius * 1.18, 0x35cde1, 0.95)
      .setDepth(9)
      .setStrokeStyle(2.6, GAMEPLAY_TUNING.accentSoftColor, 0.82);
    this.playerCore = this.add.circle(x, y, radius * 0.52, 0xebfdff, 0.98).setDepth(10);
    this.playerSpecular = this.add.circle(x - radius * 0.32, y - radius * 0.34, radius * 0.23, 0xffffff, 0.78).setDepth(11);
    this.fireAura = this.add
      .circle(x, y, radius * 2.4, 0xff8d4a, 0.22)
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
  ): void {
    this.backgroundOffsetY += (scrollSpeed * deltaMs) / 1000;

    const centerX = this.corridorCenterX();
    const nearY = this.scale.height + 20;
    const vanishingY = this.scale.height * 0.13;
    const farHalf = this.corridorHalfWidth() * 0.26;
    const nearHalf = this.corridorHalfWidth() * 1.02;

    const speedRatio = clamp(scrollSpeed / GAMEPLAY_TUNING.difficulty.maxScrollSpeed, 0, 1);
    const runIntensity = clamp(
      speedRatio * 0.72 + flowLevel * 0.58 + fireballIntensity * 0.46 + this.sensoryBoost * 0.24,
      0,
      2,
    );

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
        1.2 + flowLine.depth * 2 + runIntensity * 0.45,
        18 + perspective * 44 + runIntensity * 14,
      );
      flowLine.line.setAlpha(
        0.045 + flowLine.speedFactor * (0.042 + flowLevel * 0.056 + fireballIntensity * 0.08 + runIntensity * 0.02),
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
        sideStreak.side * (sideStreak.baseOffset + perspective * 24 + runIntensity * 8) +
        player.x * (8 + perspective * 6);
      sideStreak.line.setPosition(x, y);
      sideStreak.line.setDisplaySize(1 + runIntensity * 0.8, 14 + perspective * 42 + runIntensity * 16);
      sideStreak.line.setAlpha(0.018 + runIntensity * 0.055 + fireballIntensity * 0.05);
    }

    const targetDrift =
      player.x * GAMEPLAY_TUNING.motion.cameraDriftPx +
      player.velocityX * GAMEPLAY_TUNING.motion.cameraVelocityInfluence * (1 + runIntensity * 0.2);
    this.cameraDriftX += (targetDrift - this.cameraDriftX) * GAMEPLAY_TUNING.motion.cameraDriftLerp;
    this.cameras.main.setScroll(this.cameraDriftX, -player.y * 0.06);

    const velocityRatio = clamp(player.velocityX / GAMEPLAY_TUNING.input.maxVelocityForEffects, -1, 1);
    const targetTilt =
      -velocityRatio *
      (GAMEPLAY_TUNING.motion.cameraTiltMaxRad + fireballIntensity * 0.003 + runIntensity * 0.0022);
    this.cameraTilt += (targetTilt - this.cameraTilt) * GAMEPLAY_TUNING.motion.cameraTiltLerp;
    this.cameras.main.setRotation(this.cameraTilt);

    const targetZoom =
      GAMEPLAY_TUNING.motion.baseZoom +
      speedRatio * GAMEPLAY_TUNING.motion.speedZoomMax +
      flowLevel * GAMEPLAY_TUNING.motion.flowZoomMax +
      fireballIntensity * 0.02 +
      this.sensoryBoost * 0.006 +
      runIntensity * 0.012;
    const zoom = this.cameras.main.zoom + (targetZoom - this.cameras.main.zoom) * GAMEPLAY_TUNING.motion.zoomLerp;
    this.cameras.main.setZoom(zoom);
  }

  private renderRun(snapshot: RunSnapshot, fireballIntensity: number): void {
    const x = this.normalizedXToScreen(snapshot.player.x);
    const y = this.playerGroundScreenY() - snapshot.player.y;
    const pressure = clamp(snapshot.score.current / 4200, 0, 1);

    if (this.playerHalo) {
      this.playerHalo.setPosition(x, y);
      this.playerHalo.setScale(1 + snapshot.score.flowLevel * 0.1 + fireballIntensity * 0.2 + pressure * 0.08);
      this.playerHalo.setAlpha(0.14 + snapshot.score.flowLevel * 0.13 + fireballIntensity * 0.2 + this.sensoryBoost * 0.05 + pressure * 0.06);
    }

    if (this.playerRim) {
      this.playerRim.setPosition(x, y);
      this.playerRim.setScale(0.96 + snapshot.score.flowLevel * 0.08 + fireballIntensity * 0.14);
      this.playerRim.setFillStyle(fireballIntensity > 0 ? 0xffb07a : 0x8cf2ff, 0.2 + fireballIntensity * 0.18 + pressure * 0.07);
    }

    if (this.playerOrb) {
      this.playerOrb.setPosition(x, y);
      this.playerOrb.setFillStyle(fireballIntensity > 0 ? 0xff8a45 : 0x37cbdd, 0.93 + snapshot.score.flowLevel * 0.1 + fireballIntensity * 0.12 + pressure * 0.05);
    }

    if (this.playerCore) {
      this.playerCore.setPosition(x, y);
      this.playerCore.setAlpha(0.84 + snapshot.score.flowLevel * 0.12 + fireballIntensity * 0.1 + pressure * 0.04);
    }

    if (this.playerSpecular) {
      this.playerSpecular.setPosition(x - GAMEPLAY_TUNING.layout.playerRadiusPx * 0.32, y - GAMEPLAY_TUNING.layout.playerRadiusPx * 0.34);
      this.playerSpecular.setAlpha(0.64 + snapshot.score.flowLevel * 0.12 + fireballIntensity * 0.1);
      this.playerSpecular.setScale(1 + pressure * 0.14 + Math.sin(snapshot.elapsedMs * 0.018) * 0.04);
    }

    if (this.fireAura) {
      this.fireAura.setPosition(x, y);
      this.fireAura.setScale(1 + fireballIntensity * 0.24 + Math.sin(snapshot.elapsedMs * 0.02) * 0.06 + pressure * 0.06);
      this.fireAura.setAlpha(fireballIntensity * 0.54 + pressure * 0.04);
    }

    if (this.feedbackRing) {
      this.feedbackRing.setPosition(x, y);
    }

    this.updateTrail(x, y, snapshot.score.flowLevel + this.sensoryBoost + pressure * 0.2, snapshot.player.velocityX, fireballIntensity);
    this.drawObstacles(snapshot.obstacles, fireballIntensity);
    this.drawBonuses(snapshot.bonuses, fireballIntensity);
  }

  private drawObstacles(obstacles: readonly RunSnapshot["obstacles"][number][], fireballIntensity: number): void {
    if (!this.obstacleGraphics) {
      return;
    }

    const g = this.obstacleGraphics;
    g.clear();

    const centerX = this.corridorCenterX();
    const halfWidth = this.corridorHalfWidth();
    const leftBoundary = centerX - halfWidth;
    const rightBoundary = centerX + halfWidth;

    for (const obstacle of obstacles) {
      const y = this.logicalToScreenY(obstacle.y);
      const proximity = clamp(1 - obstacle.y / GAMEPLAY_TUNING.spawn.obstacleSpawnY, 0, 1);
      const baseColor = this.obstacleColor(obstacle.kind, fireballIntensity);

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
            fireballIntensity,
            obstacle.signature,
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
            fireballIntensity,
            obstacle.signature,
          );
        }

        if (obstacle.kind === "tight_gate") {
          g.lineStyle(2, 0xe5fdff, 0.44 + proximity * 0.22);
          g.beginPath();
          g.moveTo(gapCenterPx - gapHalfPx + 3, y - obstacle.thicknessPx * 0.5);
          g.lineTo(gapCenterPx - gapHalfPx - 7, y + obstacle.thicknessPx * 0.5);
          g.moveTo(gapCenterPx + gapHalfPx - 3, y - obstacle.thicknessPx * 0.5);
          g.lineTo(gapCenterPx + gapHalfPx + 7, y + obstacle.thicknessPx * 0.5);
          g.strokePath();
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
        fireballIntensity,
        obstacle.signature,
      );

      if (obstacle.kind === "low_wall") {
        g.lineStyle(2, 0xe3fcff, 0.26 + proximity * 0.22);
        const step = Math.max(18, halfWidth * 0.26);
        for (let markerX = leftBoundary + 10; markerX < rightBoundary - 12; markerX += step) {
          g.beginPath();
          g.moveTo(markerX, bodyY + bodyHeight * 0.28);
          g.lineTo(markerX + 8, bodyY - bodyHeight * 0.1);
          g.lineTo(markerX + 16, bodyY + bodyHeight * 0.28);
          g.strokePath();
        }
      }

      if (obstacle.kind === "breakable_wall") {
        g.lineStyle(2, 0xffd8b4, 0.4 + proximity * 0.24);
        const seam = 10 + Math.sin((obstacle.y + obstacle.id * 17) * 0.04) * 4;
        g.beginPath();
        g.moveTo(centerX - seam, bodyY - bodyHeight * 0.18);
        g.lineTo(centerX + seam, bodyY + bodyHeight * 0.18);
        g.moveTo(centerX - seam * 0.9, bodyY + bodyHeight * 0.2);
        g.lineTo(centerX + seam * 0.9, bodyY - bodyHeight * 0.24);
        g.strokePath();
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
    fireballIntensity: number,
    signature: ObstacleState["signature"],
  ): void {
    const top = centerY - height * 0.5;

    graphics.fillStyle(0x08111b, 0.46 + proximity * 0.2);
    graphics.fillRect(x, top + 2, width, height + 3);

    graphics.fillStyle(baseColor, 0.62 + proximity * 0.3 + fireballIntensity * 0.08);
    graphics.fillRect(x, top, width, height);

    graphics.fillStyle(0xf0fdff, 0.19 + proximity * 0.18 + fireballIntensity * 0.08);
    graphics.fillRect(x + 1, top + 1, Math.max(0, width - 2), Math.max(2, height * 0.18));

    graphics.fillStyle(0x0a1822, 0.46);
    graphics.fillRect(x + 1, top + height - Math.max(2, height * 0.14), Math.max(0, width - 2), Math.max(2, height * 0.14));

    if (signature === "needle_gate") {
      graphics.lineStyle(1.5, 0xdafaff, 0.36 + proximity * 0.2);
      graphics.strokeRect(x + 1, top + 1, Math.max(0, width - 2), Math.max(0, height - 2));
      return;
    }

    if (signature === "chevron_shutter") {
      graphics.lineStyle(1.7, 0xddfbff, 0.32 + proximity * 0.2);
      graphics.beginPath();
      graphics.moveTo(x + width * 0.36, centerY - 2);
      graphics.lineTo(x + width * 0.5, centerY + height * 0.22);
      graphics.lineTo(x + width * 0.64, centerY - 2);
      graphics.strokePath();
      return;
    }

    if (signature === "prism_clamp") {
      graphics.lineStyle(2, 0xffdfc3, 0.34 + proximity * 0.24);
      graphics.beginPath();
      graphics.moveTo(x + width * 0.42, centerY - height * 0.28);
      graphics.lineTo(x + width * 0.5, centerY + height * 0.12);
      graphics.lineTo(x + width * 0.58, centerY - height * 0.28);
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
    brokenWallImpacts: readonly FeedbackPoint[],
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

  private emitDirectionalSpeedParticles(snapshot: RunSnapshot, deltaMs: number): void {
    const speedRatio = clamp(snapshot.difficulty.scrollSpeed / GAMEPLAY_TUNING.difficulty.maxScrollSpeed, 0, 1);
    const intensity = clamp(speedRatio * 0.62 + snapshot.score.flowLevel * 0.74 + this.sensoryBoost * 0.25, 0, 2.2);
    if (intensity < 0.55) {
      return;
    }

    const now = this.time.now;
    const intervalMs = Math.max(48, 108 - intensity * 32 - Math.min(16, deltaMs * 0.08));
    if (now - this.lastSpeedParticleAtMs < intervalMs) {
      return;
    }
    this.lastSpeedParticleAtMs = now;

    const baseX = this.normalizedXToScreen(snapshot.player.x);
    const baseY = this.playerGroundScreenY() - snapshot.player.y;
    const side = Math.random() < 0.5 ? -1 : 1;
    const color = snapshot.power.fireballMsRemaining > 0 ? 0xffb783 : GAMEPLAY_TUNING.accentSoftColor;

    const streak = this.add
      .rectangle(
        baseX + side * (GAMEPLAY_TUNING.layout.playerRadiusPx * (1.8 + Math.random() * 1.6)),
        baseY + Phaser.Math.Between(-14, 14),
        1.2 + intensity * 0.9,
        18 + intensity * 26,
        color,
        0.2 + intensity * 0.09,
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
      fireballBreakCount: snapshot.power.fireballBreakCount,
      shardCount: snapshot.score.shardCount,
      comboPeak: snapshot.score.comboPeak,
    });

    services.events.emit("run:failed", snapshot);

    this.emitFeedbackRing(1.9, 0xd8fbff, 0.5, GAMEPLAY_TUNING.failureTransitionDelayMs + 64);
    this.emitSoftPulse(0.075, 180, 0xd2fbff);
  }

  private updateTrail(
    targetX: number,
    targetY: number,
    flowValue: number,
    velocityX: number,
    fireballIntensity: number,
  ): void {
    let currentTargetX = targetX;
    let currentTargetY = targetY;
    const flow = clamp(flowValue, 0, 2.4);
    const velocityRatio = clamp(velocityX / GAMEPLAY_TUNING.input.maxVelocityForEffects, -1, 1);
    const speedEnergy = Math.abs(velocityRatio);
    const trailEnergy = clamp(flow * 0.55 + speedEnergy * 0.75 + fireballIntensity * 0.9, 0, 2.4);
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

  private obstacleColor(kind: ObstacleKind, fireballIntensity: number): number {
    if (kind === "breakable_wall") {
      return fireballIntensity > 0.1 ? 0xffa15f : 0xffb786;
    }

    if (kind === "low_wall") {
      return 0x6fdfff;
    }

    if (kind === "tight_gate") {
      return 0x7ff5ff;
    }

    return 0x66d8f9;
  }

  private bonusColor(kind: BonusKind): { core: number; ring: number; alpha: number } {
    if (kind === "fireball") {
      return { core: 0xff9d5a, ring: 0xffc089, alpha: 0.95 };
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





































