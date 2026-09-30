import { describe, expect, it, vi } from 'vitest';
import { Emitter } from '../../src/sim/emitter';

type Events = { ping: { n: number }; done: undefined };

describe('Emitter', () => {
  it('delivers payloads to every listener of that event only', () => {
    const e = new Emitter<Events>();
    const a = vi.fn();
    const b = vi.fn();
    const other = vi.fn();
    e.on('ping', a);
    e.on('ping', b);
    e.on('done', other);
    e.emit('ping', { n: 1 });
    expect(a).toHaveBeenCalledWith({ n: 1 });
    expect(b).toHaveBeenCalledWith({ n: 1 });
    expect(other).not.toHaveBeenCalled();
  });

  it('unsubscribes via the returned function and via off()', () => {
    const e = new Emitter<Events>();
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribe = e.on('ping', a);
    e.on('ping', b);
    unsubscribe();
    e.off('ping', b);
    e.emit('ping', { n: 2 });
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(e.listenerCount('ping')).toBe(0);
  });

  it('is safe to emit with no listeners and to unsubscribe during emit', () => {
    const e = new Emitter<Events>();
    expect(() => e.emit('done', undefined)).not.toThrow();
    const b = vi.fn();
    const off = e.on('ping', () => off());
    e.on('ping', b);
    e.emit('ping', { n: 3 });
    e.emit('ping', { n: 4 });
    expect(b).toHaveBeenCalledTimes(2);
    expect(e.listenerCount('ping')).toBe(1);
  });

  it('does not add the same listener twice', () => {
    const e = new Emitter<Events>();
    const a = vi.fn();
    e.on('ping', a);
    e.on('ping', a);
    e.emit('ping', { n: 5 });
    expect(a).toHaveBeenCalledTimes(1);
  });
});
