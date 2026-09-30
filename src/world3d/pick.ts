import type { Object3D } from 'three';
import type { ViewZone } from './coords';

export type PickKind = 'animal' | 'visitor' | 'bowl' | 'poop' | 'find' | 'item';

/** Something in the world that can be tapped. */
export interface Pickable {
  kind: PickKind;
  id: string;
  zone: ViewZone;
  /** Its root in the scene (its position is on the ground). */
  object: Object3D;
  /** Its current height (units), for projecting its middle. */
  height: number;
}

/** Key for a pickable, as stored on its tap volume (`userData.pickKey`). */
export const pickKey = (kind: PickKind, id: string) => `${kind}:${id}`;
