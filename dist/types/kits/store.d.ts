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
export declare const KIT_STORE_SCHEMA = 1;
/** In memory (tests, or browsers without IndexedDB: nothing outlives the page). */
export declare class MemoryKitStore implements KitStore {
    private kits;
    private samples;
    private meta;
    /** set to make the next commit fail (tests) */
    failNext: StorageError | null;
    listKits(): Promise<Kit[]>;
    getKit(id: string): Promise<Kit | null>;
    listSamples(): Promise<LibrarySample[]>;
    getSample(id: string): Promise<LibrarySample | null>;
    getMeta<T>(key: string): Promise<T | undefined>;
    commit(c: KitStoreChanges): Promise<void>;
}
/** IndexedDB: one database per application (for example `<app>-kit-library`). */
export declare class IndexedDbKitStore implements KitStore {
    readonly dbName: string;
    private factory;
    private db;
    constructor(dbName: string, factory?: IDBFactory | null);
    private open;
    private read;
    listKits(): Promise<Kit[]>;
    getKit(id: string): Promise<Kit | null>;
    listSamples(): Promise<LibrarySample[]>;
    getSample(id: string): Promise<LibrarySample | null>;
    getMeta<T>(key: string): Promise<NonNullable<Awaited<T>> | undefined>;
    commit(c: KitStoreChanges): Promise<void>;
}
