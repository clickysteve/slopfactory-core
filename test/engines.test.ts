import { describe, expect, it, vi } from 'vitest';
import { applyCrunch, applyDrive, applyLofiChain, applyOutputStage, makeOnePoleLP } from '../src/dsp/vendor/goodbits/js/outputstage.js';
import { FX_PRESETS, cleanFx } from '../src/dsp/output/settings';
import {
  BUILTIN_AUDIO_ENGINES,
  CHAIN_FADE,
  CHAIN_PRESETS,
  ChainStream,
  chainActive,
  chainFromFx,
  checkEngine,
  coreEngines,
  CRUNCH_ENGINE,
  defaultParams,
  DRIVE_ENGINE,
  emptyChain,
  EngineRegistry,
  formatParam,
  GOOD_BITS_ENGINE_IDS,
  matchChainPreset,
  MAX_STAGES,
  OUTPUT_STAGE_ENGINE,
  OutputChain,
  presetsFor,
  renderChain,
  repairChain,
  repairParams,
  stageSeeds,
  TONE_ENGINE,
  unavailableStages,
  type AudioEngineDef,
  type ChainConfig,
  type EnumParam,
  type StageConfig,
} from '../src/engines';

const SR = 44100;

function signal(n = 6000, sr = SR): Float32Array[] {
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let x = 99;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const noise = (x / 0x3fffffff - 1) * 0.1;
    L[i] = 0.7 * Math.sin((2 * Math.PI * 220 * i) / sr) + noise + (i / n) * 0.5;
    R[i] = 0.6 * Math.sin((2 * Math.PI * 331 * i) / sr) - noise;
  }
  return [L, R];
}

const stage = (id: string, engine: string, params: StageConfig['params'], enabled = true): StageConfig => ({ id, engine, enabled, params });
const chain = (...stages: StageConfig[]): ChainConfig => ({ version: 1, bypass: false, stages });

/** Largest sample-to-sample step: a click shows up as a jump far above the signal's own. */
function maxStep(ch: Float32Array, from = 1, to = ch.length): number {
  let m = 0;
  for (let i = Math.max(1, from); i < to; i++) m = Math.max(m, Math.abs(ch[i] - ch[i - 1]));
  return m;
}

describe('engine registry', () => {
  it('lists the built-in engines in Good Bits chain order, Tone last', () => {
    expect(coreEngines().list().map((e) => e.id)).toEqual(['goodbits.output-stage', 'goodbits.drive', 'goodbits.crunch', 'core.tone']);
    expect(GOOD_BITS_ENGINE_IDS).toEqual(['goodbits.output-stage', 'goodbits.drive', 'goodbits.crunch']);
  });

  it('every built-in definition is valid and declares audio in and out, real time and offline', () => {
    for (const e of BUILTIN_AUDIO_ENGINES) {
      expect(checkEngine(e), e.id).toEqual([]);
      expect([e.kind, e.inputs, e.outputs, e.realtime, e.offline, e.latency]).toEqual(['audio', ['audio'], ['audio'], true, true, 0]);
    }
  });

  it('restricts availability per application without touching other registries', () => {
    const all = coreEngines();
    const gb = coreEngines(GOOD_BITS_ENGINE_IDS);
    expect(gb.has('core.tone')).toBe(false);
    expect(all.has('core.tone')).toBe(true);
    expect(all.only(['goodbits.crunch', 'nope']).list().map((e) => e.id)).toEqual(['goodbits.crunch']);
  });

  it('registers new engines and refuses duplicates and invalid definitions', () => {
    const r = new EngineRegistry();
    const gain: AudioEngineDef = {
      kind: 'audio',
      id: 'test.gain',
      name: 'Gain',
      version: 1,
      description: 'test',
      inputs: ['audio'],
      outputs: ['audio'],
      realtime: true,
      offline: true,
      latency: 0,
      params: [{ id: 'g', type: 'continuous', label: 'Gain', min: 0, max: 2, default: 1 }],
      createKernel: (_sr, p) => ({ process: (L, R, n) => { for (let i = 0; i < n; i++) { L[i] *= Number(p.g); R[i] *= Number(p.g); } } }),
    };
    r.register(gain);
    expect(() => r.register(gain)).toThrow(/already registered/);
    expect(() => r.register({ ...gain, id: 'Bad Id' })).toThrow(/invalid id/);
    expect(() => r.register({ ...gain, id: 'test.x', params: [{ id: 'g', type: 'continuous', label: 'G', min: 0, max: 1, default: 5 }] })).toThrow(/default out of range/);
    expect(r.audio('test.gain')).toBe(gain);
    expect(r.midi('test.gain')).toBeUndefined();
    // a registered engine runs in the chain with no change to the chain code
    const [L] = renderChain([Float32Array.of(0.5, -0.25)], SR, chain(stage('s1', 'test.gain', { g: 2 })), 1, { engines: r });
    expect([...L]).toEqual([1, -0.5]);
    expect(r.unregister('test.gain')).toBe(true);
  });
});

