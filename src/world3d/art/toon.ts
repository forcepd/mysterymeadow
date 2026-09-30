import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type ColorRepresentation,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS } from '../../game/constants';

/**
 * The 3D look (DESIGN-3D "Art"): soft toon shading in three tones, plus a soft dark outline
 * drawn as an "inverted hull" (the back faces of a slightly inflated copy), like the original's
 * thick rounded outlines. Static scenery is built from colored parts merged into one mesh, so a
 * whole yard is a handful of draw calls on an iPad.
 */

let gradient: DataTexture | null = null;

/** Three light bands: shade, mid, lit. */
function toonGradient(): DataTexture {
  if (!gradient) {
    gradient = new DataTexture(new Uint8Array([150, 205, 255]), 3, 1, RedFormat);
    gradient.minFilter = NearestFilter;
    gradient.magFilter = NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

/**
 * Scenery closer to the camera than this (units) dissolves away, so trees, fences and the house
 * never block the yard when the camera swings low or zooms in. World3D sets it every frame from
 * the camera's distance. Animals never fade.
 */
export const sceneryFade = { value: 0 };

/**
 * Adds the near-camera fade to a material: an ordered dither between 70% and 100% of the fade
 * distance (no transparency sorting needed).
 */
function addNearFade(material: MeshToonMaterial | MeshBasicMaterial): void {
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.fadeNear = sceneryFade;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFadeDepth;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvFadeDepth = -mvPosition.z;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float fadeNear;\nvarying float vFadeDepth;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float fadeKeep = smoothstep(fadeNear * 0.7, fadeNear, vFadeDepth);
        if (fadeKeep < 1.0) {
          const mat4 bayer = mat4(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0,
                                  3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
          ivec2 cell = ivec2(mod(floor(gl_FragCoord.xy), 4.0));
          if ((bayer[cell.x][cell.y] + 0.5) / 16.0 >= fadeKeep) discard;
        }`,
      );
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}-fade`;
}

/** A toon material. With no color, it takes each vertex's color (merged scenery). */
export function toonMaterial(color?: ColorRepresentation, { fade = false } = {}): MeshToonMaterial {
  const material = new MeshToonMaterial({
    gradientMap: toonGradient(),
    ...(color === undefined ? { vertexColors: true } : { color }),
  });
  if (fade) addNearFade(material);
  return material;
}

/** Outline thickness in ground units (about 3 world px). */
export const OUTLINE = 0.028;

/** The outline material: back faces pushed out along (smoothed) normals. */
export function outlineMaterial(
  thickness = OUTLINE,
  color: ColorRepresentation = COLORS.outline,
  { fade = false } = {},
): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ color, side: BackSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineThickness;')
      .replace(
        '#include <begin_vertex>',
        'vec3 transformed = vec3( position ) + normal * outlineThickness;',
      );
  };
  // Different thicknesses compile to the same program otherwise.
  material.customProgramCacheKey = () => `outline-${thickness}`;
  if (fade) addNearFade(material);
  return material;
}

/**
 * A copy of `geometry` for the outline: vertices welded by position and normals averaged, so
 * the inflated hull has no cracks at hard edges (box corners, cone rims).
 */
export function outlineGeometry(geometry: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', geometry.getAttribute('position').clone());
  const welded = mergeVertices(g, 1e-4);
  welded.computeVertexNormals();
  return welded;
}

/** A mesh with its outline hull as a child (the hull never casts shadows or takes taps). */
export function outlined(mesh: Mesh, thickness = OUTLINE, { fade = false } = {}): Mesh {
  const hull = new Mesh(
    outlineGeometry(mesh.geometry),
    outlineMaterial(thickness, COLORS.outline, { fade }),
  );
  hull.name = 'outline';
  hull.raycast = () => {};
  mesh.add(hull);
  return mesh;
}

export interface PartOptions {
  x?: number;
  y?: number;
  z?: number;
  /** Rotation (radians), applied X, then Y, then Z... in three's default XYZ order. */
  rx?: number;
  ry?: number;
  rz?: number;
  /** Scale: a number for all axes, or per axis. */
  s?: number | [number, number, number];
}

const tmpColor = new Color();

/**
 * One colored piece of scenery: the geometry is placed (scale, rotate, move), made non-indexed
 * with only position, normal and color, so any parts can merge.
 */
export function part(
  geometry: BufferGeometry,
  color: ColorRepresentation,
  o: PartOptions = {},
): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  geometry.dispose();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const s = o.s ?? 1;
  const [sx, sy, sz] = typeof s === 'number' ? [s, s, s] : s;
  g.scale(sx, sy, sz);
  if (o.rx) g.rotateX(o.rx);
  if (o.ry) g.rotateY(o.ry);
  if (o.rz) g.rotateZ(o.rz);
  g.translate(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  paint(g, color);
  return g;
}

/** Sets every vertex of `g` to one color (in the renderer's linear working space). */
export function paint(g: BufferGeometry, color: ColorRepresentation): BufferGeometry {
  tmpColor.set(color);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

/** Merges parts into one geometry (and frees the parts). */
export function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Scenery parts could not be merged');
  parts.forEach((p) => p.dispose());
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/**
 * Merged parts as one toon mesh with an outline (`outline`: its thickness, or 0 for none).
 * Scenery fades near the camera (see `sceneryFade`).
 */
export function sceneryMesh(
  parts: BufferGeometry[],
  { outline = OUTLINE, shadows = true, fade = true } = {},
): Mesh {
  const mesh = new Mesh(merge(parts), toonMaterial(undefined, { fade }));
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return outline > 0 ? outlined(mesh, outline, { fade }) : mesh;
}

/** Small seeded random numbers for placing scenery (the same yard every time). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
