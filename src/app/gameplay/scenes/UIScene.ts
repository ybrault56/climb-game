import Phaser from "phaser";
import { clamp } from "../../core/math/clamp";
import { buildHudViewModel } from "../../ui/hud/HudViewModel";
import { resolveSceneServices } from "../contracts/SceneSystemContract";
import { createRunStateFusion } from "../progression/RunStateFusion";
import { SCENE_KEYS } from "./sceneKeys";
import { GAMEPLAY_TUNING } from "../tuning";
import type { RunStatus } from "../types";

const HUD_FONT_STACK = '"Avenir Next", "SF Pro Display", "Segoe UI Variable", "Segoe UI", sans-serif';

export class UIScene extends Phaser.Scene {
  private unsubscribe: (() => void) | null = null;
  private retryAttempt = 0;

  constructor() {
    super(SCENE_KEYS.ui);
  }

  create(): void {
    const services = resolveSceneServices();
    const centerX = this.scale.width * 0.5;
    const centerY = this.scale.height * 0.5;

    const scorePlate = this.add
      .rectangle(this.scale.width - 18, 22, 118, 36, 0x071321, 0.4)
      .setOrigin(1, 0)
      .setDepth(29)
      .setAlpha(0.4);

    const scoreGlow = this.add
      .rectangle(this.scale.width - 18, 22, 118, 36, 0x79e9ff, 0.18)
      .setOrigin(1, 0)
      .setDepth(28)
      .setAlpha(0.08);

    const scoreText = this.add
      .text(this.scale.width - 18, 16, "", {
        fontFamily: HUD_FONT_STACK,
        fontSize: "32px",
        color: "#EAFDFF",
        fontStyle: "800",
      })
      .setOrigin(1, 0)
      .setAlpha(0.92)
      .setDepth(31)
      .setStroke("#04111d", 2)
      .setShadow(0, 2, "#01070E", 8, true, true);

    const bestText = this.add
      .text(this.scale.width - 18, 52, "", {
        fontFamily: HUD_FONT_STACK,
        fontSize: "12px",
        color: "#A8C4D0",
        fontStyle: "600",
      })
      .setOrigin(1, 0)
      .setAlpha(0.76)
      .setDepth(31)
      .setStroke("#05111D", 2);

    const comboText = this.add
      .text(14, 16, "", {
        fontFamily: HUD_FONT_STACK,
        fontSize: "18px",
        color: "#B5F7FF",
        fontStyle: "800",
      })
      .setOrigin(0, 0)
      .setAlpha(0.62)
      .setDepth(31)
      .setStroke("#04131f", 2)
      .setShadow(0, 2, "#020b13", 6, true, true);

    const rankText = this.add
      .text(14, 40, "", {
        fontFamily: HUD_FONT_STACK,
        fontSize: "12px",
        color: "#DDFBFF",
        fontStyle: "700",
      })
      .setOrigin(0, 0)
      .setAlpha(0.68)
      .setDepth(31)
      .setStroke("#04131f", 2);

    const powerText = this.add
      .text(centerX, 20, "", {
        fontFamily: HUD_FONT_STACK,
        fontSize: "12px",
        color: "#FFA77A",
        fontStyle: "800",
      })
      .setOrigin(0.5, 0)
      .setAlpha(0)
      .setDepth(32)
      .setStroke("#1b0d08", 2)
      .setShadow(0, 2, "#090402", 6, true, true);

    const powerBadge = this.add
      .rectangle(centerX, 18, 130, 20, 0x0b141f, 0.34)
      .setDepth(31)
      .setAlpha(0)
      .setOrigin(0.5, 0);

    const shieldPipA = this.add.circle(centerX + 52, 28, 3.8, 0xb7f4ff, 0).setDepth(33);
    const shieldPipB = this.add.circle(centerX + 62, 28, 3.8, 0xb7f4ff, 0).setDepth(33);

    const gaugeX = 7;
    const gaugeTop = 16;
    const gaugeHeight = Math.max(150, this.scale.height * 0.46);
    const gaugeBottom = gaugeTop + gaugeHeight;

    const pressureTrack = this.add
      .rectangle(gaugeX, gaugeTop, 6, gaugeHeight, 0x07131d, 0.56)
      .setOrigin(0, 0)
      .setDepth(29)
      .setAlpha(0.52);

    const pressureFill = this.add
      .rectangle(gaugeX + 1, gaugeBottom - 1, 4, 2, 0x79e9ff, 0.92)
      .setOrigin(0, 1)
      .setDepth(31)
      .setAlpha(0.9);

    const pressureGlow = this.add
      .rectangle(gaugeX - 1, gaugeBottom - 2, 8, 12, 0x8deeff, 0.18)
      .setOrigin(0, 0.5)
      .setDepth(30)
      .setAlpha(0.2);

    const pressureLabel = this.add
      .text(gaugeX + 10, gaugeTop - 2, "FLOW", {
        fontFamily: HUD_FONT_STACK,
        fontSize: "10px",
        color: "#9AD9E7",
        fontStyle: "700",
      })
      .setOrigin(0, 0)
      .setDepth(31)
      .setAlpha(0.74)
      .setStroke("#03101A", 2);

    const failureVeil = this.add
      .rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x050a12, 1)
      .setDepth(26)
      .setAlpha(0);

