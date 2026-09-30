import { CanvasTexture, SRGBColorSpace } from 'three';

/** Small white shapes for particles (tinted by each particle's color). Made once. */
const cache = new Map<string, CanvasTexture>();

function make(key: string, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(32, 32);
  ctx.fillStyle = '#ffffff';
  draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}

/** A chunky five-pointed star with a soft darker edge. */
export const starShape = () =>
  make('star', (ctx) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 11 : 27;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  });

/** A soft round puff (clouds). */
export const puffShape = () =>
  make('puff', (ctx) => {
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
  });

/** A heart. */
export const heartShape = () =>
  make('heart', (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.bezierCurveTo(-30, 2, -24, -26, 0, -12);
    ctx.bezierCurveTo(24, -26, 30, 2, 0, 24);
    ctx.fill();
  });
