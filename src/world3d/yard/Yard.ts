import { Group, Mesh, type Material } from 'three';
import { BALANCE } from '../../config/balance';
import { HOUSE_COLORS } from '../../config/houseColors';
import type { SimState } from '../../sim/types';
import { buildHouse, type HouseTier } from './house';
import { buildYardScenery } from './scenery';

/** The yard zone's scenery: the static yard plus the house, rebuilt when its look changes. */
export class Yard {
  readonly group = new Group();
  private house: Mesh | null = null;
  private houseLook = '';

  constructor() {
    this.group.name = 'yard';
    this.group.add(buildYardScenery().group);
  }

  /** Keeps the house in the saved exterior color and the current tier's style. */
  sync(world: SimState['world']): void {
    const color = (HOUSE_COLORS.find((c) => c.id === world.house.exteriorColor) ?? HOUSE_COLORS[0]!)
      .color;
    const tier = Math.max(
      0,
      BALANCE.houseTiers.findIndex((t) => t.id === world.house.tierId),
    ) as HouseTier;
    const look = `${color}|${tier}`;
    if (look === this.houseLook) return;
    this.houseLook = look;
    if (this.house) dispose(this.house);
    this.house = buildHouse(color, Math.min(tier, 3) as HouseTier);
    this.group.add(this.house);
  }
}

function dispose(mesh: Mesh): void {
  mesh.removeFromParent();
  mesh.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    (o.material as Material).dispose();
  });
}
