import type { AudioEngineDef } from './types';
export declare const OUTPUT_STAGE_ENGINE: AudioEngineDef;
export declare const DRIVE_ENGINE: AudioEngineDef;
export declare const CRUNCH_ENGINE: AudioEngineDef;
export declare const TONE_ENGINE: AudioEngineDef;
/** Every built-in audio engine, in Good Bits' chain order. Immutable. */
export declare const BUILTIN_AUDIO_ENGINES: readonly AudioEngineDef[];
/** The Good Bits' own selection (its original three stages). */
export declare const GOOD_BITS_ENGINE_IDS: readonly string[];
