import {
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { avatarKey } from '../../art/avatarSvg';
import type { PortraitProviders } from '../../ui/portraitProviders';
import { animalMaterials } from '../animals/materials';
import { animalModel, silhouetteModel, type AnimalModel } from '../animals/model';
import { outfitMesh } from '../animals/outfits';
import { AVATAR_HEIGHT, avatarMesh } from '../avatar/avatarModel';

/** Most pictures kept (each is a small PNG data URL). */
const MAX_CACHED = 300;
const PET_SIZE = 256;
const AVATAR = { w: 264, h: 448 };

/**
 * Renders 3D portraits for the menus with one small offscreen renderer: each look is drawn once,
 * turned into an image URL, and cached. Pets are framed head-and-shoulders from slightly above
 * the front (like the original's round portraits); avatars stand full height.
 */
export class Portraits implements PortraitProviders {
  private renderer: WebGLRenderer | null = null;
  private readonly scene = new Scene();
  private readonly stage = new Group();
  private readonly camera = new PerspectiveCamera(24, 1, 0.05, 50);
  private readonly cache = new Map<string, string>();

  constructor() {
    this.scene.add(new HemisphereLight(0xf2f9ff, 0xc9d8b8, 1.6));
    const sun = new DirectionalLight(0xfff1d8, 1.9);
    sun.position.set(-2, 4, 5);
    this.scene.add(sun, this.stage);
  }

  animal: PortraitProviders['animal'] = (look) => {
    const { head, body, face } = look.outfit ?? {};
    const lookKey = `${look.speciesId}|${look.variantId}|${look.isSparkle}`;
    const key = `pet|${lookKey}|${head ?? ''}|${body ?? ''}|${face ?? ''}`;
    return this.cached(key, () => {
      const model = animalModel(look.speciesId, look.variantId, look.isSparkle);
      const group = this.animalGroup(model);
      const outfit = outfitMesh(lookKey, model.anchors, look.outfit ?? {});
      if (outfit) group.add(outfit);
      return this.draw(group, PET_SIZE, PET_SIZE, () => this.aimAtHead(model));
    });
  };

  silhouette: PortraitProviders['silhouette'] = (speciesId) =>
    this.cached(`shadow|${speciesId}`, () => {
      const model = silhouetteModel(speciesId);
      return this.draw(this.animalGroup(model), PET_SIZE, PET_SIZE, () => this.aimAtHead(model));
    });

  avatar: PortraitProviders['avatar'] = (loadout) =>
    this.cached(`avatar|${avatarKey(loadout)}`, () => {
      const group = new Group();
      group.add(avatarMesh(loadout));
      return this.draw(group, AVATAR.w, AVATAR.h, () => {
        // Full height, straight on and a touch above, like the original's standing avatar.
        this.camera.aspect = AVATAR.w / AVATAR.h;
        const mid = AVATAR_HEIGHT * 0.5;
        const distance = (AVATAR_HEIGHT * 0.56) / Math.tan((this.camera.fov * Math.PI) / 360);
        this.camera.position.set(0, mid + distance * 0.12, distance);
        this.camera.lookAt(0, mid, 0);
      });
    });

  dispose(): void {
    this.renderer?.dispose();
    this.renderer = null;
    this.cache.clear();
  }

  private cached(key: string, make: () => string): string {
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (this.cache.size >= MAX_CACHED) this.cache.clear();
    const url = make();
    this.cache.set(key, url);
    return url;
  }

  private animalGroup(model: AnimalModel): Group {
    const m = animalMaterials();
    const group = new Group();
    const body = new Mesh(model.geometry, m.body);
    body.add(new Mesh(model.outline, m.outline));
    group.add(body);
    return group;
  }

  /** Head and shoulders, from the front and a little above (faces look up). */
  private aimAtHead(model: AnimalModel): void {
    this.camera.aspect = 1;
    const [hx, hy, hz] = model.anchors.head.center;
    const r = model.anchors.head.radius;
    const target = { x: hx, y: hy - r * 0.25, z: hz };
    const distance = (r * 1.75) / Math.tan((this.camera.fov * Math.PI) / 360);
    this.camera.position.set(target.x, target.y + distance * 0.3, target.z + distance);
    this.camera.lookAt(target.x, target.y, target.z);
  }

  private draw(object: Object3D, w: number, h: number, aim: () => void): string {
    const renderer = this.ensureRenderer();
    renderer.setSize(w, h, false);
    // Always drawn at full opacity, even while Decorate mode fades the world's animals.
    const m = animalMaterials();
    const opacity = m.body.opacity;
    m.body.opacity = m.outline.opacity = 1;
    this.stage.add(object);
    aim();
    this.camera.updateProjectionMatrix();
    renderer.render(this.scene, this.camera);
    const url = renderer.domElement.toDataURL('image/png');
    this.stage.remove(object);
    m.body.opacity = m.outline.opacity = opacity;
    return url;
  }

  private ensureRenderer(): WebGLRenderer {
    if (!this.renderer) {
      this.renderer = new WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(0x000000, 0);
    }
    return this.renderer;
  }
}
