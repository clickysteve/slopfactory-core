/**
 * The common musical event representation.
 *
 * Time is counted in integer **ticks** at a resolution chosen by the application (`ppq`,
 * pulses per quarter note: ANVIL uses 24, DOWNBEAT 96 000). Integers are exact, so positions never
 * drift however long a piece runs. A **tempo map** turns ticks into seconds and sample frames:
 * each event's time is computed directly from its own tick and the tempo segment it falls in,
 * never by adding up durations, so there is no cumulative floating-point error.
 *
 * Events name a **voice** by string id (the application decides what a voice is: a theme
 * voice, a drum lane, a stream). Notes carry their duration, so a renderer never has to pair
 * note-ons with note-offs. An optional `instrument` key lets an application route a single
 * note to a different sound than its voice's default (for example a drum-table entry).
 *
 * Nothing here knows about any particular application.
 */
export type Tick = number;
export interface TempoChange {
    /** where this tempo starts (the first change must be at tick 0) */
    tick: Tick;
    /** quarter notes per minute */
    bpm: number;
}
export interface TempoMap {
    /** ticks per quarter note */
    ppq: number;
    /** sorted by tick, first at 0 */
    changes: TempoChange[];
}
export interface NoteEvent {
    type: 'note';
    tick: Tick;
    /** in ticks, >= 1 */
    duration: Tick;
    voice: string;
    /** MIDI note number 0..127 */
    pitch: number;
    /** 1..127 */
    velocity: number;
    /** MIDI channel 1..16, for applications that also send MIDI */
    channel?: number;
    /** application-defined instrument or sample assignment key overriding the voice's default */
    instrument?: string;
}
export interface ControlEvent {
    type: 'control';
    tick: Tick;
    voice: string;
    /** MIDI controller number 0..127 */
    controller: number;
    /** 0..127 */
    value: number;
    channel?: number;
}
export type MusicEvent = NoteEvent | ControlEvent;
export interface VoiceInfo {
    id: string;
    /** shown in interfaces and used for stem file names */
    name: string;
}
export interface Timeline {
    tempo: TempoMap;
    /** end of the musical material in ticks (exports add their tail after this) */
    length: Tick;
    voices: VoiceInfo[];
    /** sorted with sortEvents() */
    events: MusicEvent[];
    /** free-form provenance (seed, source item...) for reproducibility notes */
    meta?: Record<string, string | number | boolean>;
}
export declare function constantTempo(bpm: number, ppq: number): TempoMap;
/** Validate and normalise a tempo map (sorted, starting at 0, positive tempos). */
export declare function normaliseTempo(map: TempoMap): TempoMap;
/**
 * Converts ticks to seconds and frames for one tempo map. Segment start times are computed
 * once from exact tick differences; each conversion is then a single multiply-add.
 */
export declare class TimeMap {
    readonly tempo: TempoMap;
    private starts;
    constructor(tempo: TempoMap);
    private secondsPerTick;
    private segment;
    seconds(tick: Tick): number;
    /** Sample frame of a tick (rounded to the nearest frame). */
    frame(tick: Tick, sampleRate: number): number;
    /** The tick at a time (fractional). */
    tick(seconds: number): number;
    bpmAt(tick: Tick): number;
}
/**
 * Canonical order: by tick, then controls before notes at the same tick, then by voice id,
 * then pitch. Stable, so events that compare equal keep their input order.
 */
export declare function sortEvents<T extends MusicEvent>(events: T[]): T[];
export interface TimelineProblem {
    index: number;
    message: string;
}
/** Problems that would make a timeline unrenderable (empty list = fine). */
export declare function validateTimeline(t: Timeline): TimelineProblem[];
/** The last tick anything sounds until (note ends included). */
export declare function lastTick(t: Timeline): Tick;
/** Events of selected voices only (for rendering one stem). */
export declare function eventsForVoices(t: Timeline, voices: Set<string>): MusicEvent[];
/**
 * Turns a MIDI-style stream of note-ons and note-offs into notes with durations, with MIDI
 * pairing semantics: a note-off ends the most recent note-on with the same pairing key
 * (normally channel and pitch), and a note-on for a key that is still sounding first ends
 * the sounding note. Notes still open when `close(tick)` is called end there.
 */
export declare class NotePairer {
    private open;
    readonly notes: NoteEvent[];
    on(key: string, note: Omit<NoteEvent, 'type' | 'duration'>): void;
    off(key: string, tick: Tick): void;
    close(tick: Tick): NoteEvent[];
}
