import { BALANCE } from '../../config/balance';
import type { SimContext } from '../context';
import type { CommandResult } from '../types';
import { addGems } from './economy';

/** Spend gems (the Boutique, DESIGN 4: gems buy avatar items only). */
export function spendGems(ctx: SimContext, amount: number): CommandResult {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'That’s not a price.' };
  if (ctx.state.world.gems < amount) return { ok: false, reason: 'Not enough gems!' };
  addGems(ctx, -amount);
  return { ok: true };
}

/** A grown-up gives gems from Parent Mode (DESIGN 20). The UI checks the PIN first. */
export function grantGems(ctx: SimContext, amount: number): CommandResult {
  const { maxGrant } = BALANCE.gems;
  if (!Number.isInteger(amount) || amount < 1 || amount > maxGrant) {
    return { ok: false, reason: `Pick 1 to ${maxGrant} gems.` };
  }
  addGems(ctx, amount);
  ctx.emit('gemsGranted', { amount });
  return { ok: true };
}