describe('parameters', () => {
  it('describe every built-in control with Good Bits ranges and defaults', () => {
    expect(defaultParams(OUTPUT_STAGE_ENGINE.params)).toEqual({ mode: 'cassette', mixPct: 100, intensityPct: 50 });
    expect(defaultParams(DRIVE_ENGINE.params)).toEqual({ type: 'tape', amountPct: 40 });
    expect(defaultParams(CRUNCH_ENGINE.params)).toEqual({ bits: 8, rateDivide: 1 });
    expect(defaultParams(TONE_ENGINE.params)).toEqual({ hz: 8000 });
    const modes = (OUTPUT_STAGE_ENGINE.params[0] as EnumParam).options.map((o) => o.value);
    expect(modes).toEqual(['cassette', 'reelToReel', 'damaged', 'vinyl', 'boombox', 'amRadio', 'vhs', 'busComp', 'lathe', 'phone']);
  });

  it('validate values: clamp, round integers, fall back for bad enums, drop unknown keys', () => {
    expect(repairParams(CRUNCH_ENGINE.params, { bits: 40.4, rateDivide: 2.6, junk: 1 })).toEqual({ bits: 16, rateDivide: 3 });
    expect(repairParams(DRIVE_ENGINE.params, { type: 'laser', amountPct: Number.NaN })).toEqual({ type: 'tape', amountPct: 40 });
    expect(repairParams(OUTPUT_STAGE_ENGINE.params, null)).toEqual(defaultParams(OUTPUT_STAGE_ENGINE.params));
  });

  it('format for display, including OFF at a neutral value', () => {
    const [bits, rate] = CRUNCH_ENGINE.params;
    expect(formatParam(bits, 8)).toBe('8 bit');
    expect(formatParam(bits, 16)).toBe('OFF');
    expect(formatParam(rate, 4)).toBe('4x');
    expect(formatParam(DRIVE_ENGINE.params[1], 40)).toBe('40%');
    expect(formatParam(OUTPUT_STAGE_ENGINE.params[0], 'amRadio')).toBe('AM Radio');
  });
});

