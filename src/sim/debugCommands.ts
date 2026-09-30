import { ILLNESSES } from '../config/illnesses';
import { SPECIES, getSpecies } from '../config/species';
import type { GameSim } from './GameSim';
import { createAnimal, randomPosition } from './systems/animals';
import { addCoins, addGems } from './systems/economy';
import { rollLitterSize, rollVisitor } from './systems/rarity';
import { makeSick } from './systems/sickness';
import { spawnVisitor } from './systems/visitors';
import { runOnline } from './tick';
import type { CommandResult, Rarity, VisitorRoll } from './types';

/**
 * Dev-only commands for the Debug Panel (DESIGN 21, Phase 2). Only src/dev imports this
 * module, so production builds leave it out.
 */
export interface DebugVisitorOptions {
  rarity?: Rarity;
  speciesId?: string;
  variantId?: string;
  isSparkle?: boolean;
  /** 0 = not pregnant; a number forces that litter size; `true` rolls one. */
  pregnant?: boolean | number;
}

/** A visitor appears at the gate right now, ignoring capacity and Crowded. */
export function debugSpawnVisitor(sim: GameSim, opts: DebugVisitorOptions = {}): CommandResult {
  return sim.debugRun((ctx) => {
    const roll: VisitorRoll = rollVisitor(ctx.rng, ctx.state.world);
    const species = opts.speciesId
      ? getSpecies(opts.speciesId)
      : opts.rarity && opts.rarity !== roll.rarity
        ? ctx.rng.pick(SPECIES.filter((s) => s.rarity === opts.rarity))
        : getSpecies(roll.speciesId);
    if (!species) return { ok: false, reason: `Unknown species "${opts.speciesId}"` };
    if (species.id !== roll.speciesId) {
      roll.speciesId = species.id;
      roll.rarity = species.rarity;
      roll.variantId = ctx.rng.pick(species.variants).id;
    }
    if (opts.variantId) {
      if (!species.variants.some((v) => v.id === opts.variantId)) {
        return { ok: false, reason: `${species.name} has no "${opts.variantId}" variant` };
      }
      roll.variantId = opts.variantId;
    }
    if (opts.isSparkle !== undefined) roll.isSparkle = opts.isSparkle;
    if (opts.pregnant === true) roll.litterSize = rollLitterSize(ctx.rng);
    else if (opts.pregnant === false) roll.litterSize = 0;
    else if (typeof opts.pregnant === 'number') roll.litterSize = opts.pregnant;
    spawnVisitor(ctx, ctx.state.meta.lastSeenAt, roll);
    return { ok: true };
  });
}

export function debugAddCoins(sim: GameSim, amount: number): void {
  sim.debugRun((ctx) => addCoins(ctx, Math.max(amount, -ctx.state.world.coins)));
}

export function debugAddGems(sim: GameSim, amount: number): void {
  sim.debugRun((ctx) => addGems(ctx, Math.max(amount, -ctx.state.world.gems)));
}

/**
 * Plays forward to the clock's time as if the player were watching (online rules), even across
 * a long gap. Call after jumping the game clock forward.
 */
export function debugRunOnline(sim: GameSim): void {
  sim.debugRun((ctx, clockNow) => runOnline(ctx, clockNow));
}

/** Sets every animal's needs (e.g. make everyone hungry to test feeding and care prices). */
export function debugSetNeeds(sim: GameSim, hunger: number, happiness: number): void {
  sim.debugRun((ctx) => {
    for (const a of ctx.state.world.animals) a.needs = { hunger, happiness };
  });
}

/**
 * Makes healthy animals sick with `illnessId` (or a random illness): just one (the first
 * healthy one, or `animalId`) or all of them. Returns how many got sick.
 */
export function debugMakeSick(
  sim: GameSim,
  opts: { illnessId?: string; all?: boolean; animalId?: string; tricky?: boolean } = {},
): number {
  return sim.debugRun((ctx) => {
    const now = ctx.state.meta.lastSeenAt;
    const healthy = ctx.state.world.animals.filter(
      (a) => !a.sickness && (!opts.animalId || a.id === opts.animalId),
    );
    const targets = opts.all ? healthy : healthy.slice(0, 1);
    for (const animal of targets) {
      const first = opts.illnessId ?? ctx.rng.pick(ILLNESSES).id;
      // A tricky case (DESIGN 9.5 step 6) at any house tier, for testing.
      const second = opts.tricky
        ? ctx.rng.pick(ILLNESSES.filter((i) => i.id !== first)).id
        : undefined;
      makeSick(ctx, animal, first, now, second);
    }
    return targets.length;
  });
}

/** Cures every animal instantly (no immunity, no vet). */
export function debugCureAll(sim: GameSim): void {
  sim.debugRun((ctx) => {
    for (const a of ctx.state.world.animals) delete a.sickness;
  });
}

/** The parent setting (Parent Mode arrives in Phase 8). */
export function debugSetSicknessEnabled(sim: GameSim, enabled: boolean): void {
  sim.debugRun((ctx) => {
    ctx.state.world.settings.sicknessEnabled = enabled;
  });
}

/** Puts `n` random kept pets straight into Pet Storage (as much as fits). Returns how many. */
export function debugAddStoredPets(sim: GameSim, n: number): number {
  return sim.debugRun((ctx) => {
    const world = ctx.state.world;
    const now = ctx.state.meta.lastSeenAt;
    const room = sim.petStorage().free;
    const count = Math.min(n, room);
    for (let i = 0; i < count; i++) {
      const roll = rollVisitor(ctx.rng, world);
      const animal = createAnimal(ctx, {
        ...roll,
        zone: 'yard',
        position: randomPosition(ctx),
        at: now,
        isBaby: false,
        litterSize: 0,
      });
      animal.isKept = true;
      world.petStorage.push({ animal, storedAt: now });
    }
    return count;
  });
}

/** Adds items to the inventory for free (e.g. `{ bed_basic: 3 }`), ready to place. */
export function debugGiveItems(sim: GameSim, items: Record<string, number>): void {
  sim.debugRun((ctx) => {
    const inv = ctx.state.world.inventory;
    for (const [id, n] of Object.entries(items)) inv[id] = (inv[id] ?? 0) + n;
  });
}
