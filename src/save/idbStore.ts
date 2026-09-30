import { createStore, del, get, keys, set } from 'idb-keyval';
import type { KeyValueStore } from './SaveManager';

/** IndexedDB-backed store for the browser. */
export function createIdbStore(dbName = 'mystery-meadow-3d', storeName = 'saves'): KeyValueStore {
  const store = createStore(dbName, storeName);
  return {
    get: (key) => get(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
    keys: async () => (await keys(store)).map(String),
  };
}