describe('chain processing vs Good Bits whole-buffer functions', () => {
  const src = signal();

  it('a single stage of each engine is bit-identical to its Good Bits function, at any block size', () => {
    for (const m of ['cassette', 'damaged', 'vinyl', 'amRadio', 'phone']) {
      const ref = applyOutputStage(src, SR, m, 80, 65, 1234);
      for (const blockSize of [128, 37]) expect(renderChain(src, SR, chain(stage('s1', OUTPUT_STAGE_ENGINE.id, { mode: m, mixPct: 80, intensityPct: 65 })), 1234, { blockSize }), m).toEqual(ref);
    }
    for (const type of ['tape', 'tube', 'diode', 'fuzz']) expect(renderChain(src, SR, chain(stage('s1', DRIVE_ENGINE.id, { type, amountPct: 35 })), 1)).toEqual(applyDrive(src, type, 35));
    for (const [bits, rateDivide] of [[12, 2], [4, 7], [16, 3], [1, 32]]) expect(renderChain(src, SR, chain(stage('s1', CRUNCH_ENGINE.id, { bits, rateDivide })), 1, { blockSize: 50 })).toEqual(applyCrunch(src, { bits, rateDivide }));
  });

  it('OUTPUT STAGE -> DRIVE -> CRUNCH is bit-identical to applyLofiChain (mono and stereo)', () => {
    const settings = { outputStage: { enabled: true, mode: 'vinyl', mixPct: 70, intensityPct: 40 }, drive: { enabled: true, type: 'tube', amountPct: 35 }, crunch: { enabled: true, bits: 10, rateDivide: 3 } };
    const c = chain(stage('s1', OUTPUT_STAGE_ENGINE.id, settings.outputStage), stage('s2', DRIVE_ENGINE.id, settings.drive), stage('s3', CRUNCH_ENGINE.id, settings.crunch));
    for (const sr of [44100, 48000]) {
      const sig = signal(5000, sr);
      expect(renderChain(sig, sr, c, 77)).toEqual(applyLofiChain(sig, sr, settings, 77));
      expect(renderChain([sig[0]], sr, c, 77)).toEqual(applyLofiChain([sig[0]], sr, settings, 77));
    }
  });

  it('Tone is Good Bits one-pole low-pass', () => {
    const lp = makeOnePoleLP(SR, 3000);
    const ref = Float32Array.from(src[0], (x) => lp(x));
    expect(renderChain([src[0]], SR, chain(stage('s1', TONE_ENGINE.id, { hz: 3000 })), 1)[0]).toEqual(ref);
  });

  it('order matters and is honoured', () => {
    const a = renderChain(src, SR, chain(stage('s1', DRIVE_ENGINE.id, { type: 'fuzz', amountPct: 80 }), stage('s2', CRUNCH_ENGINE.id, { bits: 3, rateDivide: 1 })), 1);
    const b = renderChain(src, SR, chain(stage('s2', CRUNCH_ENGINE.id, { bits: 3, rateDivide: 1 }), stage('s1', DRIVE_ENGINE.id, { type: 'fuzz', amountPct: 80 })), 1);
    expect(a).toEqual(applyCrunch(applyDrive(src, 'fuzz', 80), { bits: 3 }));
    expect(b).toEqual(applyDrive(applyCrunch(src, { bits: 3 }), 'fuzz', 80));
    expect(a).not.toEqual(b);
  });

  it('disabled stages, a bypassed chain, an empty chain and unknown engines pass audio through exactly', () => {
    const drive = stage('s1', DRIVE_ENGINE.id, { type: 'diode', amountPct: 90 });
    const copies = [
      renderChain(src, SR, chain({ ...drive, enabled: false }), 1),
      renderChain(src, SR, { ...chain(drive), bypass: true }, 1),
      renderChain(src, SR, emptyChain(), 1),
      renderChain(src, SR, chain(stage('s1', 'other-app.reverb', { size: 3 })), 1),
    ];
    for (const c of copies) expect(c).toEqual(src);
    expect(copies[0][0]).not.toBe(src[0]);
  });

  it('never modifies the input', () => {
    const copy = src.map((c) => Float32Array.from(c));
    renderChain(src, SR, chain(stage('s1', CRUNCH_ENGINE.id, { bits: 2, rateDivide: 4 })), 1);
    expect(src).toEqual(copy);
  });
});

