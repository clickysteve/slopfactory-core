import { type BundleContents } from '../storage/bundle';
import { type StoredSample } from '../storage/samples';
import { type KitData } from './model';
import { type LibrarySample } from './sampleInfo';
export declare const KIT_FORMAT = "slopfactory-kit";
export declare const KIT_VERSION = 1;
/** The file extension of portable kits (a plain ZIP: any unzip tool can open it). */
export declare const KIT_EXTENSION = ".kit.zip";
/** What a file chooser should accept for portable kits (applications add their legacy extensions). */
export declare const KIT_ACCEPT = ".zip,application/zip";
export interface KitArchiveLimits {
    /** largest archive file */
    maxArchiveBytes: number;
    /** most files inside */
    maxEntries: number;
    /** largest single file inside */
    maxEntryBytes: number;
    /** most bytes after expansion */
    maxTotalBytes: number;
    /** largest manifest */
    maxManifestBytes: number;
}
export declare const KIT_LIMITS: KitArchiveLimits;
export interface ManifestSample {
    id: string;
    /** path inside the archive */
    file: string;
    /** original file name */
    name: string;
    type: string;
    size: number;
    format: string;
    duration?: number;
    sampleRate?: number;
    channels?: number;
}
export interface KitManifest {
    format: typeof KIT_FORMAT;
    version: number;
    /** the application (and Core version) that wrote it */
    generator: {
        app: string;
        core?: string;
    };
    kit: KitData;
    samples: ManifestSample[];
}
/** A sample with its library information and bytes. */
export type ArchiveSample = StoredSample & Partial<Pick<LibrarySample, 'format' | 'duration' | 'sampleRate' | 'channels'>>;
export interface ReadKit {
    kit: KitData;
    samples: ArchiveSample[];
    generator: {
        app: string;
        core?: string;
    };
    /** the archive was a legacy format, converted (its name) */
    legacy?: string;
}
/** Convert a legacy archive (a Core project bundle) to a kit, or null if it is not one. */
export type LegacyKitReader = (bundle: BundleContents) => Promise<{
    kit: KitData;
    samples: StoredSample[];
} | null> | {
    kit: KitData;
    samples: StoredSample[];
} | null;
/** Write a portable kit. Every sample the kit uses must be given (KitError('missing-audio') otherwise). */
export declare function writeKitArchive(kit: KitData, samples: ArchiveSample[], generator: {
    app: string;
    core?: string;
}): Uint8Array;
/** A path inside an archive that names a file and cannot escape it. */
export declare function safeArchivePath(p: unknown): p is string;
/**
 * Read a portable kit (or, with `legacy`, an older format). Strict: the whole archive is checked
 * and every sample the kit uses must be present and intact, or it throws KitError with the
 * problems in `details`. Nothing is stored; the caller decides what to keep.
 */
export declare function readKitArchive(bytes: Uint8Array, opts?: {
    limits?: Partial<KitArchiveLimits>;
    legacy?: LegacyKitReader;
}): Promise<ReadKit>;
/** A file name for an exported kit: "<name>.kit.zip", safe on every system. */
export declare function kitFileName(name: string): string;
