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
 * - Optional **choke groups** (`choke`): a note that belongs to a group can cut the sounding
 *   notes of that group, across voices (a closed hat stopping an open hat). Notes without a
 *   group are never cut, so nothing changes unless the application assigns groups.
 */
import type { Instrument, NoteRequest } from './instrument';
import type { Mixer } from './mixer';
export interface NoteStart extends NoteRequest {
    /** the application's instrument assignment key, if the note has one */
    instrument?: string;
}
export type ResolveInstrument = (voice: string, note: NoteStart) => Instrument | null;
/**
 * Choke-group membership of one note. Notes of the same `group` interact; a group is not tied
 * to a voice, so sounds on different voices (or the same voice) can choke each other.
 */
export interface ChokeSettings {
    /** group name; notes interact only within a group */
    group: string;
    /** starting this note cuts the group's sounding notes (default true) */
    cuts?: boolean;
    /** this note can be cut by later notes of its group (default true) */
    cutBy?: boolean;
    /** anti-click fade, seconds, given to the notes this one cuts (default 0.005) */
    fade?: number;
}
/** Which choke group a note belongs to, if any (null: none, the default behaviour). */
export type ResolveChoke = (voice: string, note: NoteStart) => ChokeSettings | null | undefined;
export declare const DEFAULT_CHOKE_FADE = 0.005;
export interface NotePlayerOptions {
    maxPerVoice?: number;
    choke?: ResolveChoke;
}
export declare class NotePlayer {
    readonly ctx: BaseAudioContext;
    readonly mixer: Mixer;
    private resolve;
    private held;
    private sounding;
    /** notes that can be cut, per choke group */
    private chokable;
    private chokeOf;
    maxPerVoice: number;
    constructor(ctx: BaseAudioContext, mixer: Mixer, resolve: ResolveInstrument, opts?: NotePlayerOptions);
    noteOn(key: string, voice: string, note: NoteStart): boolean;
    /**
     * Apply a note's choke without playing it. Offline rendering uses this for notes of voices
     * that are not part of the current render pass, so a stem rendered on its own is cut
     * exactly as it is in the full mix.
     */
    chokeOnly(voice: string, note: NoteStart): void;
    /** Cut the sounding notes of the group that started before `time`. Notes starting at the same time are kept. */
    private cut;
    noteOff(key: string, time: number): void;
    /** Release every held note (one-shots ring on). */
    releaseAll(time: number): void;
    /** Stop everything quickly, one-shots included (panic). */
    stopAll(time: number): void;
    /** Notes still sounding at `time`, per voice. */
    activeCount(voice: string, time: number): number;
}
