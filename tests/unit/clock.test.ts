import { describe, expect, it } from 'vitest';
import { FakeClock, ScaledClock, systemClock } from '../../src/sim/clock';

describe('systemClock', () => {
  it('reports wall-clock time', () => {
    const before = Date.now();
    const t = systemClock.now();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now());
  });
});

describe('FakeClock', () => {
  it('starts at the given time (default 0) and does not move by itself', () => {
    expect(new FakeClock().now()).toBe(0);
    const clock = new FakeClock(1000);
    expect(clock.now()).toBe(1000);
    expect(clock.now()).toBe(1000);
  });

  it('advances and sets forward', () => {
    const clock = new FakeClock(1000);
    clock.advance(500);
    expect(clock.now()).toBe(1500);
    clock.advance(0);
    expect(clock.now()).toBe(1500);
    clock.set(5000);
    expect(clock.now()).toBe(5000);
  });

  it('refuses to go backwards or take non-finite input', () => {
    const clock = new FakeClock(1000);
    expect(() => clock.advance(-1)).toThrow();
    expect(() => clock.advance(Number.NaN)).toThrow();
    expect(() => clock.set(999)).toThrow();
    expect(() => clock.set(Infinity)).toThrow();
    expect(clock.now()).toBe(1000);
  });
});

describe('ScaledClock', () => {
  it('starts in sync with its source', () => {
    const source = new FakeClock(10_000);
    expect(new ScaledClock(source, 60).now()).toBe(10_000);
  });

  it('runs at scale x the source rate', () => {
    const source = new FakeClock(0);
    const clock = new ScaledClock(source, 60);
    source.advance(1000);
    expect(clock.now()).toBe(60_000);
  });

  it('re-anchors on scale change so time never jumps or goes backwards', () => {
    const source = new FakeClock(0);
    const clock = new ScaledClock(source, 10);
    source.advance(1000);
    expect(clock.now()).toBe(10_000);
    clock.setScale(1);
    expect(clock.now()).toBe(10_000);
    source.advance(1000);
    expect(clock.now()).toBe(11_000);
    clock.setScale(120);
    source.advance(1000);
    expect(clock.now()).toBe(131_000);
    expect(clock.getScale()).toBe(120);
  });

  it('rejects zero, negative, and non-finite scales', () => {
    const source = new FakeClock(0);
    expect(() => new ScaledClock(source, 0)).toThrow();
    expect(() => new ScaledClock(source, -2)).toThrow();
    const clock = new ScaledClock(source, 1);
    expect(() => clock.setScale(Number.NaN)).toThrow();
    expect(() => clock.setScale(Infinity)).toThrow();
    expect(clock.getScale()).toBe(1);
  });

  it('can start ahead of its source and jump forward', () => {
    const source = new FakeClock(1000);
    const clock = new ScaledClock(source, 1, 50_000);
    expect(clock.now()).toBe(50_000);
    source.advance(10);
    expect(clock.now()).toBe(50_010);
    clock.jump(5000);
    expect(clock.now()).toBe(55_010);
    expect(() => clock.jump(-1)).toThrow();
  });
});
