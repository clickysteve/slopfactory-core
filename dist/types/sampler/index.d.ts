/** Sample zones, the polyphonic sample instrument, decoding and waveform helpers. */
export { defaultZone, MIN_LOOP_SECONDS, noteName, parseNoteName, playbackRate, region, repairZone, velocityGain, zoneProblems } from './zone';
export type { PlayMode, Region, SampleZone } from './zone';
export { SampleInstrument } from './instrument';
export { browserDecode, decodeSample, MAX_SAMPLE_BYTES, MAX_SAMPLE_SECONDS, SampleError, toAudioBuffer } from './decode';
export type { DecodedSample, DecodeOptions, SampleErrorCode } from './decode';
export { peakOf, snapToZeroCrossing, waveformPeaks } from './edit';
