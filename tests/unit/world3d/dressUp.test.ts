import { Box3, Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { AVATAR_ITEMS, type AvatarSlot } from '../../../src/config/avatarItems';
import { ITEMS, type PetOutfitItemDef } from '../../../src/config/items';
import { SPECIES } from '../../../src/config/species';
import { DEFAULT_LOADOUT, type AvatarLoadout } from '../../../src/profile/avatar';
import { animalModel, silhouetteModel } from '../../../src/world3d/animals/model';
import { OUTFIT_KINDS, outfitMesh } from '../../../src/world3d/animals/outfits';
import { AVATAR_HEIGHT, avatarMesh } from '../../../src/world3d/avatar/avatarModel';

const OUTFITS = ITEMS.filter((i): i is PetOutfitItemDef => i.category === 'petOutfit');

function boxOf(g: { getAttribute(n: string): unknown }): Box3 {
  return new Box3().setFromBufferAttribute(g.getAttribute('position') as never);
}

describe('pet outfits in 3D', () => {
  it('has a 3D recipe for every outfit kind in the Pet Boutique', () => {
    for (const o of OUTFITS) expect(OUTFIT_KINDS, o.kind).toContain(o.kind);
  });

  it('fits every outfit on every species, close to where it belongs', () => {
    for (const s of SPECIES) {
      const v = s.variants[0]!.id;
      const model = animalModel(s.id, v);
      const body = boxOf(model.geometry);
      const grow = body.clone().expandByScalar(0.35);
      for (const o of OUTFITS) {
        const mesh = outfitMesh(`${s.id}|${v}|false`, model.anchors, { [o.slot]: o.id });
        expect(mesh, `${s.id} ${o.id}`).not.toBeNull();
        const b = boxOf(mesh!.geometry);
        // On the animal (not floating off somewhere): inside its box, grown a little.
        expect(grow.containsBox(b), `${s.id} ${o.id} stays on the animal`).toBe(true);
        const c = b.getCenter(new Vector3());
        const [hx, hy] = model.anchors.head.center;
        if (o.slot === 'head') expect(c.y, `${s.id} ${o.id} on the head`).toBeGreaterThan(hy);
        if (o.slot === 'face')
          expect(Math.abs(c.x - hx), `${s.id} ${o.id} on the face`).toBeLessThan(0.2);
      }
    }
  });

  it('wears nothing when nothing is chosen, and shares a mesh per look and outfit', () => {
    const m = animalModel('bunny', 'white');
    expect(outfitMesh('bunny|white|false', m.anchors, {})).toBeNull();
    const a = outfitMesh('bunny|white|false', m.anchors, { head: 'party_hat' })!;
    const b = outfitMesh('bunny|white|false', m.anchors, { head: 'party_hat' })!;
    expect(a.geometry).toBe(b.geometry);
  });
});

describe('outfits show (not hidden inside the animal)', () => {
  /** Inside an ellipsoid (center, radii), shrunk a little so surface parts count as outside. */
  const inside = (p: Vector3, c: readonly number[], r: readonly number[], k = 0.98) =>
    ((p.x - c[0]!) / (r[0]! * k)) ** 2 +
      ((p.y - c[1]!) / (r[1]! * k)) ** 2 +
      ((p.z - c[2]!) / (r[2]! * k)) ** 2 <
    1;

  it('most of every outfit is outside the body and head, on every species', () => {
    for (const s of SPECIES) {
      const v = s.variants[0]!.id;
      const { anchors } = animalModel(s.id, v);
      for (const o of OUTFITS) {
        const mesh = outfitMesh(`${s.id}|${v}|false`, anchors, { [o.slot]: o.id })!;
        const pos = mesh.geometry.getAttribute('position');
        let out = 0;
        const p = new Vector3();
        for (let i = 0; i < pos.count; i++) {
          p.fromBufferAttribute(pos, i);
          const hidden =
            inside(p, anchors.body.center, anchors.body.radii) ||
            inside(p, anchors.head.center, anchors.head.radii);
          if (!hidden) out++;
        }
        expect(out / pos.count, `${s.id} ${o.id} shows`).toBeGreaterThan(0.5);
      }
    }
  });

  it('glasses and shades sit right on the eyes, not floating in front of the face', () => {
    for (const s of SPECIES) {
      const v = s.variants[0]!.id;
      const { anchors } = animalModel(s.id, v);
      for (const id of ['round_specs', 'star_shades']) {
        const mesh = outfitMesh(`${s.id}|${v}|false`, anchors, { face: id })!;
        const box = boxOf(mesh.geometry);
        const [l, r] = anchors.eyes;
        const eyesY = (l[1] + r[1]) / 2;
        // Centered on the eyes, within a lens of them in height, and close to the face.
        expect(box.getCenter(new Vector3()).y, `${s.id} ${id} height`).toBeCloseTo(eyesY, 1);
        // (Lenses tilt with the face, so their bottom rim reaches a little forward.)
        expect(box.max.z, `${s.id} ${id} close to the face`).toBeLessThan(
          Math.max(l[2], r[2]) + anchors.eyeRadius * 0.75,
        );
      }
    }
  });

  it('hats sit on top of the head', () => {
    for (const s of SPECIES) {
      const v = s.variants[0]!.id;
      const { anchors } = animalModel(s.id, v);
      const top = anchors.head.center[1] + anchors.head.radii[1] * 0.4;
      for (const id of ['party_hat', 'pet_crown', 'big_bow', 'flower_clip']) {
        const box = boxOf(outfitMesh(`${s.id}|${v}|false`, anchors, { head: id })!.geometry);
        expect(box.getCenter(new Vector3()).y, `${s.id} ${id}`).toBeGreaterThan(top);
      }
    }
  });
});

describe('Dex silhouettes in 3D', () => {
  it('are one dark color with no face, for every species', () => {
    const dark = new Color('#4b4560');
    for (const s of SPECIES) {
      const g = silhouetteModel(s.id).geometry;
      const c = g.getAttribute('color');
      for (let i = 0; i < c.count; i += 7) {
        expect(
          Math.abs(c.getX(i) - dark.r) +
            Math.abs(c.getY(i) - dark.g) +
            Math.abs(c.getZ(i) - dark.b),
          s.id,
        ).toBeLessThan(0.12);
      }
    }
  });
});

describe('the avatar in 3D', () => {
  it('builds with every avatar item, standing on the ground at its height', () => {
    for (const item of AVATAR_ITEMS) {
      const loadout: AvatarLoadout = { ...DEFAULT_LOADOUT, makeup: {}, accessories: [] };
      const slot = item.slot as AvatarSlot;
      if (slot === 'blush' || slot === 'eyeshadow' || slot === 'lips' || slot === 'face') {
        loadout.makeup = { [slot]: item.id };
      } else if (slot === 'hat' || slot === 'glasses' || slot === 'bag' || slot === 'earrings') {
        loadout.accessories = [item.id];
      } else if (slot === 'onePiece') {
        loadout.onePiece = item.id;
        delete loadout.top;
        delete loadout.bottom;
      } else {
        (loadout as unknown as Record<string, string>)[slot] = item.id;
      }
      const box = boxOf(avatarMesh(loadout).geometry);
      expect(box.min.y, item.id).toBeGreaterThanOrEqual(-0.02);
      expect(box.max.y, item.id).toBeLessThan(AVATAR_HEIGHT + 0.25);
      expect(box.max.y, item.id).toBeGreaterThan(1.1);
    }
  });

  it('looks different with different clothes, and the same for the same loadout', () => {
    const a = avatarMesh(DEFAULT_LOADOUT);
    expect(avatarMesh(DEFAULT_LOADOUT).geometry).toBe(a.geometry);
    const b = avatarMesh({ ...DEFAULT_LOADOUT, top: 'top_hoodie' });
    expect(b.geometry).not.toBe(a.geometry);
  });
});
