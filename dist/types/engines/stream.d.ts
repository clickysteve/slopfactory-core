import { type AudioEngineLookup, type ChainConfig } from './chain';
/** Samples over which a structural, bypass or kernel change crossfades (about 12 ms at 44.1 kHz). */
export declare const CHAIN_FADE = 512;
export declare class ChainStream {
    private engines;
    readonly sampleRate: number;
    readonly seed: number;
    private cfg;
    private runners;
    private oldRunners;
    private fadeLeft;
    private wet;
    private scratch;
    private cL;
    private cR;
    private xL;
    private xR;
    constructor(engines: AudioEngineLookup, config: ChainConfig, sampleRate: number, seed: number);
    get config(): ChainConfig;
    /** True when the chain leaves audio unchanged and nothing is fading. */
    get idle(): boolean;
    private build;
    set(config: ChainConfig): void;
    /** Start every stage's state afresh (noise, filters, counters), with no crossfade. */
    reset(): void;
    private grow;
    private run;
    /** Process a stereo block in place. */
    process(L: Float32Array, R: Float32Array, n?: number): void;
}
export interface RenderChainOptions {
    /** engines to resolve stage ids with (default: Core's built-in engines) */
    engines?: AudioEngineLookup;
    /** block size (default 128, as in an AudioWorklet); the result does not depend on it */
    blockSize?: number;
}
/**
 * Run a chain over whole buffers: the offline path, the same code as the worklet. One channel
 * in gives one channel out (processed as identical left and right, as Good Bits does); the
 * input is not modified.
 */
export declare function renderChain(channels: readonly Float32Array[], sampleRate: number, config: ChainConfig, seed: number, opts?: RenderChainOptions): Float32Array[];
