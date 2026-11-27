import Phaser from 'phaser';

/** Fullscreen is only available where the browser allows it (not on iPhone Safari). */
export const fullscreenAvailable = (scene: Phaser.Scene): boolean => scene.scale.fullscreen.available;

/** Must be called from a user gesture (tap/click). Also asks for landscape where supported. */
export function enterFullscreen(scene: Phaser.Scene): void {
  if (!fullscreenAvailable(scene) || scene.scale.isFullscreen) return;
  scene.scale.startFullscreen();
  try {
    // Only works in fullscreen on Android Chrome; ignored elsewhere.
    void (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => undefined);
  } catch {
    /* not supported */
  }
}

export function toggleFullscreen(scene: Phaser.Scene): void {
  if (scene.scale.isFullscreen) scene.scale.stopFullscreen();
  else enterFullscreen(scene);
}

/** Small corner button; hidden when fullscreen isn't available. Returns its screen zone. */
export function addFullscreenButton(scene: Phaser.Scene, x: number, y: number, r = 30): { x: number; y: number; r: number } | null {
  if (!fullscreenAvailable(scene)) return null;
  const g = scene.add.circle(x, y, r, 0x0b3a5b, 0.7).setStrokeStyle(4, 0xffffff, 0.9);
  const icon = scene.add.graphics();
  const draw = (): void => {
    icon.clear().lineStyle(4, 0xffffff, 1);
    const a = 9, b = 4;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const inward = scene.scale.isFullscreen ? -1 : 1; // corners point out to enter, in to exit
      const cx = x + sx * a * (inward > 0 ? 1 : 0.4);
      const cy = y + sy * a * (inward > 0 ? 1 : 0.4);
      icon.lineBetween(cx, cy, cx - sx * b * 1.5, cy).lineBetween(cx, cy, cx, cy - sy * b * 1.5);
    }
  };
  draw();
  g.setInteractive({ useHandCursor: true }).on('pointerup', () => toggleFullscreen(scene));
  scene.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, draw);
  scene.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, draw);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, draw);
    scene.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, draw);
  });
  return { x, y, r };
}
