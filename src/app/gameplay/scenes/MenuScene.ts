import Phaser from "phaser";
import { resolveSceneServices } from "../contracts/SceneSystemContract";
import { MAIN_MENU_VIEW_MODEL } from "../../ui/menus/MenuViewModel";
import { SCENE_KEYS } from "./sceneKeys";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.menu);
  }

  create(): void {
    const { analytics, audio } = resolveSceneServices();
    const centerX = this.scale.width * 0.5;
    const centerY = this.scale.height * 0.5;

    this.cameras.main.fadeIn(90, 6, 9, 13);

    this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x06090d, 1);

    this.add
      .text(centerX, centerY - 80, MAIN_MENU_VIEW_MODEL.title, {
        fontFamily: "Segoe UI",
        fontSize: "42px",
        color: "#E6FBFF",
        fontStyle: "700",
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, centerY - 22, MAIN_MENU_VIEW_MODEL.subtitle, {
        fontFamily: "Segoe UI",
        fontSize: "16px",
        color: "#8AB8C2",
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, centerY + 56, MAIN_MENU_VIEW_MODEL.cta, {
        fontFamily: "Segoe UI",
        fontSize: "22px",
        color: "#6CE4F2",
        fontStyle: "700",
      })
      .setOrigin(0.5);

    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => {
      audio.play("uiTap");
      analytics.track({ name: "menu_start_tap" });

      this.cameras.main.fadeOut(90, 6, 9, 13);
      this.time.delayedCall(90, () => {
        this.scene.start(SCENE_KEYS.game);
        this.scene.launch(SCENE_KEYS.ui);
      });
    });
  }
}
