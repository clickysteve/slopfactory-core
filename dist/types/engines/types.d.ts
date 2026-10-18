/**
 * The output-engine plugin contract.
 *
 * There are two kinds of engine, with separate interfaces, because they are different things:
 *
 * - An **audio engine** processes a continuous stereo stream. It provides a block kernel (plain
 *   JavaScript over Float32Arrays), not AudioNodes: the output chain runs its kernels inside one
 *   AudioWorklet for live playback (AudioContext) and offline rendering (OfflineAudioContext),
 *   and over plain buffers (`renderChain`). One implementation serves all three.
 * - A **MIDI engine** transforms MIDI messages. It is not an AudioNode and never touches audio.
 *   The MIDI chain (`MidiEngineChain`) owns note-off routing, so a MIDI engine cannot leave a
 *   note stuck when it is bypassed, removed or stopped.
 */
import type { Kernel } from '../dsp/output/kernels';
import type { ParamDef, ParamValues } from './params';
export type { Kernel };
/** What an engine consumes and produces. */
export type SignalType = 'audio' | 'midi';
interface EngineBase {
    /** stable identifier stored in configurations, e.g. "goodbits.drive" (never reused) */
    id: string;
    /** display name, e.g. "Drive" */
    name: string;
    /** behaviour version: raised when the same parameters would sound different */
    version: number;
    description: string;
    /** where the algorithm comes from, for display and documentation */
    origin?: string;
    /** a grouping hint for menus (e.g. "character", "saturation", "lo-fi", "filter") */
    category?: string;
    params: readonly ParamDef[];
    presets?: readonly EnginePreset[];
}
/** Named parameter values for one engine. */
export interface EnginePreset {
    key: string;
    label: string;
    description?: string;
    params: Partial<ParamValues>;
}
export interface AudioEngineDef extends EngineBase {
    kind: 'audio';
    inputs: readonly ['audio'];
    outputs: readonly ['audio'];
    /**
     * Can run while audio plays (inside the chain worklet). Engines that need the whole buffer
     * (time-stretch, look-ahead) are not output engines and do not belong here.
     */
    realtime: true;
    /** runs in OfflineAudioContext and over buffers with the same result as live */
    offline: boolean;
    /** samples of delay the engine adds (0: none; the chain does not compensate) */
    latency: 0;
    /** uses its seed (noise, random events); others ignore it */
    seeded?: boolean;
    /**
     * A fresh kernel for these (already validated) parameters. State (filters, noise, counters)
     * starts from the seed, so equal arguments give equal output.
     */
    createKernel(sampleRate: number, params: ParamValues, seed: number): Kernel;
}
/** A MIDI message with its time (performance.now() milliseconds, or any monotonic clock). */
export interface MidiMessage {
    bytes: number[];
    time: number;
}
export interface MidiProcessor {
    /**
     * Transform one message: call `emit` for each message to send on (none to drop it). The
     * chain only passes note-ons and non-note messages here; it ends notes itself.
     */
    process(msg: MidiMessage, emit: (msg: MidiMessage) => void): void;
    /** change parameters in place; false = rebuild the processor */
    update?(params: ParamValues): boolean;
    /** forget any state (transport stop, panic) */
    reset?(): void;
}
export interface MidiEngineDef extends EngineBase {
    kind: 'midi';
    inputs: readonly ['midi'];
    outputs: readonly ['midi'];
    createProcessor(params: ParamValues): MidiProcessor;
}
export type EngineDef = AudioEngineDef | MidiEngineDef;
