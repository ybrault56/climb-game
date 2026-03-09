import Phaser from "phaser";
import { clamp } from "../../core/math/clamp";
import { buildHudViewModel } from "../../ui/hud/HudViewModel";
import type { RankTier } from "../types";
import { resolveSceneServices } from "../contracts/SceneSystemContract";
import { SCENE_KEYS } from "./sceneKeys";
import { GAMEPLAY_TUNING } from "../tuning";

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

    const updateHud = () => {
      const snapshot = services.store.getState();
      const model = buildHudViewModel(snapshot);

      const scoreDelta = Math.max(0, snapshot.score.current - lastScore);
      scorePressure = Math.max(0, scorePressure - 0.025);
      if (scoreDelta > 0) {
        scorePressure = Math.min(1.4, scorePressure + scoreDelta / 700 + snapshot.score.flowLevel * 0.06);
      }
      lastScore = snapshot.score.current;

      const rankPressure = this.rankToPressure(snapshot.score.rank);
      const pressure = clamp(scorePressure * 0.55 + rankPressure * 0.35 + snapshot.score.flowLevel * 0.5, 0, 1.45);

      const scoreColor = this.lerpHexColor("#DDFBFF", "#FFD7A1", pressure * 0.72);
      const comboColor = this.lerpHexColor("#9EEFFF", "#FFF1CC", pressure * 0.66);

      scoreText.setText(model.scoreLabel);
      bestText.setText(model.bestLabel);
      scoreText.setX(this.scale.width - 18);
      bestText.setX(this.scale.width - 18);
      scorePlate.setX(this.scale.width - 18);
      scoreGlow.setX(this.scale.width - 18);

      scoreText.setColor(scoreColor);
      scoreText.setScale(1 + snapshot.score.flowLevel * 0.08 + pressure * 0.05);
      scoreText.setAlpha(0.88 + pressure * 0.08);
      scoreGlow.setFillStyle(pressure > 0.75 ? 0xffbe7b : 0x79e9ff, 1);
      scoreGlow.setAlpha(0.08 + pressure * 0.12);
      scorePlate.setAlpha(0.3 + pressure * 0.08);

      if (snapshot.score.combo > 1) {
        comboText.setText(`combo x${snapshot.score.combo}  x${snapshot.score.multiplier.toFixed(2)}`);
        comboText.setColor(comboColor);
        comboText.setScale(1 + pressure * 0.08);
        comboText.setAlpha(0.74 + snapshot.score.flowLevel * 0.22);
      } else {
        comboText.setText("combo x1");
        comboText.setScale(1);
        comboText.setAlpha(0.28);
        comboText.setColor("#8ACEDF");
      }

      rankText.setText(`rank ${snapshot.score.rank}  shards ${snapshot.score.shardCount}`);
      rankText.setAlpha(0.58 + snapshot.score.flowLevel * 0.22 + pressure * 0.05);

      const fireballActive = snapshot.power.fireballMsRemaining > 0;
      if (fireballActive) {
        powerText.setText(`FIREBALL ${(snapshot.power.fireballMsRemaining / 1000).toFixed(1)}s`);
        powerText.setColor("#FFBA8D");
        powerText.setAlpha(0.9);
        powerBadge.setAlpha(0.34);
      } else if (snapshot.power.shieldCharges > 0) {
        const shields = "|".repeat(snapshot.power.shieldCharges);
        powerText.setText(`SHIELD [${shields}]`);
        powerText.setColor("#C0F6FF");
        powerText.setAlpha(0.84);
        powerBadge.setAlpha(0.3);
      } else if (snapshot.power.magnetMsRemaining > 0) {
        powerText.setText(`MAGNET ${(snapshot.power.magnetMsRemaining / 1000).toFixed(1)}s`);
        powerText.setColor("#BDF8FF");
        powerText.setAlpha(0.78);
        powerBadge.setAlpha(0.28);
      } else {
        powerText.setAlpha(0);
        powerBadge.setAlpha(0);
      }

      const shieldActive = snapshot.power.shieldCharges;
      shieldPipA.setAlpha(shieldActive >= 1 ? 0.84 : 0);
      shieldPipB.setAlpha(shieldActive >= 2 ? 0.84 : 0);

      if (snapshot.status === "failed") {
        failureVeil.setAlpha(0.22);
        failScoreText.setText(`${snapshot.score.current}`);
        failScoreText.setAlpha(0.95);
        runHintText.setText("tap to drop again");
        runHintText.setAlpha(0.8);
      } else {
        failureVeil.setAlpha(0);
        failScoreText.setAlpha(0);
        runHintText.setAlpha(0);
      }

      if (!debugText) {
        return;
      }

      const summary = services.runStatsRepository.getSummary();
      debugText.setY(this.scale.height - 10);
      debugText.setText(
        [
          "DBG",
          `run ${Math.round(snapshot.elapsedMs)}ms`,
          `spd ${Math.round(snapshot.difficulty.scrollSpeed)} | spw ${Math.round(snapshot.difficulty.spawnEveryMs)}ms`,
          `combo ${snapshot.score.combo} x${snapshot.score.multiplier.toFixed(2)} | rank ${snapshot.score.rank}`,
          `jump ${snapshot.player.jumpCount} | breaks ${snapshot.power.fireballBreakCount}`,
          `obs ${snapshot.obstacles.length} | bonus ${snapshot.bonuses.length}`,
          `median ${(summary.medianRunMs / 1000).toFixed(1)}s | avg ${(summary.averageRunMs / 1000).toFixed(1)}s`,
        ].join("\n"),
      );
    };

    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      const snapshot = services.store.getState();
      if (snapshot.status !== "failed") {
        return;
      }

      this.retryAttempt += 1;
      services.audio.play("retry");
      services.runStatsRepository.markLastRunRetryImmediate(Date.now());
      services.events.emit("run:retry", { attempt: this.retryAttempt });
    });

    updateHud();
    this.unsubscribe = services.store.subscribe(() => {
      updateHud();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN);
      if (this.unsubscribe) {
        this.unsubscribe();
      }
      this.unsubscribe = null;
    });
  }

  private rankToPressure(rank: RankTier): number {
    if (rank === "SS") {
      return 1;
    }

    if (rank === "S") {
      return 0.8;
    }

    if (rank === "A") {
      return 0.58;
    }

    if (rank === "B") {
      return 0.35;
    }

    return 0.12;
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
