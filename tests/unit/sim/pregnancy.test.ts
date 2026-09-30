import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { getSpecies } from '../../../src/config/species';
import type { Animal } from '../../../src/sim/types';
import {
  MIN,
  SEC,
  START,
  edit,
  fillAnimals,
  makeAnimal,
  makeVisitor,
  newSim,
  play,
} from './helpers';

const GESTATION = BALANCE.pregnancy.gestationMinutes * MIN;

function withMother(litterSize: number, mother: Partial<Animal> = {}, others = 0) {
  return edit(newSim(), (s) => {
    fillAnimals(s, others, { holdUntil: START + 99 * MIN });
    s.world.animals.push(
      makeAnimal(s, {
        id: 'mom',
        pregnancy: { birthAt: START + GESTATION, litterSize },
        ...mother,
      }),
    );
  });
}

describe('pregnancy and birth (DESIGN 7.3)', () => {
  it('a pregnant visitor gives birth 3 minutes after arriving', () => {
    const h = edit(newSim(), (s) =>
      s.world.gateQueue.push(makeVisitor(s, { litterSize: 3 }, { revealed: true })),
    );
    play(h, SEC);
    const mom = h.sim.state.world.animals[0]!;
    expect(mom.pregnancy).toEqual({ birthAt: START + SEC + GESTATION, litterSize: 3 });
    expect(h.sim.badges(mom.id)).toContain('pregnant');

    const born = vi.fn();
    h.sim.events.on('animalBorn', born);
    play(h, GESTATION - SEC);
    expect(born).not.toHaveBeenCalled();
    play(h, SEC);
    expect(born).toHaveBeenCalledTimes(1);
    expect(born.mock.calls[0]![0].babies).toHaveLength(3);
    expect(h.sim.getAnimal(mom.id)!.pregnancy).toBeUndefined();
    expect(h.sim.animalCount()).toBe(4);
  });

  it('a non-pregnant visitor has no pregnancy', () => {
    const h = edit(newSim(), (s) => s.world.gateQueue.push(makeVisitor(s, {}, { revealed: true })));
    play(h, SEC);
    expect(h.sim.state.world.animals[0]!.pregnancy).toBeUndefined();
  });

  it('babies match the mother, start their own timers, and are never pregnant', () => {
    const h = withMother(5, {
      speciesId: 'fox',
      variantId: 'red',
      rarity: 'uncommon',
      zone: 'house',
    });
    play(h, GESTATION);
    const babies = h.sim.state.world.animals.filter((a) => a.id !== 'mom');
    expect(babies).toHaveLength(5);
    const birth = START + GESTATION;
    for (const b of babies) {
      expect(b.speciesId).toBe('fox');
      expect(b.rarity).toBe('uncommon');
      expect(b.zone).toBe('house');
      expect(b.bornAt).toBe(birth);
      expect(b.arrivedAt).toBe(birth);
      expect(b.holdUntil).toBe(birth + BALANCE.holdMinutes * MIN);
      expect(b.grownAt).toBe(birth + BALANCE.babyGrowMinutes * MIN);
      expect(b.pregnancy).toBeUndefined();
      expect(b.position.x).toBeGreaterThanOrEqual(0);
      expect(b.position.x).toBeLessThanOrEqual(1);
      expect(h.sim.badges(b.id)).toEqual(['new', 'baby']);
    }
  });

  it('a litter of 5 at capacity is born anyway and makes the yard Crowded', () => {
    const h = withMother(5, {}, 5);
    expect(h.sim.animalCount()).toBe(6);
    expect(h.sim.freeCapacity()).toBe(0);
    const crowded = vi.fn();
    h.sim.events.on('crowdedChanged', crowded);
    play(h, GESTATION);
    expect(h.sim.animalCount()).toBe(11);
    expect(h.sim.isCrowded()).toBe(true);
    expect(crowded).toHaveBeenCalledWith({ crowded: true });
  });

  it('babies grow up after 20 minutes', () => {
    const h = withMother(1);
    play(h, GESTATION);
    const baby = h.sim.state.world.animals.find((a) => a.id !== 'mom')!;
    const grew = vi.fn();
    h.sim.events.on('animalGrew', grew);
    play(h, BALANCE.babyGrowMinutes * MIN - SEC);
    expect(grew).not.toHaveBeenCalled();
    expect(h.sim.badges(baby.id)).toContain('baby');
    play(h, SEC);
    expect(grew).toHaveBeenCalledTimes(1);
    expect(h.sim.badges(baby.id)).not.toContain('baby');
  });

  it('keeps the mother color about 70% of the time (counting random rolls that match)', () => {
    let same = 0;
    let total = 0;
    const variants = getSpecies('kitten')!.variants.length;
    for (let seed = 1; total < 20_000; seed++) {
      const run = edit(newSim(seed), (s) => {
        s.world.animals.push(
          makeAnimal(s, {
            speciesId: 'kitten',
            variantId: 'black',
            pregnancy: { birthAt: START + SEC, litterSize: 5 },
          }),
        );
      });
      play(run, SEC);
      for (const b of run.sim.state.world.animals.filter((a) => a.bornAt !== undefined)) {
        total++;
        if (b.variantId === 'black') same++;
      }
    }
    const keep = BALANCE.pregnancy.babyKeepsMotherColor;
    expect(same / total).toBeCloseTo(keep + (1 - keep) / variants, 1);
  });

  it('a Sparkle mother gives each baby a 25% Sparkle chance; others use the normal chance', () => {
    const rate = (isSparkle: boolean) => {
      let sparkles = 0;
      let total = 0;
      for (let seed = 1; total < 20_000; seed++) {
        const run = edit(newSim(seed), (s) => {
          s.world.animals.push(
            makeAnimal(s, { isSparkle, pregnancy: { birthAt: START + SEC, litterSize: 5 } }),
          );
        });
        play(run, SEC);
        for (const b of run.sim.state.world.animals.filter((a) => a.bornAt !== undefined)) {
          total++;
          if (b.isSparkle) sparkles++;
        }
      }
      return sparkles / total;
    };
    expect(rate(true)).toBeCloseTo(BALANCE.pregnancy.sparkleInheritChance, 1);
    expect(Math.abs(rate(false) - BALANCE.rarity.sparkleChance)).toBeLessThan(0.006);
  });
});

describe('hold timer (DESIGN 7.4)', () => {
  it('announces ready-to-sell exactly once when the hold ends', () => {
    const h = edit(newSim(), (s) => s.world.gateQueue.push(makeVisitor(s, {}, { revealed: true })));
    play(h, SEC);
    const animal = h.sim.state.world.animals[0]!;
    const ready = vi.fn();
    h.sim.events.on('readyToSell', ready);
    play(h, BALANCE.holdMinutes * MIN - SEC);
    expect(ready).not.toHaveBeenCalled();
    expect(h.sim.canSell(animal.id).ok).toBe(false);
    play(h, SEC);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(h.sim.canSell(animal.id).ok).toBe(true);
    expect(h.sim.badges(animal.id)).toContain('readyToSell');
    play(h, 5 * MIN);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('shows the New badge for the first 60 seconds only', () => {
    const h = edit(newSim(), (s) => s.world.gateQueue.push(makeVisitor(s, {}, { revealed: true })));
    play(h, SEC);
    const id = h.sim.state.world.animals[0]!.id;
    expect(h.sim.badges(id)).toContain('new');
    play(h, BALANCE.newBadgeSeconds * SEC - SEC);
    expect(h.sim.badges(id)).toContain('new');
    play(h, SEC);
    expect(h.sim.badges(id)).not.toContain('new');
  });
});
