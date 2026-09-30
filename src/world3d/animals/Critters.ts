import { Mesh, MeshBasicMaterial, RingGeometry, type Group, type Object3D } from 'three';
import { appBus } from '../../bridge/appBus';
import type { GameSession } from '../../bridge/gameSession';
import { getTrick } from '../../config/tricks';
import { doorOf, GATE_ENTRY, gateSlot, zoneToWorld } from '../../game/layout';
import { COLORS } from '../../game/constants';
import { worldToGround, type GroundPoint, type ViewZone } from '../coords';
import { AnimalActor, type FrameContext } from './AnimalActor';
import { VisitorActor } from './VisitorActor';

export type PickKind = 'animal' | 'visitor';

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

type Spawn = { at: GroundPoint; kind: 'walk' | 'pop' };

const door = (zone: ViewZone) => worldToGround(doorOf(zone));

/**
 * All the animals and mystery visitors in the 3D world, kept in step with the sim like the
 * original's zone scenes: every frame they reconcile with sim state, and sim events only add
 * flourishes (walking in from the gate, popping in at birth, waving goodbye after a sale).
 */
export class Critters {
  private readonly animals = new Map<string, { actor: AnimalActor; zone: ViewZone }>();
  private readonly visitors = new Map<string, VisitorActor>();
  /** Actors on their way out (goodbye, through a door, up the path): updated until gone. */
  private readonly departing = new Set<AnimalActor | VisitorActor>();
  private readonly spawnFrom = new Map<string, Spawn>();
  private readonly sold = new Set<string>();
  private readonly stored = new Set<string>();
  private readonly exiting = new Set<string>();
  private readonly leftGate = new Set<string>();
  private readonly ring: Mesh;
  private selectedId: string | null = null;
  private readonly offs: (() => void)[] = [];
  private now = 0;
  private reducedMotion = false;

