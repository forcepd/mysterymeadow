import {
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three';
import { getSpecies } from '../config/species';
import { COLORS } from '../game/constants';

/**
 * Phase 3D-0 stand-ins: a simple capsule critter per animal and a dark silhouette with a "?"
 * per mystery visitor, so tapping and selecting work end to end. Phase 3D-2 replaces them with
 * the real parametric 3D species.
 */

/** Height of an adult stand-in (ground units). Anchors for labels and taps sit at this height. */
export const STAND_IN_HEIGHT = 0.95;
const BABY_SCALE = 0.65;

const body = new CapsuleGeometry(0.28, 0.3, 6, 12);
const head = new SphereGeometry(0.24, 16, 12);
const eye = new SphereGeometry(0.04, 8, 6);
const eyeMat = new MeshBasicMaterial({ color: COLORS.outline });
/** Invisible, generous tap volume (raycasts still hit it). */
const hitGeo = new CylinderGeometry(0.5, 0.5, 1.3, 12);
const hitMat = new MeshBasicMaterial({ visible: false });
const ringGeo = new RingGeometry(0.42, 0.52, 32);

export const PICK_KEY = 'pickKey';

export interface StandIn {
  group: Group;
  /** Colors the critter; a changed key rebuilds nothing, it just recolors. */
  setLook(look: { color: string; baby: boolean; sparkle: boolean }): void;
}

function critter(color: string): { group: Group; mat: MeshLambertMaterial; headMesh: Mesh } {
  const group = new Group();
  const mat = new MeshLambertMaterial({ color });
  const b = new Mesh(body, mat);
  b.position.y = 0.42;
  b.castShadow = true;
  const h = new Mesh(head, mat);
  h.position.set(0, 0.78, 0.12);
  h.castShadow = true;
  for (const side of [-1, 1]) {
    const e = new Mesh(eye, eyeMat);
    e.position.set(side * 0.09, 0.05, 0.21);
    h.add(e);
  }
  group.add(b, h);
  return { group, mat, headMesh: h };
}

function withHitVolume(group: Group, key: string): void {
  const hit = new Mesh(hitGeo, hitMat);
  hit.position.y = 0.65;
  hit.userData[PICK_KEY] = key;
  group.add(hit);
}

export function animalStandIn(key: string): StandIn {
  const { group, mat } = critter('#ffffff');
  withHitVolume(group, key);
  let last = '';
  return {
    group,
    setLook({ color, baby, sparkle }) {
      const look = `${color}|${baby}|${sparkle}`;
      if (look === last) return;
      last = look;
      mat.color.set(color);
      mat.emissive.set(sparkle ? '#fff2a8' : '#000000');
      mat.emissiveIntensity = sparkle ? 0.35 : 0;
      group.scale.setScalar(baby ? BABY_SCALE : 1);
    },
  };
}

let questionTexture: CanvasTexture | null = null;

function questionMark(): Sprite {
  if (!questionTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#4a3b33';
    ctx.stroke();
    ctx.fillStyle = '#4a3b33';
    ctx.font = '800 84px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 64, 70);
    questionTexture = new CanvasTexture(canvas);
    questionTexture.colorSpace = SRGBColorSpace;
  }
  const sprite = new Sprite(new SpriteMaterial({ map: questionTexture, depthTest: false }));
  sprite.scale.setScalar(0.45);
  sprite.renderOrder = 10;
  return sprite;
}

export interface VisitorStandIn extends StandIn {
  setRevealed(revealed: boolean): void;
}

export function visitorStandIn(key: string): VisitorStandIn {
  const { group, mat } = critter(`#${COLORS.silhouette.toString(16).padStart(6, '0')}`);
  withHitVolume(group, key);
  const bubble = questionMark();
  bubble.position.y = STAND_IN_HEIGHT + 0.45;
  group.add(bubble);
  let revealed = false;
  let color = '';
  return {
    group,
    setLook(look) {
      color = look.color;
      if (revealed) mat.color.set(color);
    },
    setRevealed(r) {
      if (r === revealed) return;
      revealed = r;
      bubble.visible = !r;
      mat.color.set(r ? color : COLORS.silhouette);
    },
  };
}

/** The main color of a species variant (falls back to a friendly tan). */
export function variantColor(speciesId: string, variantId: string): string {
  const species = getSpecies(speciesId);
  const variant = species?.variants.find((v) => v.id === variantId) ?? species?.variants[0];
  return variant?.colors.main ?? '#d9b27c';
}

export function selectionRing(): Mesh {
  const ring = new Mesh(
    ringGeo,
    new MeshBasicMaterial({ color: COLORS.select, transparent: true, opacity: 0.9 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.visible = false;
  return ring;
}
