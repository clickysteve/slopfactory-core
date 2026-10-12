import type { FxRecipe } from '../vendor/goodbits/js/stretch-fx/render.js';
export type ReverseMode = 'none' | 'pre' | 'post';
export interface SampleTransform {
    enabled: boolean;
    /** reverse before or after the stretch */
    reverse: ReverseMode;
    /** varispeed pitch in semitones (duration changes with it), -24..24 */
    pitch: number;
    /** a Good Bits stretch character key (clean, vintage, cyclic, tape, grain...) */
    character: string;
    /** time-stretch ratio, output length / input length, 0.25..8 (1 = no stretch) */
    ratio: number;
    /** the character's macro sliders, 0..100 (50 = the character's own settings) */
    macros: Record<string, number>;
    drive: {
        enabled: boolean;
        type: string;
        amountPct: number;
    };
    crunch: {
        enabled: boolean;
        bits: number;
        rateDivide: number;
    };
    /** seeds the random engines (granular, repeat, spectral) */
    seed: number;
}
export declare function identityTransform(): SampleTransform;
/** True when applying the transform would do nothing (so the original audio is used as is). */
export declare function isIdentity(t: SampleTransform): boolean;
/** The STRETCH FX recipe for these settings (one stretch pass, or none at ratio 1). */
export declare function toRecipe(t: SampleTransform): FxRecipe;
/** A stable cache key for the transform's audible settings. */
export declare function transformKey(t: SampleTransform): string;
/** Characters in Good Bits' display groups (generic names, as Good Bits shows them). */
export declare function stretchCharacters(): {
    group: string;
    label: string;
    characters: {
        key: string;
        label: string;
        macros: string[];
    }[];
}[];
export declare const MACRO_INFO: Record<string, {
    label: string;
    hint: string;
    default: number;
}>;
export declare function repairTransform(src: unknown): SampleTransform;