describe('ChainStream: real-time changes', () => {
  const tone = (n: number) => [Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 110 * i) / SR)), Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 110 * i) / SR))];

  function run(s: ChainStream, src: Float32Array[], changes: Record<number, () => void> = {}): Float32Array[] {
    const L = Float32Array.from(src[0]);
    const R = Float32Array.from(src[1]);
    for (let i = 0; i < L.length; i += 128) {
      changes[i]?.();
      s.process(L.subarray(i, i + 128), R.subarray(i, i + 128), Math.min(128, L.length - i));
    }
    return [L, R];
  }

  it('bypassing a stage crossfades to the dry signal, then is exactly dry', () => {
    const src = tone(8192);
    const c = chain(stage('s1', CRUNCH_ENGINE.id, { bits: 2, rateDivide: 1 }));
    const s = new ChainStream(coreEngines(), c, SR, 1);
    const [L] = run(s, src, { 2048: () => s.set(chain({ ...c.stages[0], enabled: false })) });
    // fully processed before, exactly dry after the fade
    expect(L.subarray(0, 2048)).toEqual(applyCrunch([src[0].subarray(0, 2048)], { bits: 2 })[0]);
    expect(L.subarray(2048 + CHAIN_FADE + 128)).toEqual(src[0].subarray(2048 + CHAIN_FADE + 128));
    // the fade has no step larger than the 2-bit quantiser's own
    expect(maxStep(L, 2040, 2048 + CHAIN_FADE + 8)).toBeLessThanOrEqual(0.5 + 1e-6);
  });

  it('a smooth parameter ramps in place instead of jumping', () => {
    const src = tone(8192);
    const c = chain(stage('s1', DRIVE_ENGINE.id, { type: 'tape', amountPct: 0 }));
    const s = new ChainStream(coreEngines(), c, SR, 1);
    const [L] = run(s, src, { 2048: () => s.set(chain({ ...c.stages[0], params: { type: 'tape', amountPct: 100 } })) });
    const sharp = renderChain(src, SR, chain(stage('s1', DRIVE_ENGINE.id, { type: 'tape', amountPct: 100 })), 1)[0];
    expect(maxStep(L, 2040, 4096)).toBeLessThan(maxStep(sharp) * 1.05);
    // after the ramp it is exactly the steady result
    expect(L.subarray(4096)).toEqual(sharp.subarray(4096));
  });

  it('adding, removing and reordering stages crossfade without a jump', () => {
    const src = tone(16384);
    const reg = coreEngines();
    const a = stage('s1', DRIVE_ENGINE.id, { type: 'diode', amountPct: 100 });
    const b = stage('s2', TONE_ENGINE.id, { hz: 400 });
    const s = new ChainStream(reg, chain(a), SR, 1);
    const [L] = run(s, src, {
      2048: () => s.set(chain(a, b)),
      6144: () => s.set(chain(b, a)),
      10240: () => s.set(chain(b)),
      12288: () => s.set(emptyChain()),
    });
    const natural = Math.max(maxStep(renderChain(src, SR, chain(a), 1)[0]), maxStep(src[0]));
    expect(maxStep(L)).toBeLessThan(natural * 1.1);
    expect(L.subarray(12288 + CHAIN_FADE + 128)).toEqual(src[0].subarray(12288 + CHAIN_FADE + 128));
  });

  it('reset restarts state so a stream repeats itself exactly', () => {
    const src = signal(4096);
    const c = chain(stage('s1', OUTPUT_STAGE_ENGINE.id, { mode: 'vinyl', mixPct: 100, intensityPct: 100 }));
    const s = new ChainStream(coreEngines(), c, SR, 9);
    const first = run(s, src);
    s.reset();
    expect(run(s, src)).toEqual(first);
  });
});

