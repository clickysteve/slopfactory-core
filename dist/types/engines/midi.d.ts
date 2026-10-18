/**
 * A serial chain of MIDI engines with note safety built in.
 *
 * Engines transform note-ons and channel messages; they never end notes. The chain records, for
 * every note-on it receives, the note-ons that left the chain because of it, and when that note
 * ends (note-off, or note-on with velocity 0) it sends the matching note-offs itself, no
 * earlier than the note-ons they end. So bypassing, removing, reordering or re-configuring an
 * engine while notes are held, or stopping the transport, can never leave a note stuck:
 * whatever an engine did to a note-on, its note-off follows the recorded result.
 *
 * Where two held notes produce the same output note (same channel and key), the output note-off
 * is sent when the last of them ends. System messages (clock, start, stop, song position) pass
 * through untouched, in order.
 *
 * No MIDI engine is built in yet (The Good Bits has no MIDI processing to extract); this is the
 * contract and plumbing that future MIDI engines plug into.
 */
import { type ChainConfig } from './chain';
import type { MidiEngineDef, MidiMessage } from './types';
export interface MidiEngineLookup {
    midi(id: string): MidiEngineDef | undefined;
}
export declare class MidiEngineChain {
    private engines;
    private out;
    private cfg;
    private stages;
    /** input note -> the output notes it produced, with their note-on times */
    private held;
    /** output note -> number of input notes holding it */
    private holders;
    constructor(engines: MidiEngineLookup, config: ChainConfig, out: (msg: MidiMessage) => void);
    get config(): ChainConfig;
    /** Output notes currently sounding. */
    get sounding(): number;
    private create;
    private build;
    /** Change the chain. Held notes keep their recorded outputs and end correctly. */
    set(config: ChainConfig): void;
    private run;
    private release;
    /** Send one message into the chain. */
    send(msg: MidiMessage): void;
    /** End every note the chain started (no earlier than its note-on) and reset the engines. */
    panic(time: number): void;
    /** Transport stop: the same as panic. */
    stop(time: number): void;
}
