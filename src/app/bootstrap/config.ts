import Phaser from "phaser";
import { BootScene } from "../gameplay/scenes/BootScene";
import { GameScene } from "../gameplay/scenes/GameScene";
import { UIScene } from "../gameplay/scenes/UIScene";

export function createGameConfig(containerId: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: containerId,
    backgroundColor: "#05080D",
    scene: [BootScene, GameScene, UIScene],
    fps: {
      target: 60,
      forceSetTimeOut: true,
    },
    render: {
      antialias: true,
      pixelArt: false,
      powerPreference: "high-performance",
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 390,
      height: 844,
    },
  };
}
