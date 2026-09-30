import type Phaser from 'phaser';

/** SVG art is rasterized at 2x so it stays crisp on Retina iPads (shown at 1/RESOLUTION scale). */
export const SVG_RESOLUTION = 2;

/** DESIGN 18.5: no texture larger than this on either side. */
export const MAX_TEXTURE_PX = 4096;

/** The pixel size a picture of `size` world px is rasterized at (2x, capped). */
export function texturePixels(size: { w: number; h: number }): { w: number; h: number } {
  const scale = Math.min(SVG_RESOLUTION, MAX_TEXTURE_PX / Math.max(size.w, size.h, 1));
  return { w: Math.ceil(size.w * scale), h: Math.ceil(size.h * scale) };
}

/**
 * Pictures still being built, per game (per texture manager). A game that's thrown away and
 * remade (React StrictMode in dev, switching players) must never wait on the old game's build:
 * that texture would land in the old game, and the new one would show nothing.
 */
const pendingByGame = new WeakMap<object, Map<string, ((key: string) => void)[]>>();

/**
 * Makes sure texture `key` exists, rasterizing `source` (an SVG data URI or an image URL from the
 * asset manifest) the first time, then calls `ready`. Each texture is built once and shared.
 * Drawn into an exact-size canvas: browsers disagree on an SVG image's own size (WebKit drew it
 * small and offset when used as a texture directly).
 */
export function ensureTexture(
  scene: Phaser.Scene,
  key: string,
  source: () => string,
  size: { w: number; h: number },
  ready: (key: string) => void,
): void {
  const textures = scene.textures;
  const pending = pendingByGame.get(textures) ?? new Map<string, ((key: string) => void)[]>();
  pendingByGame.set(textures, pending);
  if (textures.exists(key)) {
    ready(key);
    return;
  }
  const waiting = pending.get(key);
  if (waiting) {
    waiting.push(ready);
    return;
  }
  pending.set(key, [ready]);
  const img = new Image();
  const finish = () => {
    const callbacks = pending.get(key) ?? [];
    pending.delete(key);
    if (!textures.exists(key)) {
      const canvas = document.createElement('canvas');
      const px = texturePixels(size);
      canvas.width = px.w;
      canvas.height = px.h;
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      textures.addCanvas(key, canvas);
    }
    for (const cb of callbacks) cb(key);
  };
  img.onload = finish;
  img.onerror = () => pending.delete(key);
  img.src = source();
}