describe('chain configuration', () => {
  it('serialises to plain JSON and restores to the same chain', () => {
    const ctl = new OutputChain(coreEngines());
    const a = ctl.add(OUTPUT_STAGE_ENGINE.id)!;
    const b = ctl.add(CRUNCH_ENGINE.id)!;
    ctl.setParam(a, 'mode', 'vhs');
    ctl.setEnabled(b, false);
    const json = JSON.parse(JSON.stringify(ctl.config));
    expect(json).toEqual(ctl.config);
    expect(new OutputChain(coreEngines(), json).config).toEqual(ctl.config);
    expect(json.stages.map((s: StageConfig) => [s.id, s.engine, s.enabled, s.v])).toEqual([
      ['s1', 'goodbits.output-stage', true, 1],
      ['s2', 'goodbits.crunch', false, 1],
    ]);
  });

  it('repairs broken data without throwing and keeps unknown engines untouched', () => {
    const c = repairChain({ bypass: 'yes', stages: [null, { engine: 'goodbits.drive', params: { amountPct: 400 } }, { id: 'x', engine: 'other.app-delay', enabled: false, params: { time: 0.3, obj: {} } }, { id: 'x', engine: 'goodbits.crunch' }] }, coreEngines());
    expect(c.bypass).toBe(false);
    expect(c.stages).toEqual([
      { id: 's1', engine: 'goodbits.drive', enabled: true, params: { type: 'tape', amountPct: 100 }, v: 1 },
      { id: 'x', engine: 'other.app-delay', enabled: false, params: { time: 0.3 } },
      { id: 's2', engine: 'goodbits.crunch', enabled: true, params: { bits: 8, rateDivide: 1 }, v: 1 },
    ]);
    expect(unavailableStages(c, coreEngines()).map((s) => s.id)).toEqual(['x']);
    expect(repairChain(undefined)).toEqual(emptyChain());
    expect(repairChain({ stages: Array.from({ length: 20 }, () => ({ engine: 'goodbits.drive' })) }).stages).toHaveLength(MAX_STAGES);
  });

  it('a stage unavailable in one application survives a round trip through it', () => {
    const full = new OutputChain(coreEngines());
    full.add(TONE_ENGINE.id);
    full.add(DRIVE_ENGINE.id);
    const gb = new OutputChain(coreEngines(GOOD_BITS_ENGINE_IDS), full.config);
    expect(gb.engine('s1')).toBeUndefined();
    gb.setParam('s1', 'hz', 500); // refused: unavailable
    gb.setParam('s2', 'amountPct', 10);
    expect(gb.config.stages[0]).toEqual(full.config.stages[0]);
    expect(new OutputChain(coreEngines(), gb.config).config.stages[1].params.amountPct).toBe(10);
  });

  it('chainActive and stage seeds', () => {
    expect(chainActive(emptyChain())).toBe(false);
    expect(chainActive(chain(stage('s1', 'goodbits.drive', {}, false)))).toBe(false);
    expect(chainActive(chain(stage('s1', 'nope', {})), coreEngines())).toBe(false);
    expect(chainActive(chain(stage('s1', 'goodbits.drive', {})))).toBe(true);
    const seeds = stageSeeds(chain(stage('a', 'goodbits.output-stage', {}), stage('b', 'goodbits.drive', {}), stage('c', 'goodbits.output-stage', {})), 42);
    expect(seeds[0]).toBe(42);
    expect(seeds[1]).toBe(42);
    expect(seeds[2]).not.toBe(42);
    // the second output stage keeps its seed when another engine's stage moves in front of it
    expect(stageSeeds(chain(stage('b', 'goodbits.drive', {}), stage('a', 'goodbits.output-stage', {}), stage('c', 'goodbits.output-stage', {})), 42)[2]).toBe(seeds[2]);
  });

  it('presets come from Core processing presets and are equivalent to them', () => {
    expect(CHAIN_PRESETS.map((p) => p.key)).toEqual(FX_PRESETS.map((p) => p.key));
    const twelve = CHAIN_PRESETS.find((p) => p.key === '12bit')!;
    expect(twelve.config.stages.map((s) => s.engine)).toEqual(['goodbits.drive', 'goodbits.crunch', 'core.tone']);
    expect(matchChainPreset(twelve.config)).toBe('12bit');
    // the Good Bits selection has no Tone, so presets that need it are not offered there
    expect(presetsFor(coreEngines(GOOD_BITS_ENGINE_IDS)).map((p) => p.key)).not.toContain('12bit');
    const fx = FX_PRESETS.find((p) => p.key === 'cassette')!.apply(cleanFx());
    expect(chainFromFx(fx).stages).toHaveLength(1);
  });
});

