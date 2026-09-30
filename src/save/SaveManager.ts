import { migrate } from './migrations';
import { saveKey, type SaveFile } from './schema';

/** Minimal async key-value store. IndexedDB in the browser, in-memory in tests. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, unknown>();

  async get(key: string): Promise<unknown> {
    const value = this.data.get(key);
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, JSON.parse(JSON.stringify(value)));
  }

  async del(key: string): Promise<void> {
    this.data.delete(key);
  }

  async keys(): Promise<string[]> {
    return [...this.data.keys()];
  }
}

const PREFIX = 'profile:';

/** Reads and writes one save per profile (DESIGN 18.4). Loading always runs migrations. */
export class SaveManager {
  constructor(private readonly store: KeyValueStore) {}

  async save(file: SaveFile): Promise<void> {
    await this.store.set(saveKey(file.profile.id), file);
  }

  async load(profileId: string): Promise<SaveFile | undefined> {
    const raw = await this.store.get(saveKey(profileId));
    if (raw === undefined) return undefined;
    return migrate(raw);
  }

  async delete(profileId: string): Promise<void> {
    await this.store.del(saveKey(profileId));
  }

  async listProfileIds(): Promise<string[]> {
    const keys = await this.store.keys();
    return keys.filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length));
  }
}
