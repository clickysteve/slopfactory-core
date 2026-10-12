/**
 * The sample instrument: plays one AudioBuffer through a zone, polyphonically, in any
 * BaseAudioContext. One AudioBuffer is shared by every note (and by live and offline
 * contexts); each note only creates a buffer source, a gain and a panner.
 */
import { type Instrument, type NoteHandle, type NoteRequest } from '../audio/instrument';
import { type SampleZone } from './zone';
export declare class SampleInstrument implements Instrument {
    readonly buffer: AudioBuffer;
    zone: SampleZone;
    constructor(buffer: AudioBuffer, zone: SampleZone);
    start(ctx: BaseAudioContext, out: AudioNode, note: NoteRequest): NoteHandle | null;
}
