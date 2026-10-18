/** Processes a stereo block in place. */
export interface Kernel {
    process(L: Float32Array, R: Float32Array, n: number): void;
    /** change parameters in place; false = cannot, rebuild the kernel instead */
    update?(params: Record<string, unknown>): boolean;
}
/** Length of an in-place parameter ramp, in samples (20 ms). */
export declare const rampFrames: (sampleRate: number) => number;
/** A value that moves linearly to its target over a number of samples and then holds it exactly. */
export declare class Ramp {
    value: number;
    private step;
    private left;
    private goal;
    constructor(value: number);
    get target(): number;
    get steady(): boolean;
    to(target: number, frames: number): void;
    next(): number;
}
export interface OutputStageParams {
    mode: string;
    mixPct: number;
    intensityPct: number;
}
/** Good Bits output stage (applyOutputStage): a character mode, intensity, then mix. */
export declare function outputStageKernel(sampleRate: number, p: OutputStageParams, seed: number): Kernel;
export interface DriveParams {
    type: string;
    amountPct: number;
}
/** Good Bits drive (applyDrive): out = (1 - d) x + d shape(x, 1 + 5d, d). */
export declare function driveKernel(sampleRate: number, p: DriveParams): Kernel;
export interface CrunchParams {
    bits: number;
    rateDivide: number;
}
/** Good Bits crunch (applyCrunch): every n-th sample held n samples, then quantised. */
export declare function crunchKernel(p: CrunchParams): Kernel;
export interface ToneParams {
    hz: number;
}
/** Tone: Good Bits' one-pole low-pass (makeOnePoleLP) per channel. 20 kHz and above = off. */
export declare function toneKernel(sampleRate: number, p: ToneParams): Kernel;
/** A fixed gain (the combined processor's IN and OUT dB). */
export declare function gainKernel(gain: number): Kernel;
