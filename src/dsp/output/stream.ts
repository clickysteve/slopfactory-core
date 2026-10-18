/**
 * Streaming output processor: Good Bits' lo-fi chain run block by block, so the same code
 * serves an AudioWorklet (live and OfflineAudioContext) and plain buffers.
 *
 * The stages are the shared kernels in kernels.ts (the same ones the output-engine plugins
 * use), run in Good Bits' order (output stage, drive, crunch) between an input and output gain,
 * then the optional Tone. The result is bit-identical to `applyLofiChain` for the same input,
 * settings and seed, whatever the block size (see test/dsp-output.test.ts).
 */
import { crunchKernel, driveKernel, gainKernel, outputStageKernel, toneKernel, type Kernel } from './kernels';
import { isClean, type OutputFxSettings } from './settings';

/** Processes a stereo block in place. */
export type BlockFn = (l: Float32Array, r: Float32Array, n: number) => void;

const dbToGain = (db: number) => (db === 0 ? 1 : Math.pow(10, db / 20));

/** Build the chain for one set of settings. Its state (filters, noise, hold counter) starts fresh. */
export function createChain(s: OutputFxSettings, sampleRate: number, seed: number): BlockFn {
  if (isClean(s)) return () => {};
  const kernels: Kernel[] = [gainKernel(dbToGain(s.inDb))];
  if (s.outputStage.enabled) kernels.push(outputStageKernel(sampleRate, s.outputStage, seed));
  if (s.drive.enabled) kernels.push(driveKernel(sampleRate, s.drive));
  if (s.crunch.enabled) kernels.push(crunchKernel(s.crunch));
  if (s.tone.enabled) kernels.push(toneKernel(sampleRate, s.tone));
  kernels.push(gainKernel(dbToGain(s.outDb)));
  return (L, R, n) => {
    for (const k of kernels) k.process(L, R, n);
  };
}

/** Samples over which a settings change crossfades from the old chain to the new one. */
export const SETTINGS_FADE = 256;

/**
 * A processor whose settings can change while it runs. A change starts a new chain and
 * crossfades from the old one over SETTINGS_FADE samples, so switching never clicks.
 */
export class OutputFxStream {
  private chain: BlockFn;
  private old: BlockFn | null = null;
  private fadeLeft = 0;
  private scratchL = new Float32Array(128);
  private scratchR = new Float32Array(128);

  constructor(private settings: OutputFxSettings, readonly sampleRate: number, readonly seed: number) {
    this.chain = createChain(settings, sampleRate, seed);
  }

  get current(): OutputFxSettings {
    return this.settings;
  }

  set(settings: OutputFxSettings): void {
    if (JSON.stringify(settings) === JSON.stringify(this.settings)) return;
    this.old = this.chain;
    this.fadeLeft = SETTINGS_FADE;
    this.settings = settings;
    this.chain = createChain(settings, this.sampleRate, this.seed);
  }

  /** Start the current settings' state afresh (noise, filters, hold phase), with no crossfade. */
  reset(): void {
    this.old = null;
    this.fadeLeft = 0;
    this.chain = createChain(this.settings, this.sampleRate, this.seed);
  }

  process(L: Float32Array, R: Float32Array, n = L.length): void {
    if (!this.old || this.fadeLeft <= 0) {
      this.chain(L, R, n);
      return;
    }
    if (this.scratchL.length < n) {
      this.scratchL = new Float32Array(n);
      this.scratchR = new Float32Array(n);
    }
    const oL = this.scratchL;
    const oR = this.scratchR;
    oL.set(L.subarray(0, n));
    oR.set(R.subarray(0, n));
    this.old(oL, oR, n);
    this.chain(L, R, n);
    for (let k = 0; k < n; k++) {
      if (this.fadeLeft <= 0) break;
      const t = 1 - this.fadeLeft / SETTINGS_FADE;
      L[k] = oL[k] + (L[k] - oL[k]) * t;
      R[k] = oR[k] + (R[k] - oR[k]) * t;
      this.fadeLeft--;
    }
    if (this.fadeLeft <= 0) this.old = null;
  }
}

/** Run a processor over whole stereo buffers (offline helper; same code as the worklet). */
export function processBuffers(channels: Float32Array[], sampleRate: number, settings: OutputFxSettings, seed: number, blockSize = 128): Float32Array[] {
  const L = Float32Array.from(channels[0]);
  const R = Float32Array.from(channels[1] ?? channels[0]);
  const s = new OutputFxStream(settings, sampleRate, seed);
  for (let i = 0; i < L.length; i += blockSize) {
    const n = Math.min(blockSize, L.length - i);
    s.process(L.subarray(i, i + n), R.subarray(i, i + n), n);
  }
  return [L, R];
}
