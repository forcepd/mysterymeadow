import type { CommandResult, Zone } from '../../sim/types';
import { DOOR_RADIUS, doorOf } from '../../game/layout';
import { PX_PER_UNIT, worldToGround, type GroundPoint, type Point3 } from '../coords';
import type { PointerSample, PressHandler } from '../gestures';

/** Press this long on an animal to pet it (DESIGN 8.4); a shorter tap opens its card. */
export const HOLD_MS = 450;
/** A press that drifts this far (CSS px) picks the animal up (drag to the door). */
export const DRAG_SLOP = 18;
/** Drop within this distance of the door (units) to send the animal through it. */
export const DOOR_REACH = DOOR_RADIUS / PX_PER_UNIT;

/** What a press on an animal needs from the world (injected, so it's unit-tested). */
export interface AnimalPressWorld {
  zone: Zone;
  animalId: string;
  select(id: string): void;
  pet(id: string): CommandResult;
  moveToZone(id: string, to: Zone): CommandResult;
  /** The ground under a pointer, or null (looking at the sky). */
  groundAt(p: PointerSample): GroundPoint | null;
  /** The animal being carried (lifted, following the finger). */
  carry: {
    start(): void;
    to(p: GroundPoint): void;
    /** Put down: back home, or (false) it's going through the door. */
    drop(goHome: boolean): void;
    /** The top of its head, for messages. */
    top(): Point3;
  };
  /** Shows where to drop (the door), and whether the animal is close enough. */
  doorHint(state: 'off' | 'far' | 'near'): void;
  say(at: Point3, text: string, color: string): void;
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
}

/**
 * A press on an animal, like the original's: a quick tap (on release) opens its card, holding
 * pets it, and dragging picks it up to carry to the door (the other zone).
 */
export function animalPress(w: AnimalPressWorld, start: PointerSample): PressHandler {
  const startedAt = w.now();
  let held = false;
  let dragging = false;
  const door = worldToGround(doorOf(w.zone));
  const nearDoor = (g: GroundPoint) => Math.hypot(g.x - door.x, g.z - door.z) <= DOOR_REACH;

  const pet = () => {
    held = true;
    const result = w.pet(w.animalId);
    // A pet it just had: it still loved it (no hearts until the cooldown ends).
    if (!result.ok) w.say(w.carry.top(), '💕 Loved that!', '#e0628b');
  };
  const timer = w.setTimer(() => {
    if (!dragging) pet();
  }, HOLD_MS);

  return {
    move(p) {
      // (Unlike the original, a finger that moves after a pet still picks the animal up, so a
      // slow press-then-drag works too.)
      if (!dragging) {
        if (Math.hypot(p.x - start.x, p.y - start.y) <= DRAG_SLOP) return;
        dragging = true;
        w.clearTimer(timer);
        w.carry.start();
      }
      const g = w.groundAt(p);
      if (!g) return;
      w.carry.to(g);
      w.doorHint(nearDoor(g) ? 'near' : 'far');
    },
    up(p) {
      w.clearTimer(timer);
      if (dragging) {
        w.doorHint('off');
        const g = w.groundAt(p);
        if (!g || !nearDoor(g)) {
          w.carry.drop(true);
          return;
        }
        const to: Zone = w.zone === 'yard' ? 'house' : 'yard';
        const result = w.moveToZone(w.animalId, to);
        // Through the door (the move walks it out), or back home with the reason.
        w.carry.drop(!result.ok);
        if (!result.ok) w.say({ x: door.x, y: 1.1, z: door.z }, result.reason, '#a33b22');
        return;
      }
      if (held) return;
      // Held long enough but the timer didn't get to fire (slow frames): still a pet.
      if (w.now() - startedAt >= HOLD_MS) pet();
      else w.select(w.animalId);
    },
    cancel() {
      w.clearTimer(timer);
      if (dragging) {
        w.doorHint('off');
        w.carry.drop(true);
      }
    },
  };
}
