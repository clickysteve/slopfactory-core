/**
 * Where a kit library keeps its kits and its sample index (names, formats, durations). Audio
 * bytes are not here: they stay in the application's SampleStore (content-addressed), which
 * applications already have, so existing samples need no migration.
 *
 * Each application has its own library, because browser storage belongs to the page's origin:
 * two applications on two addresses cannot read each other's IndexedDB, whatever code they
 * share. Kits move between applications as portable files (archive.ts).
 *
 * Writes are committed together: one `commit` either applies every change or none.
 */
import { StorageError } from '../storage/samples';
import type { Kit } from './model';
import type { LibrarySample } from './sampleInfo';

export interface KitStoreChanges {
  putKits?: Kit[];
  deleteKits?: string[];
  putSamples?: LibrarySample[];
  deleteSamples?: string[];
  /** small JSON values (preferences, migration records); undefined deletes */
  meta?: Record<string, unknown>;
}

export interface KitStore {
  listKits(): Promise<Kit[]>;
  getKit(id: string): Promise<Kit | null>;
  listSamples(): Promise<LibrarySample[]>;
  getSample(id: string): Promise<LibrarySample | null>;
  getMeta<T = unknown>(key: string): Promise<T | undefined>;
  /** apply every change or none (StorageError on failure) */
  commit(changes: KitStoreChanges): Promise<void>;
}

/** The schema of IndexedDbKitStore databases. Upgrades only ever add. */
export const KIT_STORE_SCHEMA = 1;

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** In memory (tests, or browsers without IndexedDB: nothing outlives the page). */
export class MemoryKitStore implements KitStore {
  private kits = new Map<string, Kit>();
  private samples = new Map<string, LibrarySample>();
  private meta = new Map<string, unknown>();
  /** set to make the next commit fail (tests) */
  failNext: StorageError | null = null;

  async listKits() {
    return [...this.kits.values()].map(clone);
  }
  async getKit(id: string) {
    return clone(this.kits.get(id) ?? null);
  }
  async listSamples() {
    return [...this.samples.values()].map(clone);
  }
  async getSample(id: string) {
    return clone(this.samples.get(id) ?? null);
  }
  async getMeta<T>(key: string) {
    return clone(this.meta.get(key)) as T | undefined;
  }
  async commit(c: KitStoreChanges) {
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    for (const k of c.putKits ?? []) this.kits.set(k.id, clone(k));
    for (const id of c.deleteKits ?? []) this.kits.delete(id);
    for (const s of c.putSamples ?? []) this.samples.set(s.id, clone(s));
    for (const id of c.deleteSamples ?? []) this.samples.delete(id);
    for (const [k, v] of Object.entries(c.meta ?? {})) {
      if (v === undefined) this.meta.delete(k);
      else this.meta.set(k, clone(v));
    }
  }
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function wrap(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const name = (e as DOMException | null)?.name ?? '';
  if (name === 'QuotaExceededError') return new StorageError('quota', 'Browser storage is full: nothing was saved. Free some space or delete unused samples.');
  return new StorageError('failed', `Browser storage failed: ${(e as Error | null)?.message || name || 'unknown error'}.`);
}

const STORES = ['kits', 'samples', 'meta'] as const;

/** IndexedDB: one database per application (for example `<app>-kit-library`). */
export class IndexedDbKitStore implements KitStore {
  private db: Promise<IDBDatabase> | null = null;
  constructor(readonly dbName: string, private factory: IDBFactory | null = globalThis.indexedDB ?? null) {}

  private open(): Promise<IDBDatabase> {
    if (!this.db) {
      const f = this.factory;
      if (!f) return Promise.reject(new StorageError('unavailable', 'This browser has no IndexedDB, so kits cannot be kept between visits.'));
      this.db = new Promise<IDBDatabase>((resolve, reject) => {
        let r: IDBOpenDBRequest;
        try {
          r = f.open(this.dbName, KIT_STORE_SCHEMA);
        } catch (e) {
          reject(new StorageError('unavailable', `Browser storage is unavailable (${(e as Error).message}).`));
          return;
        }
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains('kits')) db.createObjectStore('kits', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('samples')) db.createObjectStore('samples', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        r.onsuccess = () => {
          r.result.onversionchange = () => r.result.close();
          resolve(r.result);
        };
        r.onerror = () => reject(new StorageError(r.error?.name === 'VersionError' ? 'failed' : 'unavailable', r.error?.name === 'VersionError' ? 'This kit library was saved by a newer version of the application. Reload the latest version; nothing was changed.' : `Browser storage is unavailable (${r.error?.message ?? 'blocked'}).`));
        r.onblocked = () => reject(new StorageError('unavailable', 'Browser storage is blocked by another tab.'));
      });
      this.db.catch(() => (this.db = null));
    }
    return this.db;
  }

  private async read<T>(store: (typeof STORES)[number], fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    try {
      return await req(fn(db.transaction(store, 'readonly').objectStore(store)));
    } catch (e) {
      throw wrap(e);
    }
  }

  async listKits() {
    return this.read('kits', (s) => s.getAll() as IDBRequest<Kit[]>);
  }
  async getKit(id: string) {
    return (await this.read('kits', (s) => s.get(id) as IDBRequest<Kit | undefined>)) ?? null;
  }
  async listSamples() {
    return this.read('samples', (s) => s.getAll() as IDBRequest<LibrarySample[]>);
  }
  async getSample(id: string) {
    return (await this.read('samples', (s) => s.get(id) as IDBRequest<LibrarySample | undefined>)) ?? null;
  }
  async getMeta<T>(key: string) {
    return (await this.read('meta', (s) => s.get(key) as IDBRequest<T | undefined>)) ?? undefined;
  }

  async commit(c: KitStoreChanges): Promise<void> {
    const db = await this.open();
    try {
      const t = db.transaction([...STORES], 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error('aborted'));
      });
      done.catch(() => {});
      try {
        const kits = t.objectStore('kits');
        const samples = t.objectStore('samples');
        const meta = t.objectStore('meta');
        for (const [k, v] of Object.entries(c.meta ?? {})) {
          if (v === undefined) meta.delete(k);
          else meta.put(clone(v), k);
        }
        for (const s of c.putSamples ?? []) samples.put(clone(s));
        for (const id of c.deleteSamples ?? []) samples.delete(id);
        for (const k of c.putKits ?? []) kits.put(clone(k));
        for (const id of c.deleteKits ?? []) kits.delete(id);
      } catch (e) {
        // a request that cannot even be made (an invalid key): undo the ones already made
        t.abort();
        throw e;
      }
      await done;
    } catch (e) {
      throw wrap(e);
    }
  }
}
