import { describe, expect, it } from 'vitest';
import { displayName, formatCountdown, inMinutes, speciesName } from '../../src/bridge/describe';
import { TOASTS } from '../../src/bridge/toasts';
import { makeAnimal, makeVisitor, newSim } from './sim/helpers';

describe('inMinutes', () => {
  it('rounds up, says minute or minutes, and "Now" when the wait is over', () => {
    expect(inMinutes(5 * 60_000)).toBe('In 5 minutes');
    expect(inMinutes(4 * 60_000 + 1)).toBe('In 5 minutes');
    expect(inMinutes(30_000)).toBe('In 1 minute');
    expect(inMinutes(0)).toBe('Now');
    expect(inMinutes(-1000)).toBe('Now');
  });
});

describe('formatCountdown', () => {
  it.each([
    [0, '0:00'],
    [-500, '0:00'],
    [1, '0:01'],
    [999, '0:01'],
    [1000, '0:01'],
    [59_001, '1:00'],
    [272_000, '4:32'],
    [600_000, '10:00'],
    [3_723_000, '1:02:03'],
  ])('%i ms -> %s', (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });
});

describe('names', () => {
  it('shows the name, or the species name when unnamed', () => {
    const state = newSim().sim.toState();
    expect(displayName(makeAnimal(state, { speciesId: 'red_panda' }))).toBe('Red Panda');
    expect(displayName(makeAnimal(state, { name: 'Biscuit' }))).toBe('Biscuit');
    expect(speciesName('nope')).toBe('Animal');
  });
});

describe('toasts (DESIGN 17.4)', () => {
  const state = newSim().sim.toState();
  const mom = makeAnimal(state, { name: 'Biscuit' });

  it('uses the spec wording', () => {
    expect(TOASTS.visitorArrived!({ visitor: makeVisitor(state) })?.text).toBe(
      'A mystery visitor is here!',
    );
    expect(TOASTS.animalBorn!({ mother: mom, babies: [mom, mom, mom] })?.text).toBe(
      'Biscuit had 3 babies!',
    );
    expect(TOASTS.animalBorn!({ mother: mom, babies: [mom] })?.text).toBe('Biscuit had a baby!');
    expect(TOASTS.readyToSell!({ animal: mom })?.text).toBe('Biscuit is ready to sell!');
    expect(TOASTS.crowdedChanged!({ crowded: true })?.text).toBe('Your yard is crowded!');
    expect(TOASTS.animalSold!({ animal: mom, price: 45 })?.text).toBe(
      'Biscuit went to a loving new home! +45',
    );
    expect(TOASTS.animalSick!({ animal: mom, illnessId: 'sniffles' })).toEqual({
      icon: '🤧',
      text: 'Oh no, Biscuit looks sick!',
    });
    expect(TOASTS.clinicReady!({ animal: mom })?.text).toBe('The vet is ready to see Biscuit!');
    expect(TOASTS.animalCured!({ animal: mom, illnessId: 'sniffles' })?.text).toBe(
      'Biscuit is all better!',
    );
  });

  it('summarizes the time away, or says nothing if nothing happened', () => {
    const base = {
      awayMs: 1,
      simulatedMs: 1,
      visitorsWaiting: 0,
      babiesBorn: 0,
      grewUp: 0,
      readyToSell: 0,
    };
    expect(TOASTS.caughtUp!(base)).toBeNull();
    expect(TOASTS.caughtUp!({ ...base, visitorsWaiting: 2, babiesBorn: 1 })?.text).toBe(
      'Welcome back! 2 visitors are waiting and 1 baby was born.',
    );
    // A longer break shows the "While you were away" card instead.
    expect(TOASTS.caughtUp!({ ...base, awayMs: 3_600_000, visitorsWaiting: 2 })).toBeNull();
  });

  it('every toast has an icon and short text', () => {
    expect(TOASTS.visitorLeft!({ visitor: makeVisitor(state) })?.icon).toBeTruthy();
    for (const make of Object.values(TOASTS)) expect(typeof make).toBe('function');
  });
});
