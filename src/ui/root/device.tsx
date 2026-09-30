import { createContext, useContext } from 'react';
import type { DeviceRecord } from '../../save/device';
import type { KeyValueStore } from '../../save/SaveManager';
import type { SaveFile } from '../../save/schema';

/** Device-wide things the in-game screens need (Parent Mode, Settings). */
export interface DeviceApi {
  record: DeviceRecord;
  store: KeyValueStore;
  /** Changes and saves the device record. */
  update(change: (record: DeviceRecord) => void): Promise<void>;
  /** Back to the profile picker (saves first). */
  switchPlayer(): Promise<void>;
  /** Starts this profile's meadow over (keeps the name and avatar). */
  resetProfile(profileId: string): Promise<void>;
  /** Renames a player (their save and the picker). The name must already be checked. */
  renameProfile(profileId: string, username: string): Promise<void>;
  /** Deletes a profile and its save. */
  deleteProfile(profileId: string): Promise<void>;
  /** Every profile's save, for a backup (the running game's is up to the moment). */
  exportSaves(): Promise<SaveFile[]>;
  /** Restores saves from a backup (replacing same-id profiles), then shows the picker. */
  importSaves(files: SaveFile[]): Promise<void>;
}

export const DeviceContext = createContext<DeviceApi | null>(null);

export function useDevice(): DeviceApi {
  const api = useContext(DeviceContext);
  if (!api) throw new Error('useDevice must be used inside <DeviceContext.Provider>');
  return api;
}

/** A new, unique-enough local profile id. */
export function newProfileId(): string {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 0xffff).toString(36)}`;
}

/** A random salt for the PIN hash. */
export function newSalt(): string {
  return Math.floor(Math.random() * 0x7fffffff).toString(36) + Date.now().toString(36);
}
