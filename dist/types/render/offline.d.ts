/**
 * Offline rendering of a Timeline to a master mix and isolated, sample-aligned stems.
 *
 * The same Mixer, NotePlayer, instruments and output-processor worklet as live playback run
 * in an OfflineAudioContext. Each requested output (master, or one voice's stem) becomes two
 * channels of one multichannel render, so every output shares frame 0 = tick 0, the same
 * length (music plus a common tail) and the same sample rate by construction. A render too big
 * for the memory budget is split into several renders of whole outputs; each starts from frame
 * 0 with the same events, so alignment is unchanged.
 *
 * Notes are scheduled in chunks at suspend() points, which also report progress and allow
 * cancellation. Nothing here touches a live AudioContext, a transport or MIDI.
 */
import { type ResolveChoke, type ResolveInstrument } from '../audio/player';
import { Mixer, type StripSettings } from '../audio/mixer';
import { type ChainConfig } from '../engines/chain';
import type { OutputFxSettings } from '../dsp/output/settings';
import { type ControlEvent, type Timeline } from '../events/timeline';
export declare const EXPORT_SAMPLE_RATE = 44100;
export declare const MAX_RENDER_SECONDS: number;
export interface StemRequest {
    voice: string;
    /** include the voice's own output processing */
    processed: boolean;
}
export interface RenderRequest {
    timeline: Timeline;
    sampleRate?: number;
    /** silence-or-ring-out time after the end of the music, shared by every output */
    tailSeconds: number;
    master: boolean;
    stems: StemRequest[];
    strips?: Record<string, Partial<StripSettings>>;
    masterFx?: OutputFxSettings;
    masterGain?: number;
    fxSeed?: number;
    resolve: ResolveInstrument;
    /** choke-group membership of each note (the same function live playback gives its NotePlayer) */
    choke?: ResolveChoke;
    /**
     * The application's own nodes after the master (for example a master compressor), built in
     * the render's context: connect them to `master` and return the last one. Applied to the
     * master output only, never to stems.
     */
    masterInsert?: (ctx: BaseAudioContext, master: AudioNode) => AudioNode;
    /**
     * Delay, in frames at the render's sample rate, that `masterInsert` adds (a compressor's
     * look-ahead, for example). The master is rendered that much longer and advanced by it, so
     * it stays sample-aligned with the stems and has the same length.
     */
    masterLatencyFrames?: number;
    /**
     * Silence rendered before the music and then discarded (seconds; rounded up to whole 128-frame
     * blocks), so stateful nodes the application adds settle as they have live (a fresh
     * DynamicsCompressorNode attenuates for its first ~100 ms). Core's own processors are reset
     * where the music starts, so their output is the same as without pre-roll.
     */
    preRollSeconds?: number;
    /** output-processor worklet URL; without it processing is skipped (and reported) */
    fxModuleUrl?: string;
    /**
     * The master output chain (output engines), after master processing and before master gain,
     * exactly as the live Mixer places it. Master output only, never stems.
     */
    masterChain?: ChainConfig;
    /** chain worklet URL (`chain-worklet.js`); needed when masterChain changes audio */
    chainModuleUrl?: string;
    maxPerVoice?: number;
    /** controller events, if the application gives them meaning */
    onControl?: (e: ControlEvent, time: number, mixer: Mixer) => void;
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
    /** bytes of float audio one render may allocate (default 384 MB) */
    memoryBudget?: number;
    /** seconds of music scheduled per chunk */
    chunkSeconds?: number;
    /** for tests: build the context */
    createContext?: (channels: number, frames: number, sampleRate: number) => OfflineAudioContext;
}
export interface RenderOutput {
    kind: 'master' | 'stem';
    voice?: string;
    processed: boolean;
    channels: [Float32Array, Float32Array];
}
export interface RenderResult {
    sampleRate: number;
    frames: number;
    seconds: number;
    /** seconds of music before the tail */
    musicSeconds: number;
    outputs: RenderOutput[];
    /** number of OfflineAudioContext renders used */
    renders: number;
    /** false when output processing could not run (no AudioWorklet or no module URL) */
    processed: boolean;
    /** false when a master chain that changes audio was requested but could not run */
    chainProcessed: boolean;
}
export declare class RenderCancelled extends Error {
    constructor();
}
interface Out {
    kind: 'master' | 'stem';
    voice?: string;
    processed: boolean;
}
/** Split outputs into groups of at most `maxOutputs` (each output is two channels). */
export declare function planRenders(outputs: Out[], frames: number, memoryBudget: number): Out[][];
export declare function renderLength(timeline: Timeline, tailSeconds: number, sampleRate: number): {
    frames: number;
    musicSeconds: number;
};
export declare function renderTimeline(req: RenderRequest): Promise<RenderResult>;
export {};
