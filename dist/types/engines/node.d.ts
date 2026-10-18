/**
 * Output-chain nodes for any BaseAudioContext (live or offline).
 *
 * `loadOutputChain(ctx, moduleUrl)` registers the chain worklet once per context. The module URL
 * comes from the application's bundler (for Vite: `import url from
 * '@slopfactory/core/chain-worklet.js?url'`), so Core makes no assumption about how it is served.
 *
 * Without AudioWorklet (an insecure context or an old browser) `createChainNode` returns a
 * plain stereo pass-through and reports `processing: false`, so audio still plays, unprocessed.
 */
import { type ChainConfig } from './chain';
export declare function loadOutputChain(ctx: BaseAudioContext, moduleUrl: string): Promise<boolean>;
export interface ChainNode {
    /** connect the source to it and it to the destination (one node: input and output) */
    readonly node: AudioNode;
    /** false when the browser could not run the worklet: audio passes through unprocessed */
    readonly processing: boolean;
    readonly config: ChainConfig;
    set(config: ChainConfig): void;
    /** restart every stage's state at context time `at` */
    reset(at: number): void;
    dispose(): void;
}
export interface ChainNodeOptions {
    /** the resolved result of loadOutputChain for this context */
    available: boolean;
    /** seed for seeded engines (noise, random events) */
    seed?: number;
    /** restart the stages' state at this context time (part of construction, so never late) */
    resetAt?: number;
    /** processor name (an application's own worklet may register another) */
    processor?: string;
}
/** A stereo node that runs a chain. Mono sources are up-mixed to two channels. */
export declare function createChainNode(ctx: BaseAudioContext, config: ChainConfig | undefined, opts: ChainNodeOptions): ChainNode;
