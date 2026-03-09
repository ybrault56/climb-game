import Phaser from "phaser";

export class TransitionService {
  fadeIn(scene: Phaser.Scene, durationMs = 120): void {
    scene.cameras.main.fadeIn(durationMs, 12, 14, 18);
  }

  fadeOut(scene: Phaser.Scene, onComplete: () => void, durationMs = 120): void {
    scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, onComplete);
    scene.cameras.main.fadeOut(durationMs, 12, 14, 18);
  }
}
