import type { AvatarLoadout } from '../profile/avatar';
import type { PinRecord } from '../profile/pin';
import type { KeyValueStore, SaveManager } from './SaveManager';

/** What the profile picker shows for each player (a copy kept with the device record). */
export interface ProfileSummary {
  id: string;
  username: string;
  avatar: AvatarLoadout;
  lastPlayedAt: number;
}

/**
 * Device-wide data (DESIGN 20): the profile list and the Parent PIN. Stored under its own key,
 * separate from every profile's save, and never exported.
 */
export interface DeviceRecord {
  version: 1;
  profiles: ProfileSummary[];
  pin?: PinRecord;
}

export const DEVICE_KEY = 'device';

export class DeviceManager {
  constructor(
    private readonly store: KeyValueStore,
    private readonly saves: SaveManager,
  ) {}

  /**
   * Reads the device record. The first time on a device that already has saves (from before
   * profiles existed), those saves become the profile list.
   */
  async load(): Promise<DeviceRecord> {
    const raw = await this.store.get(DEVICE_KEY);
    if (isDeviceRecord(raw)) return raw;
    const record: DeviceRecord = { version: 1, profiles: [] };
    for (const id of await this.saves.listProfileIds()) {
      try {
        const file = await this.saves.load(id);
        if (!file) continue;
        record.profiles.push({
          id,
          username: file.profile.username,
          avatar: file.profile.avatar,
          lastPlayedAt: file.meta.lastSeenAt,
        });
      } catch {
        // A save that can't be read isn't listed; it stays in storage untouched.
      }
    }
    await this.save(record);
    return record;
  }

  async save(record: DeviceRecord): Promise<void> {
    await this.store.set(DEVICE_KEY, record);
  }
}

function isDeviceRecord(value: unknown): value is DeviceRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as DeviceRecord).version === 1 &&
    Array.isArray((value as DeviceRecord).profiles)
  );
}

/** Most recently played first. */
export function sortedProfiles(record: DeviceRecord): ProfileSummary[] {
  return [...record.profiles].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}
