/**
 * A small ZIP writer and reader with no dependencies. Files are written STORED (uncompressed:
 * PCM audio barely compresses and stored entries keep writing fast and deterministic). The
 * reader accepts stored entries and, where the browser provides DecompressionStream, deflated
 * ones (so a bundle re-zipped by another tool still opens).
 */
export declare function crc32(data: Uint8Array, crc?: number): number;
export interface ZipEntry {
    name: string;
    data: Uint8Array;
}
export declare function createZip(entries: ZipEntry[]): Uint8Array;
/** Limits for reading archives from untrusted sources (all optional; none by default). */
export interface ReadZipOptions {
    /** most files in the archive */
    maxEntries?: number;
    /** largest uncompressed file, in bytes */
    maxEntryBytes?: number;
    /** most uncompressed bytes in total */
    maxTotalBytes?: number;
}
/** An archive exceeded a ReadZipOptions limit. */
export declare class ZipLimitError extends Error {
    constructor(message: string);
}
/** Read every file in a ZIP archive, checking CRCs (and the limits, if given). */
export declare function readZip(bytes: Uint8Array, opts?: ReadZipOptions): Promise<ZipEntry[]>;
