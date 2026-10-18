/**
 * The output-chain AudioWorklet processor. It only moves blocks in and out of a ChainStream, so
 * live playback (AudioContext) and offline rendering (OfflineAudioContext) run exactly the same
 * DSP code as `renderChain`.
 *
 * `registerChainProcessor(engines)` registers it for a set of engines. Core's own worklet file
 * (`chain-worklet.js`) registers the built-in engines; an application with engines of its own
 * builds a worklet entry that calls this with its engine list.
 *
 * Messages: { type: 'config', config } changes the chain (crossfaded where needed);
 *           { type: 'reset', at } restarts every stage's state at context time `at` (seconds).
 */
import { emptyChain, type ChainConfig } from './chain';
import { OUTPUT_CHAIN_PROCESSOR } from './constants';
import { EngineRegistry } from './registry';
import { ChainStream } from './stream';
import type { AudioEngineDef } from './types';

declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}

interface Options {
  processorOptions?: { config?: ChainConfig; seed?: number; resetAt?: number };
}

export function registerChainProcessor(engines: readonly AudioEngineDef[], name = OUTPUT_CHAIN_PROCESSOR): void {
  const registry = new EngineRegistry(engines);

  class OutputChainProcessor extends AudioWorkletProcessor {
    private stream: ChainStream;
    private resetAt: number | null = null;

    constructor(options: Options) {
      super(options);
      const po = options.processorOptions ?? {};
      this.stream = new ChainStream(registry, po.config ?? emptyChain(), sampleRate, (po.seed ?? 1) >>> 0);
      if (typeof po.resetAt === 'number') this.resetAt = po.resetAt;
      this.port.onmessage = (e: MessageEvent) => {
        const m = e.data as { type: string; config?: ChainConfig; at?: number };
        if (m.type === 'config' && m.config) this.stream.set(m.config);
        else if (m.type === 'reset') this.resetAt = typeof m.at === 'number' ? m.at : 0;
      };
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
      const out = outputs[0];
      const L = out[0];
      const R = out[1] ?? out[0];
      const inp = inputs[0] ?? [];
      if (inp.length > 0) {
        L.set(inp[0]);
        R.set(inp[1] ?? inp[0]);
      } else {
        L.fill(0);
        R.fill(0);
      }
      if (this.resetAt !== null && currentTime >= this.resetAt) {
        this.stream.reset();
        this.resetAt = null;
      }
      this.stream.process(L, R, L.length);
      return true;
    }
  }

  registerProcessor(name, OutputChainProcessor);
}
