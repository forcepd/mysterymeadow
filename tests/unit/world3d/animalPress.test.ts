import { describe, expect, it } from 'vitest';
import { HOUSE_DOOR, INSIDE_DOOR } from '../../../src/game/layout';
import type { CommandResult, Zone } from '../../../src/sim/types';
import {
  animalPress,
  DOOR_REACH,
  DRAG_SLOP,
  HOLD_MS,
  type AnimalPressWorld,
} from '../../../src/world3d/animals/animalPress';
import { worldToGround, type GroundPoint } from '../../../src/world3d/coords';
import type { PointerSample } from '../../../src/world3d/gestures';

/** A fake world: screen px map straight onto the ground (1 px = 0.01 units, origin anywhere). */
function setup(zone: Zone = 'yard', results: { pet?: CommandResult; move?: CommandResult } = {}) {
  const log: string[] = [];
  let now = 0;
  const timers: { at: number; fn: () => void; live: boolean }[] = [];
  const world: AnimalPressWorld = {
    zone,
    animalId: 'a1',
    select: (id) => log.push(`select ${id}`),
    pet: (id) => {
      log.push(`pet ${id}`);
      return results.pet ?? { ok: true };
    },
    moveToZone: (id, to) => {
      log.push(`move ${id} ${to}`);
      return results.move ?? { ok: true };
    },
    groundAt: (p) => ({ x: p.x / 100, z: p.y / 100 }),
    carry: {
      start: () => log.push('pick up'),
      to: () => {},
      drop: (home) => log.push(home ? 'put down' : 'through the door'),
      top: () => ({ x: 0, y: 1, z: 0 }),
    },
    doorHint: (state) => log.push(`door ${state}`),
    say: (_at, text) => log.push(`say ${text}`),
    now: () => now,
    setTimer: (fn, ms) => {
      const t = { at: now + ms, fn, live: true };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => {
      (t as { live: boolean }).live = false;
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers) {
      if (t.live && t.at <= now) {
        t.live = false;
        t.fn();
      }
    }
  };
  const at = (g: GroundPoint): PointerSample => ({ id: 1, x: g.x * 100, y: g.z * 100, time: now });
  return { world, log, advance, at, setNow: (n: number) => (now = n) };
}

const doorIn = (zone: Zone) => worldToGround(zone === 'yard' ? HOUSE_DOOR : INSIDE_DOOR);

describe('pressing an animal', () => {
  it('a quick tap (on release) opens its card', () => {
    const { world, log, advance } = setup();
    const press = animalPress(world, { id: 1, x: 100, y: 100, time: 0 });
    advance(120);
    press.up({ id: 1, x: 102, y: 101, time: 120 });
    expect(log).toEqual(['select a1']);
    advance(1000);
    expect(log).toEqual(['select a1']); // The hold timer never fires after release.
  });

  it('holding pets it, once, and the release is not a tap', () => {
    const { world, log, advance } = setup();
    const press = animalPress(world, { id: 1, x: 100, y: 100, time: 0 });
    advance(HOLD_MS - 1);
    expect(log).toEqual([]);
    advance(1);
    expect(log).toEqual(['pet a1']);
    advance(500);
    press.up({ id: 1, x: 100, y: 100, time: 0 });
    expect(log).toEqual(['pet a1']);
  });

  it('petting too soon still shows it loved that', () => {
    const { world, log, advance } = setup('yard', { pet: { ok: false, reason: 'cooldown' } });
    animalPress(world, { id: 1, x: 100, y: 100, time: 0 });
    advance(HOLD_MS);
    expect(log).toEqual(['pet a1', 'say 💕 Loved that!']);
  });

  it('a long press whose timer was late (slow frames) still pets instead of tapping', () => {
    const { world, log, setNow } = setup();
    const press = animalPress(world, { id: 1, x: 100, y: 100, time: 0 });
    setNow(HOLD_MS + 50); // The timer hasn't run yet.
    press.up({ id: 1, x: 100, y: 100, time: 0 });
    expect(log).toEqual(['pet a1']);
  });

  it('a small wiggle is still a tap; past the slop it picks the animal up', () => {
    const { world, log } = setup();
    const press = animalPress(world, { id: 1, x: 100, y: 100, time: 0 });
    press.move({ id: 1, x: 100 + DRAG_SLOP, y: 100, time: 10 });
    press.up({ id: 1, x: 100 + DRAG_SLOP, y: 100, time: 20 });
    expect(log).toEqual(['select a1']);

    const b = setup();
    const drag = animalPress(b.world, { id: 1, x: 100, y: 100, time: 0 });
    drag.move({ id: 1, x: 100 + DRAG_SLOP + 1, y: 100, time: 10 });
    expect(b.log[0]).toBe('pick up');
    b.advance(HOLD_MS * 2);
    expect(b.log).not.toContain('pet a1'); // Carrying cancels the hold.
  });

  for (const zone of ['yard', 'house'] as Zone[]) {
    it(`dropped at the ${zone} door, it goes through (with the door glowing on the way)`, () => {
      const { world, log, at } = setup(zone);
      const door = doorIn(zone);
      const press = animalPress(world, at({ x: door.x + 3, z: door.z + 2 }));
      press.move(at({ x: door.x + 1.5, z: door.z + 1 }));
      press.move(at({ x: door.x + 0.2, z: door.z }));
      press.up(at({ x: door.x + 0.2, z: door.z }));
      const other = zone === 'yard' ? 'house' : 'yard';
      expect(log).toEqual([
        'pick up',
        'door far',
        'door near',
        'door off',
        `move a1 ${other}`,
        'through the door',
      ]);
    });
  }

  it('dropped away from the door, it goes back home', () => {
    const { world, log, at } = setup();
    const door = doorIn('yard');
    const press = animalPress(world, at({ x: door.x + 4, z: door.z + 2 }));
    press.move(at({ x: door.x + DOOR_REACH + 0.5, z: door.z }));
    press.up(at({ x: door.x + DOOR_REACH + 0.5, z: door.z }));
    expect(log).toEqual(['pick up', 'door far', 'door off', 'put down']);
  });

  it('when the other side has no room, it says why and goes home', () => {
    const { world, log, at } = setup('yard', { move: { ok: false, reason: 'No free bed inside' } });
    const door = doorIn('yard');
    const press = animalPress(world, at({ x: door.x + 3, z: door.z }));
    press.move(at(door));
    press.up(at(door));
    expect(log.slice(-3)).toEqual(['move a1 house', 'put down', 'say No free bed inside']);
  });

  it('a slow press-then-drag picks it up even after petting', () => {
    const { world, log, advance, at } = setup();
    const door = doorIn('yard');
    const press = animalPress(world, at({ x: door.x + 3, z: door.z }));
    advance(HOLD_MS);
    press.move(at({ x: door.x + 2, z: door.z }));
    press.up(at(door));
    expect(log).toEqual([
      'pet a1',
      'pick up',
      'door far',
      'door off',
      'move a1 house',
      'through the door',
    ]);
  });

  it('cancelled (second finger or the browser) while carried: put back down', () => {
    const { world, log } = setup();
    const press = animalPress(world, { id: 1, x: 0, y: 0, time: 0 });
    press.move({ id: 1, x: 200, y: 0, time: 5 });
    press.cancel();
    expect(log.slice(-2)).toEqual(['door off', 'put down']);
  });
});
