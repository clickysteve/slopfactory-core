/**
 * Audio routing shared by live playback and offline rendering:
 *
 *   instrument notes -> voice input -> voice processing -> voice gain -> pan -> mute/solo gate --+
 *                            \-> (dry tap: gain -> pan -> gate, for unprocessed stems)            |
 *                                                                                                 v
 *                                       master bus -> master processing -> master gain -> output
 *
 * Every voice also exposes its processed signal as a tap (post gate) for stem rendering.
 * Works on any BaseAudioContext. Deliberately not a DAW mixer: no sends, no automation.
 */
import { type OutputFxNode } from '../dsp/output/node';
import { type OutputFxSettings } from '../dsp/output/settings';
import type { ChainConfig } from '../engines/chain';
import { type ChainNode } from '../engines/node';
export interface StripSettings {
    gain: number;
    /** -1..1 */
    pan: number;
    mute: boolean;
    solo: boolean;
    fx: OutputFxSettings;
}
export declare const defaultStrip: () => StripSettings;
export interface MixerOptions {
    voices: string[];
    strips?: Record<string, Partial<StripSettings>>;
    masterFx?: OutputFxSettings;
    masterGain?: number;
    /** resolved result of loadOutputFx() for this context */
    fxAvailable: boolean;
    /** base seed for the processors' noise generators */
    seed?: number;
    /** build unprocessed taps as well (only needed for unprocessed stem export) */
    dryTaps?: boolean;
    /** restart every processor's state at this context time (built in, so it is never late) */
    resetAt?: number;
    /**
     * A master output chain (output engines) after the master processing and before the master
     * gain. Built only when given (an empty chain is fine, and can be changed later).
     */
    masterChain?: ChainConfig;
    /** resolved result of loadOutputChain() for this context */
    chainAvailable?: boolean;
}
/** Deterministic per-strip seed. */
export declare const stripSeed: (seed: number, index: number) => number;
export declare class Mixer {
    readonly ctx: BaseAudioContext;
    private strips;
    readonly masterBus: GainNode;
    readonly masterFx: OutputFxNode;
    /** the master output chain, when MixerOptions.masterChain was given */
    readonly masterChain: ChainNode | null;
    readonly output: GainNode;
    readonly voices: string[];
    constructor(ctx: BaseAudioContext, opts: MixerOptions);
    private strip;
    /** Where an instrument playing on this voice connects. */
    input(id: string): AudioNode;
    /** The voice's processed signal after gain, pan and mute (a stem). */
    processedTap(id: string): AudioNode;
    /** The voice's signal before processing, after gain, pan and mute (requires dryTaps). */
    dryTap(id: string): AudioNode;
    settings(id: string): StripSettings;
    setStrip(id: string, patch: Partial<StripSettings>): void;
    setMasterFx(fx: OutputFxSettings): void;
    /** Change the master output chain (requires MixerOptions.masterChain). */
    setMasterChain(config: ChainConfig): void;
    setMasterGain(g: number): void;
    /** Restart every processor's state at context time `at` (live START). */
    resetFx(at: number): void;
    /** Whether output processing actually runs (false: the browser lacks AudioWorklet). */
    get processing(): boolean;
    private ramp;
    private applyLevels;
    dispose(): void;
}
