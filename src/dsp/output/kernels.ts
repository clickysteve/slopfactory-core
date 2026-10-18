/**
 * Block kernels for the Good Bits lo-fi stages: one stage each, processing a stereo block in
 * place. These are the only implementation of the stages in Core: the combined output
 * processor (`createChain` in stream.ts) and the output-engine plugins (`../../engines`) are
 * both built from them, live (AudioWorklet), offline (OfflineAudioContext) and over plain
 * buffers.
 *
 * Every kernel calls the vendored Good Bits code (`MODE_FACTORIES`, `driveShapeFor`,
 * `makeOnePoleLP`) or repeats its arithmetic exactly (crunch, mix/intensity), and rounds to
 * 32-bit float on output as Good Bits' whole-buffer functions do when they write a stage into a
 * Float32Array. With steady parameters the output is bit-identical to `applyOutputStage`,
 * `applyDrive` and `applyCrunch` on the same input and seed, whatever the block size.
 *
 * `update()` changes parameters in place where that can be done smoothly (a short linear ramp
 * on mix, intensity and drive amount) and returns false where it cannot (a different mode,
 * shape, bit depth, rate or cutoff), in which case the caller builds a new kernel and
 * crossfades to it.
 */
import { driveShapeFor, makeOnePoleLP, makeRng, MODE_FACTORIES } from '../vendor/goodbits/js/outputstage.js';

/** Processes a stereo block in place. */
export interface Kernel {
  process(L: Float32Array, R: Float32Array, n: number): void;
  /** change parameters in place; false = cannot, rebuild the kernel instead */
  update?(params: Record<string, unknown>): boolean;
}

const f32 = Math.fround;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);

/** Length of an in-place parameter ramp, in samples (20 ms). */
export const rampFrames = (sampleRate: number): number => Math.max(1, Math.round(sampleRate * 0.02));

/** A value that moves linearly to its target over a number of samples and then holds it exactly. */
export class Ramp {
  private step = 0;
  private left = 0;
  private goal = 0;
  constructor(public value: number) {}
  get target(): number {
    return this.left > 0 ? this.goal : this.value;
  }
  get steady(): boolean {
    return this.left === 0;
  }
  to(target: number, frames: number): void {
    if (this.left === 0 && target === this.value) return;
    this.goal = target;
    this.left = Math.max(1, frames);
    this.step = (target - this.value) / this.left;
  }
  next(): number {
    if (this.left > 0) {
      this.left--;
      this.value = this.left === 0 ? this.goal : this.value + this.step;
    }
    return this.value;
  }
}

export interface OutputStageParams {
  mode: string;
  mixPct: number;
  intensityPct: number;
}

/** Good Bits output stage (applyOutputStage): a character mode, intensity, then mix. */
export function outputStageKernel(sampleRate: number, p: OutputStageParams, seed: number): Kernel {
  const factory = p.mode !== 'clean' ? MODE_FACTORIES[p.mode] : undefined;
  if (!factory) return { process() {}, update: (q) => q.mode === p.mode };
  const stage = factory(sampleRate, makeRng(seed >>> 0));
  // applyOutputStage leaves audio untouched at mix <= 0.0001
  const mixOf = (pct: unknown) => {
    const m = clamp01(num(pct, 100) / 100);
    return m <= 0.0001 ? 0 : m;
  };
  const mix = new Ramp(mixOf(p.mixPct));
  const intensity = new Ramp(clamp01(num(p.intensityPct, 50) / 100));
  const frames = rampFrames(sampleRate);
  return {
    process(L, R, n) {
      if (mix.steady && intensity.steady) {
        const m = mix.value;
        const t = intensity.value;
        if (m === 0) return;
        for (let k = 0; k < n; k++) {
          const l = L[k];
          const r = R[k];
          const [rawL, rawR] = stage(l, r);
          const wetL = l + (rawL - l) * t;
          const wetR = r + (rawR - r) * t;
          L[k] = f32(l + (wetL - l) * m);
          R[k] = f32(r + (wetR - r) * m);
        }
        return;
      }
      for (let k = 0; k < n; k++) {
        const m = mix.next();
        const t = intensity.next();
        const l = L[k];
        const r = R[k];
        const [rawL, rawR] = stage(l, r);
        const wetL = l + (rawL - l) * t;
        const wetR = r + (rawR - r) * t;
        L[k] = f32(l + (wetL - l) * m);
        R[k] = f32(r + (wetR - r) * m);
      }
    },
    update(q) {
      if (q.mode !== p.mode) return false;
      mix.to(mixOf(q.mixPct), frames);
      intensity.to(clamp01(num(q.intensityPct, 50) / 100), frames);
      return true;
    },
  };
}

