import { type SampleTransform } from './settings';
export interface AudioData {
    sampleRate: number;
    channels: Float32Array[];
}
/** The transformed audio, or the input itself (not copied) when the transform is off. */
export declare function applyTransform(audio: AudioData, t: SampleTransform): AudioData;