  constructor(
    private readonly session: GameSession,
    private readonly zones: Record<ViewZone, Group>,
    private readonly random: () => number = Math.random,
  ) {
    this.ring = new Mesh(
      new RingGeometry(0.44, 0.54, 40),
      new MeshBasicMaterial({
        color: COLORS.select,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.ring.visible = false;
    this.ring.raycast = () => {};

    const { events } = session.sim;
    this.offs.push(
      events.on('visitorEntered', ({ visitorId, animal }) => {
        const from = this.visitors.get(visitorId);
        this.spawnFrom.set(animal.id, {
          at: from ? { ...from.position } : worldToGround(GATE_ENTRY),
          kind: 'walk',
        });
      }),
      events.on('visitorLeft', ({ visitor }) => this.leftGate.add(visitor.id)),
      events.on('animalBorn', ({ mother, babies }) => {
        const mom = this.animals.get(mother.id);
        const at = mom ? { ...mom.actor.position } : this.home(mother.zone, mother.position);
        for (const baby of babies) this.spawnFrom.set(baby.id, { at, kind: 'pop' });
      }),
      events.on('animalSold', ({ animal }) => this.sold.add(animal.id)),
      events.on('petStored', ({ animal }) => this.stored.add(animal.id)),
      events.on('animalMovedZone', ({ animal, from, to }) => {
        if (from !== to) this.exiting.add(animal.id);
        this.spawnFrom.set(animal.id, { at: door(to), kind: 'walk' });
      }),
      // Back from Storage: pops out of the door.
      events.on('petRetrieved', ({ animal }) =>
        this.spawnFrom.set(animal.id, { at: door(animal.zone), kind: 'pop' }),
      ),
      events.on('trickPerformed', ({ animal, trickId }) => {
        const move = getTrick(trickId)?.move ?? 'jump';
        this.animals.get(animal.id)?.actor.perform(move, this.now, this.reducedMotion);
      }),
      appBus.on('selectAnimal', ({ id }) => {
        this.selectedId = id;
      }),
    );
  }

  /** The selection ring (add it to the scene once). */
  get selectionRing(): Mesh {
    return this.ring;
  }

  /** Everything tappable right now (not leaving). */
  *pickables(): Iterable<Pickable> {
    for (const [id, { actor, zone }] of this.animals) {
      if (actor.isLeaving) continue;
      yield { kind: 'animal', id, zone, object: actor.root, height: actor.height };
    }
    for (const [id, actor] of this.visitors) {
      if (actor.isLeaving) continue;
      yield { kind: 'visitor', id, zone: 'yard', object: actor.root, height: actor.height };
    }
  }

  get(kind: PickKind, id: string): Pickable | undefined {
    for (const p of this.pickables()) if (p.kind === kind && p.id === id) return p;
    return undefined;
  }

  /** Brings every actor in line with the sim and moves them along. */
  update(ctx: FrameContext, zone: ViewZone): void {
    this.now = ctx.now;
    this.reducedMotion = ctx.reducedMotion;
    this.reconcileVisitors(ctx);
    this.reconcileAnimals(ctx);
    for (const { actor } of this.animals.values()) actor.update(ctx);
    for (const actor of this.visitors.values()) actor.update(ctx);
    for (const actor of this.departing) actor.update(ctx);

    const selected = this.selectedId ? this.animals.get(this.selectedId) : undefined;
    this.ring.visible = !!selected && selected.zone === zone && !selected.actor.isLeaving;
    if (selected && this.ring.visible) {
      const p = selected.actor.position;
      this.ring.position.set(p.x, 0.02, p.z);
      this.ring.scale.setScalar(Math.max(0.7, selected.actor.height / 0.9));
    }
  }

  dispose(): void {
    this.offs.forEach((off) => off());
    for (const { actor } of this.animals.values()) actor.dispose();
    for (const actor of this.visitors.values()) actor.dispose();
    for (const actor of this.departing) actor.dispose();
    this.ring.geometry.dispose();
    (this.ring.material as MeshBasicMaterial).dispose();
  }

  private home(zone: ViewZone, position: { x: number; y: number }): GroundPoint {
    return worldToGround(zoneToWorld(zone, position));
  }

  private reconcileAnimals(ctx: FrameContext): void {
    const { sim } = this.session;
    const present = new Set<string>();
    for (const animal of sim.state.world.animals) {
      present.add(animal.id);
      const home = this.home(animal.zone, animal.position);
      let entry = this.animals.get(animal.id);
      // Moved to the other zone: this one walks out through its door; a new one comes in.
      if (entry && entry.zone !== animal.zone) {
        this.depart(animal.id, entry.actor, entry.zone);
        entry = undefined;
      }
      if (!entry) {
        const from = this.spawnFrom.get(animal.id);
        this.spawnFrom.delete(animal.id);
        this.exiting.delete(animal.id);
        const actor = new AnimalActor(
          animal.id,
          `animal:${animal.id}`,
          from?.at ?? home,
          home,
          ctx.now,
          this.random,
        );
        entry = { actor, zone: animal.zone };
        this.animals.set(animal.id, entry);
        this.zones[animal.zone].add(actor.root);
        // Looks (e.g. baby size) before any entrance, which animates toward them.
        actor.sync(animal, sim.badges(animal.id), from?.at ?? home, ctx.now, true);
        if (from?.kind === 'pop') actor.popIn(ctx.now, ctx.reducedMotion);
        if (from) actor.walkTo(home, ctx.now, ctx.reducedMotion);
      }
      entry.actor.sync(animal, sim.badges(animal.id), home, ctx.now, ctx.reducedMotion);
    }
    for (const [id, { actor, zone }] of this.animals) {
      if (present.has(id)) continue;
      this.depart(id, actor, zone);
    }
  }

  /** Sends an actor on its way out, by the right exit. */
  private depart(id: string, actor: AnimalActor, zone: ViewZone): void {
    this.animals.delete(id);
    if (this.selectedId === id && !this.session.sim.getAnimal(id)) this.selectedId = null;
    const done = () => {
      this.departing.delete(actor);
      actor.dispose();
    };
    if (this.exiting.delete(id)) {
      this.departing.add(actor);
      actor.exitThrough(door(zone), this.now, this.reducedMotion, done);
    } else if (this.sold.delete(id) || this.stored.delete(id)) {
      this.departing.add(actor);
      actor.goodbye(this.now, done);
    } else {
      actor.dispose();
    }
  }

  private reconcileVisitors(ctx: FrameContext): void {
    const queued = new Set<string>();
    this.session.sim.state.world.gateQueue.forEach((visitor, i) => {
      queued.add(visitor.id);
      const slot = worldToGround(gateSlot(i));
      let actor = this.visitors.get(visitor.id);
      if (!actor) {
        actor = new VisitorActor(visitor.id, `visitor:${visitor.id}`, slot);
        this.visitors.set(visitor.id, actor);
        this.zones.yard.add(actor.root);
      }
      actor.sync(visitor, slot, ctx.now, ctx.reducedMotion);
    });
    for (const [id, actor] of this.visitors) {
      if (queued.has(id)) continue;
      this.visitors.delete(id);
      if (this.leftGate.delete(id)) {
        this.departing.add(actor);
        actor.leave(ctx.now, () => {
          this.departing.delete(actor);
          actor.dispose();
        });
      } else {
        // Walked in: the animal takes over from here.
        actor.dispose();
      }
    }
  }
}