    const failScoreText = this.add
      .text(centerX, centerY - 8, "", {
        fontFamily: HUD_FONT_STACK,
        fontSize: "54px",
        color: "#F3FDFF",
        fontStyle: "800",
      })
      .setOrigin(0.5)
      .setDepth(33)
      .setAlpha(0)
      .setStroke("#03121e", 3)
      .setShadow(0, 3, "#01070E", 8, true, true);

    const retryRipple = this.add
      .circle(centerX, centerY - 8, 78, 0xc6f9ff, 0)
      .setDepth(32)
      .setStrokeStyle(2, 0xe8fdff, 0.5)
      .setScale(1)
      .setAlpha(0);

    const runHintText = this.add
      .text(centerX, this.scale.height - 56, "", {
        fontFamily: HUD_FONT_STACK,
        fontSize: "13px",
        color: "#A2BDCA",
        align: "center",
        fontStyle: "700",
      })
      .setDepth(33)
      .setOrigin(0.5)
      .setAlpha(0)
      .setStroke("#04111D", 2);

    const debugText = this.createDebugText();

    let scorePressure = 0;
    let lastScore = 0;
    let lastRank = services.store.getState().score.rank;
    let lastScorePulseAt = 0;
    let lastStatus: RunStatus = services.store.getState().status;
    let retryTransitionActive = false;

