export interface CameraFxTarget {
  shake(duration: number, intensity?: number, force?: boolean): void;
  flash(duration: number, red?: number, green?: number, blue?: number, force?: boolean): void;
}

export class ScreenFxService {
  playFailureFx(camera: CameraFxTarget): void {
    camera.shake(68, 0.0018, true);
  }
}
