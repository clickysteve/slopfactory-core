/**
 * Caches transformed sample audio so an expensive transformation runs once per
 * (sample, settings), not once per note. The work is done by a runner: synchronous by default,
 * or a Worker (see WorkerTransformRunner) in the browser.
 */
import { type AudioData } from './transform';
import { type SampleTransform } from './settings';
export interface TransformRunner {
    run(audio: AudioData, t: SampleTransform): Promise<AudioData>;
}
export declare const syncRunner: TransformRunner;
/** Runs transformations in a Worker created from `worker.ts` by the application's bundler. */
export declare class WorkerTransformRunner implements TransformRunner {
    private create;
    private worker;
    private next;
    private pending;
    constructor(create: () => Worker);
    private ensure;
    run(audio: AudioData, t: SampleTransform): Promise<AudioData>;
    dispose(): void;
}
export declare class TransformCache {
    private runner;
    private maxEntries;
    private entries;
    constructor(runner?: TransformRunner, maxEntries?: number);
    /** The transformed audio for a sample id and settings (computed once, then shared). */
    get(sampleId: string, audio: AudioData, t: SampleTransform): Promise<AudioData>;
    has(sampleId: string, t: SampleTransform): boolean;
    /** Forget everything cached for a sample. */
    drop(sampleId: string): void;
    get size(): number;
}
