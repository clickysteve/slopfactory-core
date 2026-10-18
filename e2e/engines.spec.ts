/**
 * Output engines in a real browser (Chromium): the chain AudioWorklet in an OfflineAudioContext
 * (export) and a running AudioContext (live), against the JavaScript chain (`renderChain`).
 */
import { expect, test, type Page } from '@playwright/test';
import { melodicWav } from './fixtures';

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) } });

async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('ready');
}

const b64 = (b: Buffer) => b.toString('base64');

test('offline: the master chain in an OfflineAudioContext equals renderChain, and never reaches stems', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async (tone) => {
    const { core, chainWorkletUrl } = window as any;
    const bytes = Uint8Array.from(atob(tone), (c) => c.charCodeAt(0)).buffer;
    const buf = core.toAudioBuffer(await core.decodeSample(bytes, 'tone.wav'));
    const inst = new core.SampleInstrument(buf, { ...core.defaultZone(), root: 48, mode: 'gated' });
    const timeline = {
      tempo: core.constantTempo(120, 96), length: 192, voices: [{ id: 'v', name: 'V' }],
      events: [{ type: 'note', tick: 0, duration: 192, voice: 'v', pitch: 48, velocity: 127 }],
    };
    const chains: Record<string, unknown> = Object.fromEntries(core.CHAIN_PRESETS.map((p: any) => [p.key, p.config]));
    chains.everything = {
      version: 1, bypass: false,
      stages: [
        { id: 's1', engine: 'goodbits.output-stage', enabled: true, params: { mode: 'damaged', mixPct: 90, intensityPct: 70 } },
        { id: 's2', engine: 'core.tone', enabled: true, params: { hz: 5000 } },
        { id: 's3', engine: 'goodbits.drive', enabled: false, params: { type: 'fuzz', amountPct: 100 } },
        { id: 's4', engine: 'goodbits.crunch', enabled: true, params: { bits: 7, rateDivide: 3 } },
        { id: 's5', engine: 'goodbits.output-stage', enabled: true, params: { mode: 'vinyl', mixPct: 50, intensityPct: 50 } },
      ],
    };
    const out: Record<string, number> = {};
    for (const [key, masterChain] of Object.entries(chains)) {
      const res = await core.renderTimeline({
        timeline, tailSeconds: 0.25, master: true, fxSeed: 7,
        stems: [{ voice: 'v', processed: false }, { voice: 'v', processed: true }],
        masterChain, chainModuleUrl: chainWorkletUrl, resolve: () => inst,
      });
      const [master, dry, processed] = res.outputs;
      const ref = core.renderChain(dry.channels, res.sampleRate, masterChain, core.stripSeed(7, 2000));
      let err = 0;
      let stem = 0;
      let changed = 0;
      for (let c = 0; c < 2; c++)
        for (let i = 0; i < res.frames; i++) {
          err = Math.max(err, Math.abs(master.channels[c][i] - ref[c][i]));
          stem = Math.max(stem, Math.abs(processed.channels[c][i] - dry.channels[c][i]));
          changed = Math.max(changed, Math.abs(master.channels[c][i] - dry.channels[c][i]));
        }
      out[key] = err;
      out[`${key}:stem`] = stem;
      out[`${key}:changed`] = changed;
      out[`${key}:ran`] = res.chainProcessed ? 1 : 0;
    }
    return out;
  }, b64(melodicWav()));
  for (const k of Object.keys(r).filter((k) => !k.includes(':'))) {
    expect(r[k], k).toBeLessThan(1e-6);
    expect(r[`${k}:stem`], `${k} stem`).toBe(0);
    expect(r[`${k}:ran`], `${k} ran`).toBe(1);
    if (k === 'clean') expect(r[`${k}:changed`]).toBe(0);
    else expect(r[`${k}:changed`], k).toBeGreaterThan(1e-3);
  }
});

test('live: the chain node processes a running AudioContext, and bypass and changes apply while it plays', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const { core, chainWorkletUrl } = window as any;
    const ctx = new AudioContext();
    await ctx.resume();
    const ok = await core.loadOutputChain(ctx, chainWorkletUrl);
    const oneBit = { version: 1, bypass: false, stages: [{ id: 's1', engine: 'goodbits.crunch', enabled: true, params: { bits: 1, rateDivide: 1 } }] };
    const node = core.createChainNode(ctx, oneBit, { available: ok, seed: 1 });
    const osc = ctx.createOscillator();
    osc.frequency.value = 220;
    const amp = ctx.createGain();
    amp.gain.value = 0.8;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    const mute = ctx.createGain();
    mute.gain.value = 0;
    osc.connect(amp).connect(node.node).connect(an).connect(mute).connect(ctx.destination);
    osc.start();
    const data = new Float32Array(2048);
    const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
    // 1-bit crunch: every sample is -1, 0 or 1
    const levels = () => {
      an.getFloatTimeDomainData(data);
      const set = new Set<number>();
      let peak = 0;
      for (const x of data) {
        set.add(Math.round(x * 1000) / 1000);
        peak = Math.max(peak, Math.abs(x));
      }
      return { distinct: set.size, peak };
    };
    await wait(400);
    const crushed = levels();
    node.set({ ...oneBit, bypass: true });
    await wait(400);
    const bypassed = levels();
    node.set({ ...oneBit, stages: [{ ...oneBit.stages[0], params: { bits: 1, rateDivide: 1 } }], bypass: false });
    await wait(400);
    const again = levels();
    node.dispose();
    osc.stop();
    await ctx.close();
    return { ok, processing: node.processing, crushed, bypassed, again };
  });
  expect(r.ok).toBe(true);
  expect(r.processing).toBe(true);
  expect(r.crushed.distinct).toBeLessThanOrEqual(3);
  expect(r.bypassed.distinct).toBeGreaterThan(50);
  expect(r.bypassed.peak).toBeLessThan(0.81);
  expect(r.again.distinct).toBeLessThanOrEqual(3);
});