describe('OutputChain controller', () => {
  it('adds, configures, enables, reorders, replaces and removes stages, notifying each change', () => {
    const ctl = new OutputChain(coreEngines());
    const seen: ChainConfig[] = [];
    const off = ctl.subscribe((c) => seen.push(c));
    const a = ctl.add(DRIVE_ENGINE.id)!;
    const b = ctl.add(CRUNCH_ENGINE.id)!;
    const t = ctl.add(TONE_ENGINE.id, 0)!;
    expect(ctl.stages.map((s) => s.id)).toEqual([t, a, b]);
    expect(ctl.move(t, 1)).toBe(true);
    expect(ctl.stages.map((s) => s.id)).toEqual([a, t, b]);
    expect(ctl.moveTo(b, 0)).toBe(true);
    expect(ctl.move(b, -1)).toBe(false);
    expect(ctl.setParam(a, 'amountPct', 250)).toBe(true);
    expect(ctl.stage(a)!.params.amountPct).toBe(100);
    expect(ctl.setParam(a, 'amountPct', 100)).toBe(false); // no change, no notification
    expect(ctl.setParam(a, 'nonsense', 1)).toBe(false);
    ctl.setEnabled(a, false);
    ctl.replace(t, OUTPUT_STAGE_ENGINE.id);
    expect(ctl.stage(t)!.params).toEqual(defaultParams(OUTPUT_STAGE_ENGINE.params));
    ctl.setBypass(true);
    expect(ctl.remove(b)).toBe(true);
    expect(ctl.remove(b)).toBe(false);
    expect(ctl.add('not.an.engine')).toBeNull();
    const n = seen.length;
    off();
    ctl.clear();
    expect(seen.length).toBe(n);
    expect(ctl.config.stages).toEqual([]);
    // every notification carried a fresh object
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('stops at the stage limit', () => {
    const ctl = new OutputChain(coreEngines(), undefined, 3);
    for (let i = 0; i < 5; i++) ctl.add(DRIVE_ENGINE.id);
    expect(ctl.stages).toHaveLength(3);
    expect(ctl.canAdd).toBe(false);
  });

  it('applies presets only when every engine is available', () => {
    const gb = new OutputChain(coreEngines(GOOD_BITS_ENGINE_IDS));
    expect(gb.applyPreset(CHAIN_PRESETS.find((p) => p.key === '12bit')!)).toBe(false);
    expect(gb.applyPreset(CHAIN_PRESETS.find((p) => p.key === 'bitcrush')!)).toBe(true);
    expect(gb.stages.map((s) => s.engine)).toEqual(['goodbits.crunch']);
  });
});

describe('chain worklet processor', () => {
  it('runs the same stream as renderChain, applies config messages and resets at a time', async () => {
    const g = globalThis as Record<string, unknown>;
    let ctor: (new (o: unknown) => { port: { onmessage: (e: { data: unknown }) => void }; process(i: Float32Array[][], o: Float32Array[][]): boolean }) | null = null;
    g.sampleRate = SR;
    g.currentTime = 0;
    g.AudioWorkletProcessor = class {
      port = { onmessage: null as unknown };
    };
    g.registerProcessor = (_name: string, c: typeof ctor) => (ctor = c);
    const { registerChainProcessor } = await import('../src/engines/processor');
    registerChainProcessor(BUILTIN_AUDIO_ENGINES);
    const config = chain(stage('s1', OUTPUT_STAGE_ENGINE.id, { mode: 'cassette', mixPct: 100, intensityPct: 80 }), stage('s2', CRUNCH_ENGINE.id, { bits: 6, rateDivide: 2 }));
    const proc = new ctor!({ processorOptions: { config, seed: 5 } });
    const src = signal(1024);
    const out: Float32Array[] = [new Float32Array(1024), new Float32Array(1024)];
    for (let i = 0; i < 1024; i += 128) {
      const o = [new Float32Array(128), new Float32Array(128)];
      proc.process([[src[0].slice(i, i + 128), src[1].slice(i, i + 128)]], [o]);
      out[0].set(o[0], i);
      out[1].set(o[1], i);
    }
    expect(out).toEqual(renderChain(src, SR, config, 5));
    proc.port.onmessage({ data: { type: 'config', config: emptyChain() } });
    g.currentTime = 1;
    proc.port.onmessage({ data: { type: 'reset', at: 1 } });
    const o = [new Float32Array(128), new Float32Array(128)];
    proc.process([[Float32Array.from(src[0].subarray(0, 128)), Float32Array.from(src[1].subarray(0, 128))]], [o]);
    // after a reset the new (empty) chain applies at once: pass-through
    expect(o[0]).toEqual(src[0].subarray(0, 128));
    for (const k of ['sampleRate', 'currentTime', 'AudioWorkletProcessor', 'registerProcessor']) delete g[k];
  });
});

describe('chain nodes and the mixer', () => {
  it('creates a worklet node, posts changes, and disposes of it (no leaked port)', async () => {
    const { FakeContext, FakeNode, asCtx } = await import('./fakeAudio');
    const posted: unknown[] = [];
    let closed = 0;
    class FakeWorklet extends FakeNode {
      port = { postMessage: (m: unknown) => posted.push(m), close: () => closed++, onmessage: null };
      constructor(ctx: InstanceType<typeof FakeContext>, public name: string, public opts: { processorOptions: unknown }) {
        super('worklet', ctx);
      }
    }
    vi.stubGlobal('AudioWorkletNode', FakeWorklet);
    try {
      const { Mixer } = await import('../src/audio/mixer');
      const ctx = new FakeContext();
      const c = chain(stage('s1', DRIVE_ENGINE.id, { type: 'tube', amountPct: 30 }));
      const m = new Mixer(asCtx(ctx), { voices: ['a'], fxAvailable: false, masterChain: c, chainAvailable: true, seed: 3 });
      const w = ctx.of<FakeWorklet>('worklet');
      expect(w).toHaveLength(1);
      expect(w[0].name).toBe('slopfactory-output-chain');
      expect(w[0].opts.processorOptions).toMatchObject({ config: c });
      // master processing -> chain -> master gain
      const masterFx = m.masterFx.node as unknown as InstanceType<typeof FakeNode>;
      expect(masterFx.out.has(w[0])).toBe(true);
      expect(w[0].out.has(m.output as unknown as InstanceType<typeof FakeNode>)).toBe(true);
      m.setMasterChain(emptyChain());
      m.resetFx(2);
      expect(posted).toEqual([{ type: 'config', config: emptyChain() }, { type: 'reset', at: 2 }]);
      m.dispose();
      expect(closed).toBe(1);
      expect(w[0].out.size).toBe(0);
      // without a chain the graph is as before (no worklet), and setMasterChain says so
      const plain = new Mixer(asCtx(new FakeContext()), { voices: ['a'], fxAvailable: false });
      expect(plain.masterChain).toBeNull();
      expect(() => plain.setMasterChain(emptyChain())).toThrow(/no master chain/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to a stereo pass-through without AudioWorklet', async () => {
    const { FakeContext, asCtx } = await import('./fakeAudio');
    const { createChainNode } = await import('../src/engines/node');
    const n = createChainNode(asCtx(new FakeContext()), emptyChain(), { available: false });
    expect(n.processing).toBe(false);
    expect((n.node as unknown as { channelCountMode: string }).channelCountMode).toBe('explicit');
    n.set(chain(stage('s1', DRIVE_ENGINE.id, {})));
    expect(n.config.stages).toHaveLength(1);
    n.dispose();
  });
});
