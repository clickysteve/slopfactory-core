/**
 * The note player: starts and releases notes on voices, live or offline, with one set of
 * rules.
 *
 * - The application resolves which instrument plays a note (`resolve`), so Core never knows
 *   what a voice means.
 * - Notes are addressed by a key. A note-on for a key that is still held first releases it
 *   (MIDI retrigger semantics when the key is "channel:pitch"); a note-off releases the key.
 *   Offline rendering gives every note its own key.
 * - Each voice keeps at most `maxPerVoice` sounding notes; the oldest is stopped to make room.
 */
import type { Instrument, NoteRequest } from './instrument';
import type { Mixer } from './mixer';
export interface NoteStart extends NoteRequest {
    /** the application's instrument assignment key, if the note has one */
    instrument?: string;
}
export type ResolveInstrument = (voice: string, note: NoteStart) => Instrument | null;
export declare class NotePlayer {
    readonly ctx: BaseAudioContext;
    readonly mixer: Mixer;
    private resolve;
    private held;
    private sounding;
    maxPerVoice: number;
    constructor(ctx: BaseAudioContext, mixer: Mixer, resolve: ResolveInstrument, opts?: {
        maxPerVoice?: number;
    });
    noteOn(key: string, voice: string, note: NoteStart): boolean;
    noteOff(key: string, time: number): void;
    /** Release every held note (one-shots ring on). */
    releaseAll(time: number): void;
    /** Stop everything quickly, one-shots included (panic). */
    stopAll(time: number): void;
    /** Notes still sounding at `time`, per voice. */
    activeCount(voice: string, time: number): number;
}
