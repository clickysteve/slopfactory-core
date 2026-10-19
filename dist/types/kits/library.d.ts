/**
 * The kit library: an application's samples and kits in this browser.
 *
 * - **Samples** are imported once (decoded to validate them, then kept as their original bytes
 *   in the application's SampleStore, keyed by SHA-256) and indexed here with their metadata.
 *   Importing the same file again finds the stored one. Any kit can use any sample.
 * - **Kits** refer to samples by id. Duplicating or renaming a kit copies no audio. Deleting a
 *   kit never deletes a sample that another kit or the application still uses.
 * - **Portable kits** are exported with their audio and imported from files (archive.ts).
 * - Decoded audio is cached (least recently used, within a memory budget), so switching kits
 *   does not decode the same samples again; nothing is decoded until it is needed.
 *
 * Every operation either completes or changes nothing, and fails with a KitError, StorageError
 * or SampleError whose message is meant for the user.
 */
import { type DecodedSample } from '../sampler/decode';
import { type SampleStore } from '../storage/samples';
import { type ArchiveSample, type LegacyKitReader } from './archive';
import { type Kit, type KitData } from './model';
import { type LibrarySample } from './sampleInfo';
import type { KitStore } from './store';
export interface KitLibraryOptions {
    /** the application's id, written into exported kits */
    app: string;
    /** where sample bytes are kept (the application's existing store), or null for none */
    audio: SampleStore | null;
    /** where kits and the sample index are kept, or null for none */
    store: KitStore | null;
    /** decoder (default: Core's decodeSample) */
    decode?: (bytes: ArrayBuffer, name: string) => Promise<DecodedSample>;
    /** samples the application uses outside saved kits (its current sounds, its projects): never deleted */
    inUse?: () => Iterable<string> | Promise<Iterable<string>>;
    /** decoded audio kept in memory, in bytes of sample data (default 160 MB) */
    cacheBytes?: number;
    now?: () => number;
    newId?: () => string;
}
export interface KitSummary {
    id: string;
    name: string;
    description?: string;
    /** distinct samples */
    samples: number;
    instruments: number;
    modified: number;
    /** a bundled kit's id */
    bundled?: string;
}
export interface SampleImport {
    sample: LibrarySample;
    decoded: DecodedSample;
    /** the same audio was already in the library */
    duplicate: boolean;
    /** kept in browser storage (false: for this visit only) */
    stored: boolean;
}
export interface SampleImportReport {
    added: SampleImport[];
    duplicates: SampleImport[];
    errors: {
        name: string;
        message: string;
    }[];
}
export interface KitImport {
    /** the kit (saved: with its library id) */
    kit: Kit;
    saved: boolean;
    /** the name was taken, so it was changed */
    renamed: boolean;
    /** samples new to this library */
    added: number;
    /** the archive was a legacy format */
    legacy?: string;
}
/** A file to import: a File, or anything with a name and its bytes. */
export interface ImportFile {
    name: string;
    type?: string;
    arrayBuffer(): Promise<ArrayBuffer>;
}
/** Decoded samples by id, least recently used dropped first beyond a memory budget. */
export declare class DecodeCache {
    readonly maxBytes: number;
    private items;
    private used;
    constructor(maxBytes?: number);
    get(id: string, load: () => Promise<DecodedSample>): Promise<DecodedSample>;
    set(id: string, d: DecodedSample): void;
    has(id: string): boolean;
    drop(id: string): void;
    clear(): void;
    get bytes(): number;
    private trim;
}
export declare class KitLibrary {
    private opts;
    readonly app: string;
    readonly cache: DecodeCache;
    private now;
    private newId;
    constructor(opts: KitLibraryOptions);
    /** Whether kits and samples outlive the page (browser storage is available). */
    get persistent(): boolean;
    get audio(): SampleStore | null;
    private stores;
    private decode;
    /**
     * Import one sample: decoded first (an unsupported or damaged file throws SampleError and
     * nothing is stored), then kept as its original bytes and indexed. The same audio imported
     * again is the same sample (`duplicate`). Without browser storage the sample is still
     * returned, for this visit (`stored: false`).
     */
    addSample(bytes: ArrayBuffer, name: string, type?: string): Promise<SampleImport>;
    /**
     * Import several files, one at a time (the page stays responsive). A file that fails is
     * reported and skipped; the others are kept.
     */
    importFiles(files: ImportFile[], onProgress?: (done: number, total: number) => void): Promise<SampleImportReport>;
    /**
     * Index a sample whose bytes are already in the audio store (migrating an application's
     * existing samples): no decoding, nothing copied. False if the audio is not there.
     */
    indexSample(id: string, info: Partial<Omit<LibrarySample, 'id'>> & {
        name: string;
    }): Promise<boolean>;
    listSamples(): Promise<LibrarySample[]>;
    getSample(id: string): Promise<LibrarySample | null>;
    /** A sample's original bytes with its library information, or null if they are not in this browser. */
    readSample(id: string): Promise<ArchiveSample | null>;
    /** A sample's decoded audio (cached). Throws KitError('missing-audio') if it is not in this browser. */
    decoded(id: string, name?: string): Promise<DecodedSample>;
    /** Change a sample's name or descriptive metadata. */
    updateSample(id: string, patch: Partial<Pick<LibrarySample, 'name' | 'description' | 'tags' | 'duration' | 'sampleRate' | 'channels'>>): Promise<LibrarySample>;
    /** Which saved kits use a sample, and whether the application does. */
    usage(id: string): Promise<{
        kits: string[];
        app: boolean;
    }>;
    /** Delete a sample from this browser. Refused (KitError('in-use')) while a kit or the application uses it. */
    removeSample(id: string): Promise<void>;
    /** Delete every library sample that no kit and nothing in the application uses. Returns how many. */
    removeUnused(): Promise<number>;
    /** Samples a kit uses whose audio is not in this browser. */
    missing(kit: Pick<KitData, 'instruments'>): Promise<string[]>;
    listKits(): Promise<KitSummary[]>;
    getKit(id: string): Promise<Kit | null>;
    private mustGet;
    /**
     * Save a kit (new without `id`, else replacing the kit with that id). `audio` gives the bytes
     * of samples the library may not have yet (they are stored first). A different kit with the
     * same name (case-insensitive) is an error unless `replace` (after asking the user): then
     * that kit is replaced in the same step.
     */
    saveKit(input: KitData & {
        id?: string;
        origin?: Kit['origin'];
    }, opts?: {
        audio?: ArchiveSample[];
        replace?: boolean;
    }): Promise<Kit>;
    /** A new, empty kit. */
    createKit(name: string): Promise<Kit>;
    renameKit(id: string, name: string): Promise<Kit>;
    /** A copy of a saved kit, sharing its samples (no audio is copied). */
    duplicateKit(id: string, name?: string): Promise<Kit>;
    /**
     * Delete a saved kit. Its samples stay in the library; with `removeUnusedSamples`, those that
     * no other kit and nothing in the application uses are deleted too. Returns how many were.
     */
    deleteKit(id: string, opts?: {
        removeUnusedSamples?: boolean;
    }): Promise<number>;
    /** Point every use of one sample in a saved kit at another (to resolve a missing sample). */
    replaceSample(kitId: string, from: string, to: string): Promise<Kit>;
    /** A portable kit file with every sample's audio. KitError('missing-audio') if any is not in this browser. */
    exportKit(kit: KitData, extra?: ArchiveSample[]): Promise<{
        bytes: Uint8Array;
        fileName: string;
    }>;
    /**
     * Import a portable kit file. Everything is checked first (the archive, the manifest, every
     * sample's fingerprint, and that every sample decodes); then its samples join the library
     * (those already there are reused) and, with `save` (the default), the kit is saved under a
     * new id (a taken name gets a number). Without `save` the samples are kept but the kit is
     * only returned, for the application to open unsaved. On any failure nothing is kept.
     */
    importKit(bytes: Uint8Array, opts?: {
        save?: boolean;
        legacy?: LegacyKitReader;
    }): Promise<KitImport>;
    /** The kit to open at startup (null: none chosen). */
    getDefault(): Promise<string | null>;
    setDefault(id: string | null): Promise<void>;
    /** The kit last loaded or saved. */
    getCurrent(): Promise<string | null>;
    setCurrent(id: string | null): Promise<void>;
    /** Application values kept with the library (small JSON). */
    getMeta<T>(key: string): Promise<T | undefined>;
    setMeta(key: string, value: unknown): Promise<void>;
}
