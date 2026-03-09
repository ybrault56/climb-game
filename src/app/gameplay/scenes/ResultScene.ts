import Phaser from "phaser";
import { buildResultViewModel } from "../../ui/menus/MenuViewModel";
import { resolveSceneServices } from "../contracts/SceneSystemContract";
import { SCENE_KEYS } from "./sceneKeys";

export class ResultScene extends Phaser.Scene {
  private retryAttempt = 0;

  constructor() {
    super(SCENE_KEYS.result);
  }

  create(): void {
    const services = resolveSceneServices();
    const snapshot = services.store.getState();
    const model = buildResultViewModel(snapshot.score.current, snapshot.score.best);
    const centerX = this.scale.width * 0.5;
    const centerY = this.scale.height * 0.5;

    this.cameras.main.fadeIn(90, 8, 10, 14);

    this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x090c11, 0.98);

    this.add
      .text(centerX, centerY - 64, model.title, {
        fontFamily: "Segoe UI",
        fontSize: "38px",
        color: "#FFDCDC",
        fontStyle: "700",
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, centerY - 6, model.subtitle, {
        fontFamily: "Segoe UI",
        fontSize: "18px",
        color: "#FFF0F0",
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, centerY + 60, model.cta, {
        fontFamily: "Segoe UI",
        fontSize: "22px",
        color: "#6CE4F2",
        fontStyle: "700",
      })
      .setOrigin(0.5);

    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => {
      this.retryAttempt += 1;
      services.analytics.track({
        name: "run_retry",
        payload: {
          attempt: this.retryAttempt,
        },
      });
      services.audio.play("uiTap");
      services.runStatsRepository.markLastRunRetryImmediate(Date.now());
      services.events.emit("run:retry", { attempt: this.retryAttempt });

      this.cameras.main.fadeOut(80, 8, 10, 14);
      this.time.delayedCall(80, () => {
        this.scene.start(SCENE_KEYS.game);
        this.scene.launch(SCENE_KEYS.ui);
      });
    });
  }
}