export interface DriveParams {
  type: string;
  amountPct: number;
}

/** Good Bits drive (applyDrive): out = (1 - d) x + d shape(x, 1 + 5d, d). */
export function driveKernel(sampleRate: number, p: DriveParams): Kernel {
  const shape = driveShapeFor(p.type);
  const amount = new Ramp(clamp01(num(p.amountPct, 0) / 100));
  const frames = rampFrames(sampleRate);
  return {
    process(L, R, n) {
      if (amount.steady) {
        const d = amount.value;
        // applyDrive is a no-op at d <= 0.0001
        if (d <= 0.0001) return;
        const g = 1 + d * 5;
        for (let k = 0; k < n; k++) {
          L[k] = f32((1 - d) * L[k] + d * shape(L[k], g, d));
          R[k] = f32((1 - d) * R[k] + d * shape(R[k], g, d));
        }
        return;
      }
      for (let k = 0; k < n; k++) {
        const d = amount.next();
        const g = 1 + d * 5;
        L[k] = f32((1 - d) * L[k] + d * shape(L[k], g, d));
        R[k] = f32((1 - d) * R[k] + d * shape(R[k], g, d));
      }
    },
    update(q) {
      if (q.type !== p.type) return false;
      amount.to(clamp01(num(q.amountPct, 0) / 100), frames);
      return true;
    },
  };
}

export interface CrunchParams {
  bits: number;
  rateDivide: number;
}

/** Good Bits crunch (applyCrunch): every n-th sample held n samples, then quantised. */
export function crunchKernel(p: CrunchParams): Kernel {
  const bits = Math.max(1, Math.min(16, Math.round(num(p.bits, 16))));
  const rate = Math.max(1, Math.min(32, Math.round(num(p.rateDivide, 1))));
  const hasBits = bits < 16;
  const hasRate = rate > 1;
  const same = (q: Record<string, unknown>) => q.bits === p.bits && q.rateDivide === p.rateDivide;
  if (!hasBits && !hasRate) return { process() {}, update: same };
  const step = 2 / Math.pow(2, bits);
  let index = 0;
  let heldL = 0;
  let heldR = 0;
  return {
    process(L, R, n) {
      for (let k = 0; k < n; k++) {
        if (!hasRate || index % rate === 0) {
          heldL = L[k];
          heldR = R[k];
        }
        index++;
        L[k] = hasBits ? f32(Math.round(heldL / step) * step) : heldL;
        R[k] = hasBits ? f32(Math.round(heldR / step) * step) : heldR;
      }
    },
    update: same,
  };
}

export interface ToneParams {
  hz: number;
}

/** Tone: Good Bits' one-pole low-pass (makeOnePoleLP) per channel. 20 kHz and above = off. */
export function toneKernel(sampleRate: number, p: ToneParams): Kernel {
  const same = (q: Record<string, unknown>) => q.hz === p.hz;
  if (!(p.hz < 20000)) return { process() {}, update: same };
  const lpL = makeOnePoleLP(sampleRate, p.hz);
  const lpR = makeOnePoleLP(sampleRate, p.hz);
  return {
    process(L, R, n) {
      for (let k = 0; k < n; k++) {
        L[k] = f32(lpL(L[k]));
        R[k] = f32(lpR(R[k]));
      }
    },
    update: same,
  };
}

/** A fixed gain (the combined processor's IN and OUT dB). */
export function gainKernel(gain: number): Kernel {
  return {
    process(L, R, n) {
      if (gain === 1) return;
      for (let k = 0; k < n; k++) {
        L[k] = L[k] * gain;
        R[k] = R[k] * gain;
      }
    },
  };
}
