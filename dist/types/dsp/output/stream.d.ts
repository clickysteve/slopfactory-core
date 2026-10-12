import { type OutputFxSettings } from './settings';
/** Processes a stereo block in place. */
export type BlockFn = (l: Float32Array, r: Float32Array, n: number) => void;
/** Build the chain for one set of settings. Its state (filters, noise, hold counter) starts fresh. */
export declare function createChain(s: OutputFxSettings, sampleRate: number, seed: number): BlockFn;
/** Samples over which a settings change crossfades from the old chain to the new one. */
export declare const SETTINGS_FADE = 256;
/**
 * A processor whose settings can change while it runs. A change starts a new chain and
 * crossfades from the old one over SETTINGS_FADE samples, so switching never clicks.
 */
export declare class OutputFxStream {
    private settings;
    readonly sampleRate: number;
    readonly seed: number;
    private chain;
    private old;
    private fadeLeft;
    private scratchL;
    private scratchR;
    constructor(settings: OutputFxSettings, sampleRate: number, seed: number);
    get current(): OutputFxSettings;
    set(settings: OutputFxSettings): void;
    /** Start the current settings' state afresh (noise, filters, hold phase), with no crossfade. */
    reset(): void;
    process(L: Float32Array, R: Float32Array, n?: number): void;
}
/** Run a processor over whole stereo buffers (offline helper; same code as the worklet). */
export declare function processBuffers(channels: Float32Array[], sampleRate: number, settings: OutputFxSettings, seed: number, blockSize?: number): Float32Array[];
