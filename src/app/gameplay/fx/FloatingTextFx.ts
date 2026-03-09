import Phaser from "phaser";

export type FloatingTextChannel = "combo" | "event" | "pickup" | "impact" | "top";
export type FloatingTextTone = "minor" | "standard" | "major" | "critical";

export interface FloatingTextRequest {
  text: string;
  x: number;
  y: number;
  channel: FloatingTextChannel;
  tone?: FloatingTextTone;
  color?: string;
  sizePx?: number;
  holdMs?: number;
  driftYPx?: number;
  depth?: number;
  intensity?: number;
}

interface FloatingTextStyle {
  sizePx: number;
  color: string;
  strokeColor: string;
  strokeThickness: number;
  shadowColor: string;
  holdMs: number;
  fadeMs: number;
  driftYPx: number;
  entryScale: number;
  peakScale: number;
  depth: number;
}

const CHANNEL_STACK_GAP: Record<FloatingTextChannel, number> = {
  combo: 25,
  event: 22,
  pickup: 20,
  impact: 18,
  top: 24,
};

const TONE_STYLE_OVERRIDES: Record<FloatingTextTone, Partial<FloatingTextStyle>> = {
  minor: {
    sizePx: 18,
    holdMs: 150,
    fadeMs: 450,
    driftYPx: 30,
    strokeThickness: 3,
  },
  standard: {
    sizePx: 22,
    holdMs: 170,
    fadeMs: 500,
    driftYPx: 34,
    strokeThickness: 3,
  },
  major: {
    sizePx: 27,
    holdMs: 200,
    fadeMs: 560,
    driftYPx: 38,
    strokeThickness: 4,
    peakScale: 1.15,
  },
  critical: {
    sizePx: 33,
    holdMs: 220,
    fadeMs: 640,
    driftYPx: 46,
    strokeThickness: 4,
    peakScale: 1.18,
  },
};

const BASE_STYLE: FloatingTextStyle = {
  sizePx: 22,
  color: "#DDFBFF",
  strokeColor: "#062030",
  strokeThickness: 3,
  shadowColor: "#02111B",
  holdMs: 170,
  fadeMs: 520,
  driftYPx: 34,
  entryScale: 0.68,
  peakScale: 1.12,
  depth: 36,
};

export class FloatingTextFx {
  private readonly activeByChannel: Record<FloatingTextChannel, number> = {
    combo: 0,
    event: 0,
    pickup: 0,
    impact: 0,
    top: 0,
  };

  constructor(private readonly scene: Phaser.Scene) {}

  show(request: FloatingTextRequest): void {
    const tone = request.tone ?? "standard";
    const style = this.resolveStyle(request, tone);

    const channelLoad = this.activeByChannel[request.channel];
    const stackIndex = Math.min(4, channelLoad);
    this.activeByChannel[request.channel] = channelLoad + 1;

    const stackGap = CHANNEL_STACK_GAP[request.channel];
    const baseX = request.x + (stackIndex % 2 === 0 ? -1 : 1) * stackIndex * 7;
    const baseY = request.y - stackIndex * stackGap;

    const fontSize = `${Math.round(style.sizePx)}px`;
    const fontFamily = '"Avenir Next", "SF Pro Display", "Segoe UI", sans-serif';

    const text = this.scene.add
      .text(baseX, baseY, request.text, {
        fontFamily,
        fontSize,
        fontStyle: "800",
        color: style.color,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(style.depth)
      .setAlpha(0)
      .setScale(style.entryScale);

    text.setStroke(style.strokeColor, style.strokeThickness);
    text.setShadow(0, 2, style.shadowColor, 8, true, true);

    let glowText: Phaser.GameObjects.Text | null = null;
    if (tone === "critical" || request.channel === "top") {
      glowText = this.scene.add
        .text(baseX, baseY, request.text, {
          fontFamily,
          fontSize,
          fontStyle: "800",
          color: style.color,
          align: "center",
        })
        .setOrigin(0.5)
        .setDepth(style.depth - 1)
        .setAlpha(0)
        .setScale(style.entryScale * 1.12);

      glowText.setShadow(0, 0, style.color, 14, true, true);
    }

    const intensity = request.intensity ?? 0;
    const peakScale = style.peakScale + intensity * 0.035;
    const driftY = style.driftYPx + intensity * 4;
    const entryY = request.channel === "top" ? baseY - 12 : baseY - 9;
    const settleScale = request.channel === "top" ? peakScale * 0.95 : peakScale * 0.97;

    this.scene.tweens.add({
      targets: text,
      alpha: 1,
      scaleX: peakScale,
      scaleY: peakScale,
      y: entryY,
      duration: request.channel === "top" ? 160 : 130,
      ease: "Back.Out",
      onComplete: () => {
        this.scene.tweens.add({
          targets: text,
          scaleX: settleScale,
          scaleY: settleScale,
          duration: 110,
          ease: "Sine.Out",
        });
      },
    });

    if (glowText) {
      this.scene.tweens.add({
        targets: glowText,
        alpha: 0.38,
        scaleX: peakScale * 1.1,
        scaleY: peakScale * 1.1,
        y: entryY - 1,
        duration: request.channel === "top" ? 170 : 140,
        ease: "Back.Out",
      });

      this.scene.tweens.add({
        targets: glowText,
        alpha: 0,
        scaleX: peakScale * 1.22,
        scaleY: peakScale * 1.22,
        y: baseY - driftY * 0.9,
        delay: 120 + style.holdMs * 0.55,
        duration: style.fadeMs * 0.82,
        ease: "Cubic.Out",
        onComplete: () => {
          glowText?.destroy();
        },
      });
    }

    this.scene.tweens.add({
      targets: text,
      alpha: 0,
      scaleX: 0.96,
      scaleY: 0.96,
      y: baseY - driftY,
      delay: 130 + style.holdMs,
      duration: style.fadeMs,
      ease: "Cubic.Out",
      onComplete: () => {
        text.destroy();
        this.activeByChannel[request.channel] = Math.max(0, this.activeByChannel[request.channel] - 1);
      },
    });
  }

  clear(): void {
    this.activeByChannel.combo = 0;
    this.activeByChannel.event = 0;
    this.activeByChannel.pickup = 0;
    this.activeByChannel.impact = 0;
    this.activeByChannel.top = 0;
  }

  private resolveStyle(request: FloatingTextRequest, tone: FloatingTextTone): FloatingTextStyle {
    const toneStyle = TONE_STYLE_OVERRIDES[tone];

    return {
      sizePx: request.sizePx ?? toneStyle.sizePx ?? BASE_STYLE.sizePx,
      color: request.color ?? BASE_STYLE.color,
      strokeColor: BASE_STYLE.strokeColor,
      strokeThickness: toneStyle.strokeThickness ?? BASE_STYLE.strokeThickness,
      shadowColor: BASE_STYLE.shadowColor,
      holdMs: request.holdMs ?? toneStyle.holdMs ?? BASE_STYLE.holdMs,
      fadeMs: toneStyle.fadeMs ?? BASE_STYLE.fadeMs,
      driftYPx: request.driftYPx ?? toneStyle.driftYPx ?? BASE_STYLE.driftYPx,
      entryScale: BASE_STYLE.entryScale,
      peakScale: toneStyle.peakScale ?? BASE_STYLE.peakScale,
      depth: request.depth ?? BASE_STYLE.depth,
    };
  }
}
