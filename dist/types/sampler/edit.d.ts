import type { AudioData } from '../dsp/transform/transform';
/** Move a time (s) to the nearest zero crossing within `windowSeconds`, using Good Bits' search. */
export declare function snapToZeroCrossing(audio: AudioData, seconds: number, windowSeconds?: number): number;
/** Peak absolute values in `bins` equal slices (for drawing a waveform). */
export declare function waveformPeaks(audio: AudioData, bins: number): number[];
/** Peak absolute value over all channels. */
export declare function peakOf(channels: Float32Array[]): number;
