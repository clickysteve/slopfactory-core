/**
 * Browser-local sample storage.
 *
 * Samples are stored as the original file bytes, keyed by the SHA-256 of those bytes, so the
 * same file imported twice (or used by several projects or slots) is stored once. Projects
 * keep only the id and a display name. Nothing leaves the browser.
 */
export interface SampleMeta {
    /** SHA-256 of the bytes, lower-case hex */
    id: string;
    /** original file name */
    name: string;
    /** MIME type, if known */
    type: string;
    size: number;
    /** ms since 1970, when first stored */
    added: number;
}
export interface StoredSample extends SampleMeta {
    bytes: ArrayBuffer;
}
export type StorageErrorCode = 'quota' | 'unavailable' | 'failed';
export declare class StorageError extends Error {
    readonly code: StorageErrorCode;
    constructor(code: StorageErrorCode, message: string);
}
export interface SampleStore {
    /** store (no-op if the id is already stored); returns the stored metadata */
    put(sample: StoredSample): Promise<SampleMeta>;
    get(id: string): Promise<StoredSample | null>;
    has(id: string): Promise<boolean>;
    delete(id: string): Promise<void>;
    list(): Promise<SampleMeta[]>;
}
export declare function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string>;
/** Build a StoredSample from file bytes. */
export declare function sampleFromBytes(bytes: ArrayBuffer, name: string, type?: string): Promise<StoredSample>;
export declare class MemorySampleStore implements SampleStore {
    private items;
    /** set to simulate a full disk */
    quotaBytes: number;
    put(s: StoredSample): Promise<SampleMeta>;
    get(id: string): Promise<{
        /** SHA-256 of the bytes, lower-case hex */
        id: string;
        /** original file name */
        name: string;
        /** MIME type, if known */
        type: string;
        size: number;
        /** ms since 1970, when first stored */
        added: number;
        bytes: ArrayBuffer;
    } | null>;
    has(id: string): Promise<boolean>;
    delete(id: string): Promise<void>;
    list(): Promise<SampleMeta[]>;
}
/** IndexedDB store: one database per application, one object store of samples. */
export declare class IndexedDbSampleStore implements SampleStore {
    readonly dbName: string;
    private factory;
    private db;
    constructor(dbName: string, factory?: IDBFactory | null);
    private open;
    private tx;
    put(s: StoredSample): Promise<SampleMeta>;
    get(id: string): Promise<StoredSample | null>;
    has(id: string): Promise<boolean>;
    delete(id: string): Promise<void>;
    list(): Promise<SampleMeta[]>;
}
