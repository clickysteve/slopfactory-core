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
import { emptyChain, type ChainConfig } from './chain';
import { OUTPUT_CHAIN_PROCESSOR } from './constants';

const loaded = new WeakMap<BaseAudioContext, Map<string, Promise<boolean>>>();

export function loadOutputChain(ctx: BaseAudioContext, moduleUrl: string): Promise<boolean> {
  let byUrl = loaded.get(ctx);
  if (!byUrl) loaded.set(ctx, (byUrl = new Map()));
  let p = byUrl.get(moduleUrl);
  if (!p) {
    p = (async () => {
      try {
        if (!ctx.audioWorklet) return false;
        await ctx.audioWorklet.addModule(moduleUrl);
        return true;
      } catch {
        return false;
      }
    })();
    byUrl.set(moduleUrl, p);
  }
  return p;
}

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
export function createChainNode(ctx: BaseAudioContext, config: ChainConfig = emptyChain(), opts: ChainNodeOptions): ChainNode {
  let current = config;
  if (opts.available && typeof AudioWorkletNode !== 'undefined') {
    const node = new AudioWorkletNode(ctx, opts.processor ?? OUTPUT_CHAIN_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      processorOptions: { config, seed: (opts.seed ?? 1) >>> 0, ...(opts.resetAt !== undefined ? { resetAt: opts.resetAt } : {}) },
    });
    return {
      node,
      processing: true,
      get config() {
        return current;
      },
      set(c) {
        current = c;
        node.port.postMessage({ type: 'config', config: c });
      },
      reset(at) {
        node.port.postMessage({ type: 'reset', at });
      },
      dispose() {
        node.disconnect();
        node.port.onmessage = null;
        node.port.close();
      },
    };
  }
  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  return {
    node: g,
    processing: false,
    get config() {
      return current;
    },
    set(c) {
      current = c;
    },
    reset() {},
    dispose() {
      g.disconnect();
    },
  };
}
