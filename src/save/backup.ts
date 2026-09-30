import { SaveError, migrate } from './migrations';
import type { SaveFile } from './schema';

/**
 * Export/import backups (DESIGN 18.4, 20): a plain JSON file the grown-up downloads and can
 * load again on the same device. The Parent PIN is never included.
 */
export interface BackupFile {
  format: 'mystery-meadow-backup';
  version: 1;
  exportedAt: number;
  saves: SaveFile[];
}

export function makeBackup(saves: SaveFile[], now: number): BackupFile {
  return { format: 'mystery-meadow-backup', version: 1, exportedAt: now, saves };
}

/** Parses a backup and upgrades every save in it. Throws SaveError if it isn't one. */
export function readBackup(text: string): SaveFile[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SaveError('That file isn’t a Mystery Meadow backup.', 'invalid');
  }
  const file = data as Partial<BackupFile> | null;
  if (!file || file.format !== 'mystery-meadow-backup' || !Array.isArray(file.saves)) {
    throw new SaveError('That file isn’t a Mystery Meadow backup.', 'invalid');
  }
  if (file.saves.length === 0) throw new SaveError('That backup is empty.', 'invalid');
  return file.saves.map((s) => migrate(s));
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `mystery-meadow-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
