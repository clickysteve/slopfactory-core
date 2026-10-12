import { type OutputFxSettings } from './settings';
export declare function loadOutputFx(ctx: BaseAudioContext, moduleUrl: string): Promise<boolean>;
export declare function outputFxAvailable(ctx: BaseAudioContext): Promise<boolean>;
export interface OutputFxNode {
    readonly node: AudioNode;
    /** false when the browser could not run the worklet: audio passes through unprocessed */
    readonly processing: boolean;
    settings: OutputFxSettings;
    set(settings: OutputFxSettings): void;
    /** restart processor state at context time `at` */
    reset(at: number): void;
    dispose(): void;
}
/** `available` must be the resolved result of loadOutputFx for this context. */
export declare function createOutputFxNode(ctx: BaseAudioContext, settings: OutputFxSettings, seed: number, available: boolean): OutputFxNode;
/** Does this processor need the worklet at all? (CLEAN can run without it.) */
export declare const needsProcessing: (s: OutputFxSettings) => boolean;
