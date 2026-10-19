/**
 * What the library knows about a sample without reading its audio: the original file's name,
 * format and size, and (once decoded) its duration, sample rate and channels.
 */
import type { SampleMeta } from '../storage/samples';
/** A sample id: SHA-256 of the original file bytes, lower-case hex. */
export declare const SAMPLE_ID: RegExp;
export interface LibrarySample extends SampleMeta {
    /** container format from the file's contents ('wav', 'aiff', 'flac', 'mp3', 'ogg', 'm4a') or its extension */
    format: string;
    /** seconds, once decoded */
    duration?: number;
    sampleRate?: number;
    channels?: number;
    /** optional descriptive metadata */
    description?: string;
    tags?: string[];
}
/** The audio container format, from the file's first bytes, else its extension ('' if unknown). */
export declare function sniffFormat(bytes: ArrayBuffer | Uint8Array, name?: string): string;
/** A file extension for a sample of this format ('bin' if unknown). */
export declare const formatExtension: (format: string) => string;
/** A MIME type for a sample of this format ('' if unknown). */
export declare const formatMime: (format: string) => string;
