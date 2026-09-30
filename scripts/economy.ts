/**
 * Economy harness CLI.
 * Usage: npm run economy -- [--hours 3] [--seed 1] [--runs 1] [--neglect] [--spend]
 * Run it after any balance change (DESIGN 22).
 */
import { formatEconomyReport, runEconomy } from '../src/sim/harness/economy';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? Number(process.argv[i + 1]) : fallback;
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number`);
  return value;
}

const hours = arg('hours', 3);
const seed = arg('seed', 1);
const runs = arg('runs', 1);

for (let i = 0; i < runs; i++) {
  const started = performance.now();
  const bot = process.argv.includes('--neglect') ? 'neglect' : 'caring';
  const spend = process.argv.includes('--spend');
  const report = runEconomy({ hours, seed: seed + i, bot, spend });
  console.log(formatEconomyReport(report, performance.now() - started));
  if (i < runs - 1) console.log();
}