    const updateHud = () => {
      const snapshot = services.store.getState();
      const model = buildHudViewModel(snapshot);

      const now = this.time.now;
      const scoreDelta = Math.max(0, snapshot.score.current - lastScore);
      scorePressure = Math.max(0, scorePressure - 0.025);
      if (scoreDelta > 0) {
        scorePressure = Math.min(1.5, scorePressure + scoreDelta / 620 + snapshot.score.flowLevel * 0.08);
      }

      const fireballIntensity = clamp(
        snapshot.power.fireballMsRemaining / GAMEPLAY_TUNING.power.fireballDurationMs,
        0,
        1,
      );
      const fusion = createRunStateFusion(snapshot, fireballIntensity, scorePressure);
      const pressure = clamp(fusion.pressure + scorePressure * 0.22, 0, 1.65);
      const pressureNorm = clamp(pressure / 1.35, 0, 1);

      const scoreColor = this.lerpHexColor("#DDFBFF", "#FFD39B", pressureNorm * 0.84);
      const comboColor = this.lerpHexColor("#9EEFFF", "#FFF1CC", pressureNorm * 0.78);
      const gaugeColor = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x70e7ff),
        Phaser.Display.Color.ValueToColor(0xffb469),
        100,
        Math.round(pressureNorm * 100),
      );
      const gaugeColorValue = Phaser.Display.Color.GetColor(gaugeColor.r, gaugeColor.g, gaugeColor.b);

      scoreText.setText(model.scoreLabel);
      bestText.setText(model.bestLabel);
      scoreText.setX(this.scale.width - 18);
      bestText.setX(this.scale.width - 18);
      scorePlate.setX(this.scale.width - 18);
      scoreGlow.setX(this.scale.width - 18);

      const baseScoreScale = 1 + snapshot.score.flowLevel * 0.09 + pressureNorm * 0.06;
      scoreText.setColor(scoreColor);
      scoreText.setScale(baseScoreScale);
      scoreText.setAlpha(0.88 + pressureNorm * 0.1);
      scoreGlow.setFillStyle(pressureNorm > 0.7 ? 0xffbe7b : 0x79e9ff, 1);
      scoreGlow.setAlpha(0.08 + pressureNorm * 0.2);
      scorePlate.setAlpha(0.3 + pressureNorm * 0.09);

      if (scoreDelta >= 28 && now - lastScorePulseAt > 90) {
        lastScorePulseAt = now;
        this.tweens.killTweensOf(scoreText);
        this.tweens.add({
          targets: scoreText,
          scaleX: baseScoreScale + 0.08,
          scaleY: baseScoreScale + 0.08,
          duration: 90,
          yoyo: true,
          ease: "Sine.Out",
        });

        this.tweens.killTweensOf(scoreGlow);
        this.tweens.add({
          targets: scoreGlow,
          alpha: 0.2 + pressureNorm * 0.25,
          duration: 86,
          yoyo: true,
          ease: "Sine.Out",
        });
      }

      if (snapshot.score.combo > 1) {
        comboText.setText(`combo x${snapshot.score.combo}  x${snapshot.score.multiplier.toFixed(2)}`);
        comboText.setColor(comboColor);
        comboText.setScale(1 + pressureNorm * 0.12);
        comboText.setAlpha(0.74 + snapshot.score.flowLevel * 0.24);
      } else {
        comboText.setText("combo x1");
        comboText.setScale(1);
        comboText.setAlpha(0.28);
        comboText.setColor("#8ACEDF");
      }

      rankText.setText(`rank ${snapshot.score.rank}  shards ${snapshot.score.shardCount}`);
      rankText.setAlpha(0.58 + snapshot.score.flowLevel * 0.22 + pressureNorm * 0.08);

      if (snapshot.score.rank !== lastRank) {
        this.tweens.killTweensOf(rankText);
        this.tweens.add({
          targets: rankText,
          scaleX: 1.15,
          scaleY: 1.15,
          alpha: 1,
          duration: 110,
          yoyo: true,
          ease: "Back.Out",
        });

        this.tweens.killTweensOf(pressureGlow);
        this.tweens.add({
          targets: pressureGlow,
          alpha: 0.36,
          duration: 130,
          yoyo: true,
          ease: "Sine.Out",
        });
      }
      lastRank = snapshot.score.rank;

      const fillHeight = Math.max(2, pressureNorm * gaugeHeight);
      pressureFill.setDisplaySize(4, fillHeight);
      pressureFill.setY(gaugeBottom);
      pressureFill.setFillStyle(gaugeColorValue, 1);
      pressureFill.setAlpha(0.84 + pressureNorm * 0.12);

      pressureGlow.setY(gaugeBottom - fillHeight);
      pressureGlow.setFillStyle(gaugeColorValue, 1);
      pressureGlow.setAlpha(0.15 + pressureNorm * 0.3);
      pressureGlow.setDisplaySize(8 + pressureNorm * 4, 10 + pressureNorm * 12);
      pressureTrack.setAlpha(0.46 + pressureNorm * 0.22);

      if (fusion.state === "rush") {
        pressureLabel.setText("RUSH");
        pressureLabel.setColor("#FFD8AA");
        pressureLabel.setScale(1.05 + pressureNorm * 0.07);
      } else if (fusion.state === "heat") {
        pressureLabel.setText("HEAT");
        pressureLabel.setColor("#C9F8FF");
        pressureLabel.setScale(1.01 + pressureNorm * 0.03);
      } else {
        pressureLabel.setText("FLOW");
        pressureLabel.setColor("#9AD9E7");
        pressureLabel.setScale(1);
      }
      pressureLabel.setAlpha(0.7 + pressureNorm * 0.18);

      if (fireballIntensity > 0) {
        powerText.setText(`FIREBALL ${(snapshot.power.fireballMsRemaining / 1000).toFixed(1)}s`);
        powerText.setColor("#FFBA8D");
        powerText.setAlpha(0.9);
        powerBadge.setFillStyle(0x2a1a11, 1);
        powerBadge.setAlpha(0.34);
      } else if (snapshot.power.missileMsRemaining > 0) {
        powerText.setText(`MISSILE ${(snapshot.power.missileMsRemaining / 1000).toFixed(1)}s`);
        powerText.setColor("#FFD6B0");
        powerText.setAlpha(0.9);
        powerBadge.setFillStyle(0x241b14, 1);
        powerBadge.setAlpha(0.34);
      } else if (snapshot.power.ghostMsRemaining > 0) {
        powerText.setText(`GHOST ${(snapshot.power.ghostMsRemaining / 1000).toFixed(1)}s`);
        powerText.setColor("#D3F7FF");
        powerText.setAlpha(0.88);
        powerBadge.setFillStyle(0x12212b, 1);
        powerBadge.setAlpha(0.33);
      } else if (snapshot.power.shieldCharges > 0) {
        const shields = "|".repeat(snapshot.power.shieldCharges);
        powerText.setText(`SHIELD [${shields}]`);
        powerText.setColor("#C0F6FF");
        powerText.setAlpha(0.84);
        powerBadge.setFillStyle(0x0b141f, 1);
        powerBadge.setAlpha(0.3);
      } else if (snapshot.power.magnetMsRemaining > 0) {
        powerText.setText(`MAGNET ${(snapshot.power.magnetMsRemaining / 1000).toFixed(1)}s`);
        powerText.setColor("#BDF8FF");
        powerText.setAlpha(0.78);
        powerBadge.setFillStyle(0x0b141f, 1);
        powerBadge.setAlpha(0.28);
      } else {
        powerText.setAlpha(0);
        powerBadge.setAlpha(0);
      }

      const shieldActive = snapshot.power.shieldCharges;
      shieldPipA.setAlpha(shieldActive >= 1 ? 0.84 : 0);
      shieldPipB.setAlpha(shieldActive >= 2 ? 0.84 : 0);

      if (snapshot.status === "failed") {
        failScoreText.setText(`${snapshot.score.current}`);

        if (lastStatus !== "failed") {
          retryTransitionActive = false;
          this.tweens.killTweensOf([failureVeil, failScoreText, runHintText, retryRipple]);

          failureVeil.setAlpha(0);
          failScoreText.setScale(0.86).setAlpha(0);
          runHintText.setAlpha(0).setText("tap to drop again");
          retryRipple.setAlpha(0).setScale(1);

          this.tweens.add({
            targets: failureVeil,
            alpha: 0.24,
            duration: 130,
            ease: "Sine.Out",
          });

          this.tweens.add({
            targets: failScoreText,
            alpha: 0.96,
            scaleX: 1,
            scaleY: 1,
            duration: 170,
            ease: "Cubic.Out",
          });

          this.tweens.add({
            targets: runHintText,
            alpha: 0.82,
            duration: 160,
            delay: 42,
            ease: "Sine.Out",
          });
        } else if (!retryTransitionActive) {
          failureVeil.setAlpha(Math.max(0.2, failureVeil.alpha));
          failScoreText.setAlpha(Math.max(0.92, failScoreText.alpha));
          runHintText.setText("tap to drop again");
          runHintText.setAlpha(Math.max(0.76, runHintText.alpha));
        }
      } else {
        if (lastStatus === "failed") {
          retryTransitionActive = false;
          this.tweens.killTweensOf([failureVeil, failScoreText, runHintText, retryRipple]);
        }

        failureVeil.setAlpha(0);
        failScoreText.setAlpha(0).setScale(1);
        runHintText.setAlpha(0);
        retryRipple.setAlpha(0).setScale(1);
      }

      if (debugText) {
        const summary = services.runStatsRepository.getSummary();
        debugText.setY(this.scale.height - 10);
        debugText.setText(
          [
            "DBG",
            `run ${Math.round(snapshot.elapsedMs)}ms`,
            `state ${fusion.state} | spd ${Math.round(snapshot.difficulty.scrollSpeed)} | spw ${Math.round(snapshot.difficulty.spawnEveryMs)}ms`,
            `combo ${snapshot.score.combo} x${snapshot.score.multiplier.toFixed(2)} | rank ${snapshot.score.rank}`,
            `jump ${snapshot.player.jumpCount} | break ${snapshot.power.fireballBreakCount + snapshot.power.missileBreakCount}`,
            `obs ${snapshot.obstacles.length} | bonus ${snapshot.bonuses.length}`,
            `median ${(summary.medianRunMs / 1000).toFixed(1)}s | avg ${(summary.averageRunMs / 1000).toFixed(1)}s`,
          ].join("\n"),
        );
      }

      lastScore = snapshot.score.current;
      lastStatus = snapshot.status;
    };

    const onRetryPointerDown = () => {
      const snapshot = services.store.getState();
      if (snapshot.status !== "failed" || retryTransitionActive) {
        return;
      }

      retryTransitionActive = true;
      this.retryAttempt += 1;
      services.audio.play("retry");
      services.runStatsRepository.markLastRunRetryImmediate(Date.now());

      runHintText.setText("relinking...");
      runHintText.setAlpha(0.9);

      this.tweens.killTweensOf([failureVeil, failScoreText, runHintText, retryRipple]);
      retryRipple.setScale(0.84).setAlpha(0.32);

      this.tweens.add({
        targets: retryRipple,
        scaleX: 1.45,
        scaleY: 1.45,
        alpha: 0,
        duration: 130,
        ease: "Sine.Out",
      });

      this.tweens.add({
        targets: failureVeil,
        alpha: 0.34,
        duration: 64,
        yoyo: true,
        ease: "Sine.Out",
      });

      this.tweens.add({
        targets: failScoreText,
        scaleX: 1.06,
        scaleY: 1.06,
        alpha: 0,
        duration: 120,
        ease: "Cubic.In",
      });

      this.tweens.add({
        targets: runHintText,
        alpha: 0,
        duration: 120,
        ease: "Sine.In",
      });

      this.time.delayedCall(92, () => {
        services.events.emit("run:retry", { attempt: this.retryAttempt });
      });
    };

    this.input.on(Phaser.Input.Events.POINTER_DOWN, onRetryPointerDown);

    updateHud();
    this.unsubscribe = services.store.subscribe(() => {
      updateHud();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, onRetryPointerDown);
      if (this.unsubscribe) {
        this.unsubscribe();
      }
      this.unsubscribe = null;
    });
  }

  private lerpHexColor(from: string, to: string, factor: number): string {
    const t = clamp(factor, 0, 1);
    const fromColor = Phaser.Display.Color.HexStringToColor(from);
    const toColor = Phaser.Display.Color.HexStringToColor(to);

    const r = Phaser.Math.Linear(fromColor.red, toColor.red, t);
    const g = Phaser.Math.Linear(fromColor.green, toColor.green, t);
    const b = Phaser.Math.Linear(fromColor.blue, toColor.blue, t);

    return Phaser.Display.Color.RGBToString(Math.round(r), Math.round(g), Math.round(b), 0, "#");
  }

  private createDebugText(): Phaser.GameObjects.Text | null {
    if (!this.game || !this.scene) {
      return null;
    }

    if (!this.sys || !this.sys.settings.active) {
      return null;
    }

    if (!this.isDebugEnabled()) {
      return null;
    }

    return this.add
      .text(12, this.scale.height - 12, "", {
        fontFamily: "Consolas",
        fontSize: "12px",
        color: "#A9C7D2",
        align: "left",
      })
      .setOrigin(0, 1)
      .setAlpha(0.82)
      .setDepth(40);
  }

  private isDebugEnabled(): boolean {
    return GAMEPLAY_TUNING.debugOverlayEnabled;
  }
}



