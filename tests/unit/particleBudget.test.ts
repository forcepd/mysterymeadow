import { describe, expect, it } from 'vitest';
import { ParticleBudget } from '../../src/game/fx/budget';

describe('particle budget (DESIGN 18.5: cap particles)', () => {
  it('grants what fits and trims the rest', () => {
    const b = new ParticleBudget(10);
    expect(b.take(6)).toBe(6);
    expect(b.take(6)).toBe(4);
    expect(b.take(3)).toBe(0);
    expect(b.count).toBe(10);
  });

  it('frees room as particles finish, never going below zero', () => {
    const b = new ParticleBudget(3);
    b.take(3);
    b.release();
    expect(b.take(5)).toBe(1);
    for (let i = 0; i < 10; i++) b.release();
    expect(b.count).toBe(0);
    expect(b.take(-2)).toBe(0);
  });
});
