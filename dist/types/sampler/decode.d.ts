import type { AudioData } from '../dsp/transform/transform';
export type SampleErrorCode = 'empty' | 'too-large' | 'too-long' | 'unsupported' | 'corrupt' | 'decode';
export declare class SampleError extends Error {
    readonly code: SampleErrorCode;
    constructor(code: SampleErrorCode, message: string);
}
export interface DecodedSample extends AudioData {
    frames: number;
    duration: number;
    warnings: string[];
}
export interface DecodeOptions {
    maxBytes?: number;
    maxSeconds?: number;
    /** decoder for formats Good Bits does not parse (default: the browser's) */
    decode?: (bytes: ArrayBuffer) => Promise<AudioData>;
}
export declare const MAX_SAMPLE_BYTES: number;
export declare const MAX_SAMPLE_SECONDS = 120;
/** Decode with the browser (OfflineAudioContext at 44.1 kHz; compressed formats resample to it). */
export declare function browserDecode(bytes: ArrayBuffer): Promise<AudioData>;
export declare function decodeSample(bytes: ArrayBuffer, name: string, opts?: DecodeOptions): Promise<DecodedSample>;
/** Make an AudioBuffer (context-independent, usable by live and offline contexts alike). */
export declare function toAudioBuffer(audio: AudioData): AudioBuffer;
