import { describe, expect, it } from 'vitest';
import {
  GestureRecognizer,
  TAP_SLOP,
  type PinchStep,
  type PointerSample,
  type PressHandler,
} from '../../../src/world3d/gestures';

function setup(objectAt?: (p: PointerSample) => boolean) {
  const log: string[] = [];
  const orbits: [number, number][] = [];
  const pinches: PinchStep[] = [];
  const g = new GestureRecognizer({
    pressAt: (p): PressHandler | null =>
      objectAt?.(p)
        ? {
            move: () => log.push('obj:move'),
            up: () => log.push('obj:up'),
            cancel: () => log.push('obj:cancel'),
          }
        : null,
    tap: (p) => log.push(`tap:${p.x},${p.y}`),
    orbit: (dx, dy) => orbits.push([dx, dy]),
    pinch: (step) => pinches.push(step),
  });
  return { g, log, orbits, pinches };
}

const pt = (id: number, x: number, y: number, time = 0): PointerSample => ({ id, x, y, time });

describe('GestureRecognizer', () => {
  it('a press on empty ground that barely moves is a tap (on release)', () => {
    const { g, log, orbits } = setup();
    g.down(pt(1, 100, 100));
    expect(log).toEqual([]);
    g.move(pt(1, 100 + TAP_SLOP - 1, 100));
    g.up(pt(1, 105, 100));
    expect(log).toEqual(['tap:105,100']);
    expect(orbits).toEqual([]);
    expect(g.mode).toBe('idle');
  });

  it('a long still press on empty ground is still a tap', () => {
    const { g, log } = setup();
    g.down(pt(1, 50, 50, 0));
    g.up(pt(1, 50, 50, 3000));
    expect(log).toEqual(['tap:50,50']);
  });

  it('a drag on empty ground orbits and is not a tap', () => {
    const { g, log, orbits } = setup();
    g.down(pt(1, 100, 100));
    g.move(pt(1, 130, 100));
    g.move(pt(1, 150, 90));
    g.up(pt(1, 150, 90));
    expect(log).toEqual([]);
    expect(orbits).toEqual([
      [30, 0],
      [20, -10],
    ]);
  });

  it('a press on an object belongs to the object and never orbits', () => {
    const { g, log, orbits } = setup(() => true);
    g.down(pt(1, 100, 100));
    g.move(pt(1, 300, 100));
    g.up(pt(1, 300, 100));
    expect(log).toEqual(['obj:move', 'obj:up']);
    expect(orbits).toEqual([]);
  });

  it('two fingers pinch: spreading zooms in, and the midpoint pans', () => {
    const { g, pinches, log } = setup();
    g.down(pt(1, 100, 100));
    g.down(pt(2, 200, 100));
    g.move(pt(2, 300, 100));
    expect(pinches).toHaveLength(1);
    expect(pinches[0]!.scale).toBeCloseTo(2);
    expect(pinches[0]!.from).toEqual({ x: 150, y: 100 });
    expect(pinches[0]!.to).toEqual({ x: 200, y: 100 });
    g.up(pt(1, 100, 100));
    g.up(pt(2, 300, 100));
    expect(log).toEqual([]); // no tap from either finger
    expect(g.mode).toBe('idle');
  });

  it('after a pinch, the finger left on the screen does nothing until lifted', () => {
    const { g, orbits, log, pinches } = setup();
    g.down(pt(1, 100, 100));
    g.down(pt(2, 200, 100));
    g.move(pt(2, 260, 100));
    g.up(pt(2, 260, 100));
    g.move(pt(1, 400, 400));
    g.up(pt(1, 400, 400));
    expect(orbits).toEqual([]);
    expect(log).toEqual([]);
    expect(pinches).toHaveLength(1);
    expect(g.mode).toBe('idle');
  });

  it('a second finger on an object press cancels the press and pinches', () => {
    const { g, log, pinches } = setup((p) => p.x < 150);
    g.down(pt(1, 100, 100));
    g.move(pt(1, 110, 100));
    g.down(pt(2, 210, 100));
    g.move(pt(2, 310, 100));
    expect(log).toEqual(['obj:move', 'obj:cancel']);
    // Measured from where the first finger really is (110), not where it started.
    expect(pinches[0]!.scale).toBeCloseTo(2);
    expect(pinches[0]!.from).toEqual({ x: 160, y: 100 });
  });

  it('a third finger is ignored', () => {
    const { g, pinches } = setup();
    g.down(pt(1, 0, 0));
    g.down(pt(2, 100, 0));
    g.down(pt(3, 500, 500));
    g.move(pt(3, 600, 600));
    expect(pinches).toEqual([]);
  });

  it('pointercancel ends an object press without a tap, and resets', () => {
    const { g, log } = setup(() => true);
    g.down(pt(1, 100, 100));
    g.cancel(pt(1, 100, 100));
    expect(log).toEqual(['obj:cancel']);
    expect(g.mode).toBe('idle');
    g.up(pt(1, 100, 100));
    expect(log).toEqual(['obj:cancel']);
  });

  it('pointercancel on empty ground drops the tap', () => {
    const { g, log } = setup();
    g.down(pt(1, 100, 100));
    g.cancel(pt(1, 100, 100));
    g.up(pt(1, 100, 100));
    expect(log).toEqual([]);
  });

  it('ignores moves and lifts from other pointers', () => {
    const { g, log, orbits } = setup();
    g.down(pt(1, 100, 100));
    g.move(pt(7, 500, 500));
    g.up(pt(7, 500, 500));
    expect(orbits).toEqual([]);
    g.up(pt(1, 100, 100));
    expect(log).toEqual(['tap:100,100']);
  });
});
