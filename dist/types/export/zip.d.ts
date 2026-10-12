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
/** Read every file in a ZIP archive, checking CRCs. */
export declare function readZip(bytes: Uint8Array): Promise<ZipEntry[]>;
