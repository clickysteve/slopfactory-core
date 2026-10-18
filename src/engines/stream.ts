/**
 * The output chain as a block processor. The same class runs inside the chain AudioWorklet
 * (live AudioContext and OfflineAudioContext) and over plain buffers (`renderChain`), so what
 * an application plays and what it exports come from one implementation.
 *
 * Changes while running never click:
 * - a parameter the engine can change in place ramps (mix, intensity, drive amount);
 * - any other parameter change builds a new kernel for that stage and crossfades to it;
 * - enabling or bypassing a stage, or the whole chain, crossfades between processed and dry
 *   (a re-enabled stage starts from fresh state);
 * - adding, removing, reordering or replacing stages builds the new chain and crossfades from
 *   the old one.
 * With nothing changing, a stage's output is exactly its kernel's output, and a disabled stage
 * or a bypassed chain is exactly the input.
 */
import { Ramp, type Kernel } from '../dsp/output/kernels';
import { chainActive, repairChain, stageSeeds, type AudioEngineLookup, type ChainConfig, type StageConfig } from './chain';
import { coreEngines } from './registry';
import type { AudioEngineDef } from './types';

/** Samples over which a structural, bypass or kernel change crossfades (about 12 ms at 44.1 kHz). */
export const CHAIN_FADE = 512;

interface Scratch {
  dL: Float32Array;
  dR: Float32Array;
  oL: Float32Array;
  oR: Float32Array;
}

const sameParams = (a: StageConfig['params'], b: StageConfig['params']) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

class StageRunner {
  private kernel: Kernel | null = null;
  private old: Kernel | null = null;
  private fadeLeft = 0;
  private wet: Ramp;

  constructor(private def: AudioEngineDef | undefined, private stage: StageConfig, private sampleRate: number, private seed: number) {
    this.wet = new Ramp(stage.enabled ? 1 : 0);
    if (def && stage.enabled) this.kernel = this.create();
  }

  private create(): Kernel | null {
    return this.def ? this.def.createKernel(this.sampleRate, this.stage.params, this.seed) : null;
  }

  update(stage: StageConfig): void {
    const prev = this.stage;
    this.stage = stage;
    if (!this.def) return;
    if (stage.enabled && !prev.enabled) {
      if (this.wet.steady && this.wet.value === 0) {
        // re-enabled from fully bypassed: fresh state, faded in
        this.kernel = this.create();
        this.old = null;
        this.fadeLeft = 0;
      }
      this.wet.to(1, CHAIN_FADE);
    } else if (!stage.enabled && prev.enabled) this.wet.to(0, CHAIN_FADE);
    if (sameParams(prev.params, stage.params) || !this.kernel) return;
    if (this.kernel.update?.(stage.params)) return;
    if (!this.old) {
      this.old = this.kernel;
      this.fadeLeft = CHAIN_FADE;
    }
    this.kernel = this.create();
  }

  process(L: Float32Array, R: Float32Array, n: number, s: Scratch): void {
    const k = this.kernel;
    const w = this.wet;
    if (!k || (w.steady && w.value === 0)) return;
    const blend = !w.steady || w.value !== 1;
    if (blend) {
      s.dL.set(L.subarray(0, n));
      s.dR.set(R.subarray(0, n));
    }
    if (this.old) {
      const { oL, oR } = s;
      oL.set(L.subarray(0, n));
      oR.set(R.subarray(0, n));
      this.old.process(oL, oR, n);
      k.process(L, R, n);
      for (let i = 0; i < n && this.fadeLeft > 0; i++, this.fadeLeft--) {
        const t = 1 - this.fadeLeft / CHAIN_FADE;
        L[i] = oL[i] + (L[i] - oL[i]) * t;
        R[i] = oR[i] + (R[i] - oR[i]) * t;
      }
      if (this.fadeLeft <= 0) this.old = null;
    } else k.process(L, R, n);
    if (blend) {
      const { dL, dR } = s;
      for (let i = 0; i < n; i++) {
        const g = w.next();
        L[i] = dL[i] + (L[i] - dL[i]) * g;
        R[i] = dR[i] + (R[i] - dR[i]) * g;
      }
    }
  }
}

const structure = (c: ChainConfig) => JSON.stringify(c.stages.map((s) => [s.id, s.engine]));

export class ChainStream {
  private cfg: ChainConfig;
  private runners: StageRunner[];
  private oldRunners: StageRunner[] | null = null;
  private fadeLeft = 0;
  private wet: Ramp;
  private scratch: Scratch = { dL: new Float32Array(128), dR: new Float32Array(128), oL: new Float32Array(128), oR: new Float32Array(128) };
  private cL = new Float32Array(128);
  private cR = new Float32Array(128);
  private xL = new Float32Array(128);
  private xR = new Float32Array(128);

  constructor(private engines: AudioEngineLookup, config: ChainConfig, readonly sampleRate: number, readonly seed: number) {
    this.cfg = repairChain(config, engines);
    this.runners = this.build();
    this.wet = new Ramp(this.cfg.bypass ? 0 : 1);
  }

