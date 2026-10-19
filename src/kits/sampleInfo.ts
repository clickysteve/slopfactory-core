/**
 * What the library knows about a sample without reading its audio: the original file's name,
 * format and size, and (once decoded) its duration, sample rate and channels.
 */
import type { SampleMeta } from '../storage/samples';

/** A sample id: SHA-256 of the original file bytes, lower-case hex. */
export const SAMPLE_ID = /^[0-9a-f]{64}$/;

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

const fourcc = (b: Uint8Array, at: number) => (at + 4 <= b.length ? String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]) : '');

/** The audio container format, from the file's first bytes, else its extension ('' if unknown). */
export function sniffFormat(bytes: ArrayBuffer | Uint8Array, name = ''): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength));
  if (fourcc(b, 0) === 'RIFF' && fourcc(b, 8) === 'WAVE') return 'wav';
  if (fourcc(b, 0) === 'FORM' && (fourcc(b, 8) === 'AIFF' || fourcc(b, 8) === 'AIFC')) return 'aiff';
  if (fourcc(b, 0) === 'fLaC') return 'flac';
  if (fourcc(b, 0) === 'OggS') return 'ogg';
  if (fourcc(b, 4) === 'ftyp') return 'm4a';
  if (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return 'mp3';
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3';
  const m = /\.([a-z0-9]{2,5})$/i.exec(name);
  return m ? m[1].toLowerCase().replace(/^(wave)$/, 'wav').replace(/^(aif|aifc)$/, 'aiff') : '';
}

const EXT: Record<string, string> = { wav: 'wav', aiff: 'aif', flac: 'flac', ogg: 'ogg', m4a: 'm4a', mp3: 'mp3' };

/** A file extension for a sample of this format ('bin' if unknown). */
export const formatExtension = (format: string): string => EXT[format] ?? 'bin';

const MIME: Record<string, string> = { wav: 'audio/wav', aiff: 'audio/aiff', flac: 'audio/flac', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg' };

/** A MIME type for a sample of this format ('' if unknown). */
export const formatMime = (format: string): string => MIME[format] ?? '';
