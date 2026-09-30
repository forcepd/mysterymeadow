import {
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  SRGBColorSpace,
  type MeshToonMaterial,
} from 'three';
import { outlineMaterial, toonMaterial } from '../art/toon';

/** Shared by every animal: one toon material (vertex colors), one outline, one shadow. */

/** Animals are small: a thinner outline than the scenery's. */
export const ANIMAL_OUTLINE = 0.013;

let shared: {
  body: MeshToonMaterial;
  outline: MeshBasicMaterial;
  shadow: MeshBasicMaterial;
  shadowGeo: CircleGeometry;
  hit: MeshBasicMaterial;
  hitGeo: CylinderGeometry;
} | null = null;

export function animalMaterials() {
  if (!shared) {
    const shadowGeo = new CircleGeometry(1, 24);
    shadowGeo.rotateX(-Math.PI / 2);
    // A tap volume: one unit tall, standing on the ground (scaled per animal).
    const hitGeo = new CylinderGeometry(1, 1, 1, 10);
    hitGeo.translate(0, 0.5, 0);
    shared = {
      body: toonMaterial(),
      outline: outlineMaterial(ANIMAL_OUTLINE),
      // A soft round shadow on the ground, like the original's.
      shadow: new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
      shadowGeo,
      // Invisible, but raycasts still hit it.
      hit: new MeshBasicMaterial({ visible: false }),
      hitGeo,
    };
  }
  return shared;
}

const stars = new Map<string, CanvasTexture>();

/** A four-pointed twinkle star (Sparkle animals), in a color. */
export function starTexture(color: string): CanvasTexture {
  const cached = stars.get(color);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(32, 32);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 7 : 29;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  stars.set(color, texture);
  return texture;
}