  get config(): ChainConfig {
    return this.cfg;
  }

  /** True when the chain leaves audio unchanged and nothing is fading. */
  get idle(): boolean {
    return !this.oldRunners && this.wet.steady && (this.wet.value === 0 || !chainActive(this.cfg, this.engines));
  }

  private build(): StageRunner[] {
    const seeds = stageSeeds(this.cfg, this.seed);
    return this.cfg.stages.map((s, i) => new StageRunner(this.engines.audio(s.engine), s, this.sampleRate, seeds[i]));
  }

  set(config: ChainConfig): void {
    const next = repairChain(config, this.engines);
    const prev = this.cfg;
    this.cfg = next;
    if (next.bypass !== prev.bypass) {
      if (!next.bypass && this.wet.steady && this.wet.value === 0) {
        // restored from fully bypassed: start the stages afresh
        this.runners = this.build();
        this.oldRunners = null;
        this.fadeLeft = 0;
      }
      this.wet.to(next.bypass ? 0 : 1, CHAIN_FADE);
    }
    if (structure(next) !== structure(prev)) {
      if (!this.oldRunners) {
        this.oldRunners = this.runners;
        this.fadeLeft = CHAIN_FADE;
      }
      this.runners = this.build();
      return;
    }
    next.stages.forEach((s, i) => this.runners[i].update(s));
  }

  /** Start every stage's state afresh (noise, filters, counters), with no crossfade. */
  reset(): void {
    this.oldRunners = null;
    this.fadeLeft = 0;
    this.wet = new Ramp(this.cfg.bypass ? 0 : 1);
    this.runners = this.build();
  }

  private grow(n: number): void {
    if (this.cL.length >= n) return;
    this.scratch = { dL: new Float32Array(n), dR: new Float32Array(n), oL: new Float32Array(n), oR: new Float32Array(n) };
    this.cL = new Float32Array(n);
    this.cR = new Float32Array(n);
    this.xL = new Float32Array(n);
    this.xR = new Float32Array(n);
  }

  private run(runners: StageRunner[], L: Float32Array, R: Float32Array, n: number): void {
    for (const r of runners) r.process(L, R, n, this.scratch);
  }

  /** Process a stereo block in place. */
  process(L: Float32Array, R: Float32Array, n = L.length): void {
    const w = this.wet;
    if (w.steady && w.value === 0) return;
    this.grow(n);
    const blend = !w.steady || w.value !== 1;
    if (blend) {
      this.cL.set(L.subarray(0, n));
      this.cR.set(R.subarray(0, n));
    }
    if (this.oldRunners) {
      const { xL, xR } = this;
      xL.set(L.subarray(0, n));
      xR.set(R.subarray(0, n));
      this.run(this.oldRunners, xL, xR, n);
      this.run(this.runners, L, R, n);
      for (let i = 0; i < n && this.fadeLeft > 0; i++, this.fadeLeft--) {
        const t = 1 - this.fadeLeft / CHAIN_FADE;
        L[i] = xL[i] + (L[i] - xL[i]) * t;
        R[i] = xR[i] + (R[i] - xR[i]) * t;
      }
      if (this.fadeLeft <= 0) this.oldRunners = null;
    } else this.run(this.runners, L, R, n);
    if (blend) {
      const { cL, cR } = this;
      for (let i = 0; i < n; i++) {
        const g = w.next();
        L[i] = cL[i] + (L[i] - cL[i]) * g;
        R[i] = cR[i] + (R[i] - cR[i]) * g;
      }
    }
  }
}

export interface RenderChainOptions {
  /** engines to resolve stage ids with (default: Core's built-in engines) */
  engines?: AudioEngineLookup;
  /** block size (default 128, as in an AudioWorklet); the result does not depend on it */
  blockSize?: number;
}

let builtin: AudioEngineLookup | null = null;

/**
 * Run a chain over whole buffers: the offline path, the same code as the worklet. One channel
 * in gives one channel out (processed as identical left and right, as Good Bits does); the
 * input is not modified.
 */
export function renderChain(channels: readonly Float32Array[], sampleRate: number, config: ChainConfig, seed: number, opts: RenderChainOptions = {}): Float32Array[] {
  const engines = opts.engines ?? (builtin ??= coreEngines());
  const L = Float32Array.from(channels[0] ?? []);
  const R = Float32Array.from(channels[1] ?? channels[0] ?? []);
  const s = new ChainStream(engines, config, sampleRate, seed >>> 0);
  if (!s.idle) {
    const block = Math.max(1, opts.blockSize ?? 128);
    for (let i = 0; i < L.length; i += block) {
      const n = Math.min(block, L.length - i);
      s.process(L.subarray(i, i + n), R.subarray(i, i + n), n);
    }
  }
  return channels.length > 1 ? [L, R] : [L];
}
