export interface OutputStageSettings {
    enabled: boolean;
    /** a Good Bits output-stage mode key (cassette, reelToReel, damaged, vinyl, ...) */
    mode: string;
    mixPct: number;
    intensityPct: number;
}
export interface DriveSettings {
    enabled: boolean;
    /** tape | tube | diode | fuzz */
    type: string;
    amountPct: number;
}
export interface CrunchSettings {
    enabled: boolean;
    /** 1..16 (16 = no reduction) */
    bits: number;
    /** 1..32 (1 = no reduction): every n-th sample is held n samples */
    rateDivide: number;
}
export interface ToneSettings {
    enabled: boolean;
    /** one-pole low-pass cutoff, 200..20000 Hz */
    hz: number;
}
export interface OutputFxSettings {
    /** keep the settings but pass audio through unchanged */
    bypass: boolean;
    /** gain before the chain, dB (-24..24) */
    inDb: number;
    /** gain after the chain, dB (-24..24) */
    outDb: number;
    outputStage: OutputStageSettings;
    drive: DriveSettings;
    crunch: CrunchSettings;
    tone: ToneSettings;
}
export declare const OUTPUT_STAGE_MODES: import("../vendor/goodbits/js/outputstage.js").OutputStageInfo[];
export declare const DRIVE_SHAPES: import("../vendor/goodbits/js/outputstage.js").OutputStageInfo[];
export declare function cleanFx(): OutputFxSettings;
/** True when the processor leaves audio exactly as it is. */
export declare function isClean(s: OutputFxSettings): boolean;
/** Named starting points. Names describe what the settings do; none claims to model a machine. */
export interface FxPreset {
    key: string;
    label: string;
    description: string;
    apply(base: OutputFxSettings): OutputFxSettings;
}
export declare const FX_PRESETS: FxPreset[];
/** Which preset (if any) the settings currently match, for display. */
export declare function matchPreset(s: OutputFxSettings): string | null;
/** A short status label, e.g. "CLEAN", "12-BIT", "CRUNCH+DRIVE", "BYPASS". */
export declare function fxLabel(s: OutputFxSettings): string;
/** Validate stored settings, filling anything missing or out of range from the CLEAN defaults. */
export declare function repairFx(src: unknown): OutputFxSettings;
