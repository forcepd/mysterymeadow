import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../../../src/config/balance';
import { HOUR, SEC, START, edit, makeAnimal, newSim, play } from './helpers';

describe('wander (DESIGN 12.4 timer, in-zone for now)', () => {
  it('moves an animal to a new spot when its wander timer is up, then reschedules 60-120 s later', () => {
    const h = edit(newSim(), (s) =>
      s.world.animals.push(makeAnimal(s, { id: 'w', nextWanderAt: START + 5 * SEC })),
    );
    const before = { ...h.sim.getAnimal('w')!.position };
    play(h, 4 * SEC);
    expect(h.sim.getAnimal('w')!.position).toEqual(before);
    play(h, SEC);
    const a = h.sim.getAnimal('w')!;
    expect(a.position).not.toEqual(before);
    expect(a.position.x).toBeGreaterThanOrEqual(0);
    expect(a.position.x).toBeLessThanOrEqual(1);
    const wait = a.nextWanderAt - (START + 5 * SEC);
    expect(wait).toBeGreaterThanOrEqual(BALANCE.wander.minSeconds * SEC);
    expect(wait).toBeLessThanOrEqual(BALANCE.wander.maxSeconds * SEC);
  });

  it('does not wander while offline', () => {
    const h = edit(newSim(), (s) =>
      s.world.animals.push(makeAnimal(s, { id: 'w', nextWanderAt: START + 5 * SEC })),
    );
    const before = { ...h.sim.getAnimal('w')!.position };
    h.clock.advance(HOUR);
    h.sim.catchUp();
    expect(h.sim.getAnimal('w')!.position).toEqual(before);
  });
});

describe('changed event', () => {
  it('fires when a tick runs or a command is called, not when nothing happened', () => {
    const h = newSim();
    const changed = vi.fn();
    h.sim.events.on('changed', changed);
    h.clock.advance(500);
    h.sim.update();
    expect(changed).not.toHaveBeenCalled();
    h.clock.advance(500);
    h.sim.update();
    expect(changed).toHaveBeenCalledTimes(1);
    h.sim.sell('nobody');
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
