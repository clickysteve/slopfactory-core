/**
 * A sample zone: how one sample plays as an instrument. Plain JSON.
 *
 * Times are in seconds of the sample's own audio (independent of the playback sample rate).
 */
export type PlayMode = 'oneshot' | 'gated' | 'loop';
export interface SampleZone {
    /** the MIDI note at which the sample plays at its original speed */
    root: number;
    /** semitones, -48..48 */
    tune: number;
    /** cents, -100..100 */
    fine: number;
    /** linear gain, 0..2 (1 = unity) */
    volume: number;
    /** -1 (left) .. 1 (right) */
    pan: number;
    mode: PlayMode;
    /** play from here (s) */
    start: number;
    /** play to here (s); null = the end of the sample */
    end: number | null;
    /** loop region (LOOP mode); loopEnd null = END */
    loopStart: number;
    loopEnd: number | null;
    /** release time after note-off (GATED and LOOP), 0.005..5 s */
    release: number;
    /** how much velocity changes level: 0 = not at all, 1 = fully */
    velocitySens: number;
    mute: boolean;
}
export declare const MIN_LOOP_SECONDS = 0.001;
export declare const EDGE_FADE_SECONDS = 0.002;
export declare function defaultZone(): SampleZone;
/** Playback-rate transposition, as on a hardware sampler: length changes with pitch. */
export declare function playbackRate(z: Pick<SampleZone, 'root' | 'tune' | 'fine'>, pitch: number): number;
/** Level for a velocity: the same 1.5-power curve for every instrument, scaled by sensitivity. */
export declare function velocityGain(z: Pick<SampleZone, 'velocitySens'>, velocity: number): number;
export interface Region {
    start: number;
    end: number;
    loopStart: number;
    loopEnd: number;
    /** START was moved from the sample's beginning (fade in) */
    trimmedStart: boolean;
    /** END was moved from the sample's end (fade out) */
    trimmedEnd: boolean;
}
/** The zone's playable region inside a sample of `duration` seconds, made consistent. */
export declare function region(z: SampleZone, duration: number): Region;
/** Human-readable problems with a zone's settings for a sample length (empty = fine). */
export declare function zoneProblems(z: SampleZone, duration: number): string[];
export declare function repairZone(src: unknown): SampleZone;
/** MIDI note name with middle C (60) = C4. */
export declare function noteName(n: number): string;
/** Parse "C4", "f#2", "Bb3" or a number; null if unreadable. */
export declare function parseNoteName(s: string): number | null;
