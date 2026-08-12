import { DataStore } from './DataStore';
import { LocalStorageDataStore } from './LocalStorageDataStore';

export type { DataStore } from './DataStore';

// Local mode by default. AuthGate swaps this for a FirestoreDataStore once a user
// signs in (see src/components/AuthGate.tsx) — callers only ever depend on the
// DataStore interface above, so nothing else needs to know which backend is active.
// This is a live ES module binding: reassigning it here is visible to every module
// that imported { dataStore }, including src/store.ts.
export let dataStore: DataStore = new LocalStorageDataStore();

export function setDataStore(store: DataStore) {
  dataStore = store;
}
