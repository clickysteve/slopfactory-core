/**
 * Core in a real browser (Chromium): the built package, imported by name through its
 * "exports" as an application imports it, running Web Audio, AudioWorklet, OfflineAudioContext,
 * Workers, IndexedDB and Web Crypto. Audio is checked by measuring the rendered samples.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kickWav, melodicWav, onset, readWav16, rms, stereoWav } from './fixtures';

const SR = 44100;
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('ready');
}

const b64 = (b: Buffer) => b.toString('base64');

test('the package loads by name, with every module and both runtime files', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const w = window as any;
    const fetchOk = async (u: string) => (await fetch(u)).ok;
    return {
      version: w.core.CORE_VERSION,
      modules: Object.fromEntries(Object.entries(w.modules).map(([k, m]) => [k, Object.keys(m as object).length])),
      worklet: await fetchOk(w.workletUrl),
      worker: await fetchOk(w.workerUrl),
      same: w.core.renderTimeline === w.modules.render.renderTimeline && w.core.Mixer === w.modules.audio.Mixer,
    };
  });
  expect(r.version).toBe(pkg.version);
  for (const [k, n] of Object.entries(r.modules)) expect(n, k).toBeGreaterThan(0);
  expect(r.worklet).toBe(true);
  expect(r.worker).toBe(true);
  // subpath imports and the root import share one copy of each module
  expect(r.same).toBe(true);
});

test('offline render: sample playback, exact onsets, aligned isolated stems, shared tail', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async ([kick, stereo]) => {
    const { core, workletUrl } = window as any;
    const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
    const k = core.toAudioBuffer(await core.decodeSample(bytes(kick), 'kick.wav'));
    const s = core.toAudioBuffer(await core.decodeSample(bytes(stereo), 'stereo.wav'));
    const zone = { ...core.defaultZone(), root: 60, mode: 'oneshot' };
    const inst = { a: new core.SampleInstrument(k, zone), b: new core.SampleInstrument(s, { ...zone, pan: 0 }) } as Record<string, unknown>;
    const ppq = 96;
    const note = (tick: number, voice: string) => ({ type: 'note', tick, duration: ppq / 2, voice, pitch: 60, velocity: 127 });
    const timeline = {
      tempo: core.constantTempo(120, ppq),
      length: ppq * 4,
      voices: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      events: core.sortEvents([note(0, 'a'), note(ppq, 'b'), note(ppq * 2, 'a'), note(ppq * 3, 'b')]),
    };
    const res = await core.renderTimeline({
      timeline, tailSeconds: 1, master: true,
      stems: [{ voice: 'a', processed: true }, { voice: 'b', processed: true }],
      resolve: (v: string) => inst[v], fxModuleUrl: workletUrl,
    });
    const [m, a, b] = res.outputs;
    let sumErr = 0;
    for (let c = 0; c < 2; c++) for (let i = 0; i < res.frames; i++) sumErr = Math.max(sumErr, Math.abs(m.channels[c][i] - a.channels[c][i] - b.channels[c][i]));
    const enc = async (o: { channels: Float32Array[] }) => btoa(Array.from(await core.encodeWav16(o.channels, res.sampleRate), (x: number) => String.fromCharCode(x)).join(''));
    return { frames: res.frames, processed: res.processed, lengths: res.outputs.map((o: any) => o.channels[0].length), sumErr, wav: [await enc(m), await enc(a), await enc(b)] };
  }, [b64(kickWav()), b64(stereoWav())] as const);
  expect(r.processed).toBe(true);
  expect(r.frames).toBe(3 * SR); // 2 s of music at 120 BPM + 1 s tail
  expect(r.lengths).toEqual([3 * SR, 3 * SR, 3 * SR]);
  expect(r.sumErr).toBeLessThan(1e-6); // CLEAN: the stems sum to the master
  const [m, a, b] = r.wav.map((x) => readWav16(Buffer.from(x, 'base64')));
  for (const w of [m, a, b]) expect([w.sampleRate, w.bits, w.channels.length, w.channels[0].length]).toEqual([SR, 16, 2, 3 * SR]);
  // voice a: kicks at 0 and 1 s only; voice b: stereo hits at 0.5 and 1.5 s only
  const half = SR / 2;
  expect(onset(a.channels[0], 1.5 / 32767)).toBeLessThanOrEqual(1);
  expect(onset(a.channels[0].subarray(SR), 1.5 / 32767)).toBeLessThanOrEqual(1);
  expect(rms(a.channels[0], half, half + 0.2 * SR)).toBeLessThan(0.05); // only the decaying kick tail
  expect(rms(b.channels[0], 0, half - 10)).toBe(0);
  expect(onset(b.channels[0].subarray(half), 1.5 / 32767)).toBeLessThanOrEqual(1);
  expect(onset(b.channels[0].subarray(3 * half), 1.5 / 32767)).toBeLessThanOrEqual(1);
  // stereo sample keeps different left and right content
  expect(Math.abs(rms(b.channels[0], half, half + 4410) - rms(b.channels[1], half, half + 4410))).toBeLessThan(0.05);
  let diff = 0;
  for (let i = half; i < half + 4410; i++) diff = Math.max(diff, Math.abs(b.channels[0][i] - b.channels[1][i]));
  expect(diff).toBeGreaterThan(0.1);
  // the tail is silent once everything has ended
  expect(rms(m.channels[0], Math.round(2.4 * SR), 3 * SR)).toBe(0);
});

test('output processing: the AudioWorklet (live and offline path) equals the JavaScript stream', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async (tone) => {
    const { core, workletUrl } = window as any;
    const bytes = Uint8Array.from(atob(tone), (c) => c.charCodeAt(0)).buffer;
    const buf = core.toAudioBuffer(await core.decodeSample(bytes, 'tone.wav'));
    const inst = new core.SampleInstrument(buf, { ...core.defaultZone(), root: 48, mode: 'gated' });
    const timeline = {
      tempo: core.constantTempo(120, 96), length: 192, voices: [{ id: 'v', name: 'V' }],
      events: [{ type: 'note', tick: 0, duration: 192, voice: 'v', pitch: 48, velocity: 127 }],
    };
    const out: Record<string, number> = {};
    for (const p of core.FX_PRESETS) {
      const fx = p.apply(core.cleanFx());
      const res = await core.renderTimeline({
        timeline, tailSeconds: 0.25, master: false, fxSeed: 7,
        stems: [{ voice: 'v', processed: true }, { voice: 'v', processed: false }],
        strips: { v: { fx } }, resolve: () => inst, fxModuleUrl: workletUrl,
      });
      const [wet, dry] = res.outputs;
      const ref = core.processBuffers(dry.channels.map((c: Float32Array) => c.slice()), res.sampleRate, fx, core.stripSeed(7, 0));
      let err = 0;
      for (let c = 0; c < 2; c++) for (let i = 0; i < res.frames; i++) err = Math.max(err, Math.abs(wet.channels[c][i] - ref[c][i]));
      let changed = 0;
      for (let i = 0; i < res.frames; i++) changed = Math.max(changed, Math.abs(wet.channels[0][i] - dry.channels[0][i]));
      out[p.key] = err;
      out[`${p.key}:changed`] = changed;
    }
    return out;
  }, b64(melodicWav()));
  for (const k of Object.keys(r).filter((k) => !k.includes(':'))) {
    expect(r[k], k).toBeLessThan(1e-5);
    if (k === 'clean') expect(r[`${k}:changed`]).toBe(0);
    else expect(r[`${k}:changed`], k).toBeGreaterThan(1e-3);
  }
});

test('sample transformation: the Worker runs the same Good Bits chain as the synchronous runner', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async (tone) => {
    const { core, workerUrl } = window as any;
    const bytes = Uint8Array.from(atob(tone), (c) => c.charCodeAt(0)).buffer;
    const audio = await core.decodeSample(bytes, 'tone.wav');
    const t = { ...core.identityTransform(), enabled: true, ratio: 1.5, character: 'vintage', seed: 3 };
    const fixed = core.repairTransform(t);
    const runner = new core.WorkerTransformRunner(() => new Worker(workerUrl, { type: 'module' }));
    const viaWorker = await new core.TransformCache(runner).get('s', audio, fixed);
    const viaSync = await new core.TransformCache(core.syncRunner).get('s', audio, fixed);
    runner.dispose();
    let err = 0;
    for (let c = 0; c < viaSync.channels.length; c++) for (let i = 0; i < viaSync.channels[c].length; i++) err = Math.max(err, Math.abs(viaSync.channels[c][i] - viaWorker.channels[c][i]));
    return { inLen: audio.channels[0].length, outLen: viaWorker.channels[0].length, syncLen: viaSync.channels[0].length, err, enabled: !core.isIdentity(fixed) };
  }, b64(melodicWav()));
  expect(r.enabled).toBe(true);
  expect(r.outLen).toBe(r.syncLen);
  expect(r.outLen).toBeGreaterThan(r.inLen * 1.3);
  expect(r.err).toBe(0);
});

test('storage: IndexedDB keeps samples across a reload; bundles carry them to a fresh browser', async ({ page, browser }) => {
  await open(page);
  const id = await page.evaluate(async (wav) => {
    const { core } = window as any;
    const bytes = Uint8Array.from(atob(wav), (c) => c.charCodeAt(0)).buffer;
    const store = new core.IndexedDbSampleStore('core-e2e');
    const s = await core.sampleFromBytes(bytes, 'kick.wav', 'audio/wav');
    await store.put(s);
    await store.put(await core.sampleFromBytes(bytes, 'same bytes, other name.wav'));
    return s.id;
  }, b64(kickWav()));
  await page.reload();
  await expect(page.locator('#status')).toHaveText('ready');
  const r = await page.evaluate(async (id) => {
    const { core } = window as any;
    const store = new core.IndexedDbSampleStore('core-e2e');
    const list = await store.list();
    const s = await store.get(id);
    const bundle = core.writeBundle('TEST', { name: 'project.json', text: JSON.stringify({ sample: id }) }, [s]);
    return { count: list.length, has: await store.has(id), hash: await core.sha256Hex(s.bytes), bundle: btoa(Array.from(bundle as Uint8Array, (x) => String.fromCharCode(x)).join('')) };
  }, id);
  expect(r.count).toBe(1); // identical bytes are stored once
  expect(r.has).toBe(true);
  expect(r.hash).toBe(id);

  const fresh = await browser.newContext();
  const p2 = await fresh.newPage();
  await open(p2);
  const back = await p2.evaluate(async ([b, id]) => {
    const { core } = window as any;
    const bytes = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
    const c = await core.readBundle(bytes, 'TEST');
    const store = new core.IndexedDbSampleStore('core-e2e');
    const before = await store.list();
    for (const s of c.samples) await store.put(s);
    const decoded = await core.decodeSample((await store.get(id)).bytes.slice(0), 'kick.wav');
    return { before: before.length, project: JSON.parse(c.projectText), problems: c.problems ?? [], frames: decoded.frames };
  }, [r.bundle, id] as const);
  await fresh.close();
  expect(back.before).toBe(0);
  expect(back.project).toEqual({ sample: id });
  expect(back.problems).toEqual([]);
  expect(back.frames).toBe(Math.round(0.3 * SR));
});

test('WAV and ZIP: encoded files decode back exactly; clipping is reported, not normalised', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const { core } = window as any;
    const n = 4410;
    const L = Float32Array.from({ length: n }, (_, i) => 1.25 * Math.sin(i / 7));
    const R = Float32Array.from({ length: n }, (_, i) => 0.5 * Math.cos(i / 11));
    const wav = await core.encodeWav16([L, R], 44100);
    const stats = core.levelStats([L, R]);
    const zip = core.createZip([{ name: 'a.wav', data: wav }, { name: 'b.txt', data: new TextEncoder().encode('hello') }]);
    const entries = await core.readZip(zip);
    const back = await core.browserDecode(wav.slice().buffer);
    let err = 0;
    for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(back.channels[1][i] - R[i]));
    return { info: core.wavInfo(wav), clipped: stats.clipped, peak: stats.peak, names: entries.map((e: any) => e.name), same: entries[0].data.length === wav.length, err, maxL: Math.max(...back.channels[0]) };
  });
  expect(r.info).toMatchObject({ sampleRate: 44100, channels: 2, bitsPerSample: 16, format: 1, frames: 4410 });
  expect(r.clipped).toBeGreaterThan(0);
  expect(r.peak).toBeCloseTo(1.25, 2);
  expect(r.maxL).toBeLessThanOrEqual(1); // clamped at full scale by the encoder, not scaled down
  expect(r.maxL).toBeGreaterThan(0.999);
  expect(r.names).toEqual(['a.wav', 'b.txt']);
  expect(r.same).toBe(true);
  expect(r.err).toBeLessThan(1 / 32767 + 1e-6);
});

test('GATED notes hold their level until the note-off, then release (fade scheduled ahead)', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async (tone) => {
    const { core, workletUrl } = window as any;
    const bytes = Uint8Array.from(atob(tone), (c) => c.charCodeAt(0)).buffer;
    const buf = core.toAudioBuffer(await core.decodeSample(bytes, 'tone.wav'));
    const inst = new core.SampleInstrument(buf, { ...core.defaultZone(), root: 48, mode: 'gated', release: 0.1 });
    // a 1 s note (120 BPM, 96 PPQ: 192 ticks)
    const timeline = { tempo: core.constantTempo(120, 96), length: 384, voices: [{ id: 'v', name: 'V' }], events: [{ type: 'note', tick: 0, duration: 192, voice: 'v', pitch: 48, velocity: 127 }] };
    const res = await core.renderTimeline({ timeline, tailSeconds: 0, master: true, stems: [], resolve: () => inst, fxModuleUrl: workletUrl });
    const x = res.outputs[0].channels[0];
    const win = (a: number) => {
      let s = 0;
      for (let i = a; i < a + 2205; i++) s += x[i] * x[i];
      return Math.sqrt(s / 2205);
    };
    return { early: win(4410), late: win(44100 - 2205 - 10), mid: win(44100 + 2205 - 1102), after: win(44100 + 4410 + 100) };
  }, b64(melodicWav()));
  // steady tone: level at 0.95 s equals level at 0.1 s; half-way through the 0.1 s release about half
  expect(Math.abs(r.late / r.early - 1)).toBeLessThan(0.02);
  expect(r.mid / r.early).toBeGreaterThan(0.35);
  expect(r.mid / r.early).toBeLessThan(0.65);
  expect(r.after).toBe(0);
});

test('masterInsert adds the application\'s own master stage to the master only', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async (kick) => {
    const { core, workletUrl } = window as any;
    const bytes = Uint8Array.from(atob(kick), (c) => c.charCodeAt(0)).buffer;
    const inst = new core.SampleInstrument(core.toAudioBuffer(await core.decodeSample(bytes, 'kick.wav')), { ...core.defaultZone(), mode: 'oneshot' });
    const timeline = { tempo: core.constantTempo(120, 96), length: 96, voices: [{ id: 'v', name: 'V' }], events: [{ type: 'note', tick: 0, duration: 10, voice: 'v', pitch: 60, velocity: 127 }] };
    const res = await core.renderTimeline({
      timeline, tailSeconds: 0, master: true, stems: [{ voice: 'v', processed: true }], resolve: () => inst, fxModuleUrl: workletUrl,
      masterInsert: (ctx: BaseAudioContext, input: AudioNode) => {
        const g = ctx.createGain();
        g.gain.value = 0.5;
        input.connect(g);
        return g;
      },
    });
    const [m, s] = res.outputs.map((o: any) => o.channels[0]);
    let err = 0;
    for (let i = 0; i < m.length; i++) err = Math.max(err, Math.abs(m[i] - 0.5 * s[i]));
    return { err, peak: Math.max(...s) };
  }, b64(kickWav()));
  expect(r.peak).toBeGreaterThan(0.1);
  expect(r.err).toBeLessThan(1e-6);
});

test('masterLatencyFrames keeps a delaying master insert aligned with the stems', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async (kick) => {
    const { core, workletUrl } = window as any;
    const bytes = Uint8Array.from(atob(kick), (c) => c.charCodeAt(0)).buffer;
    const inst = new core.SampleInstrument(core.toAudioBuffer(await core.decodeSample(bytes, 'kick.wav')), { ...core.defaultZone(), mode: 'oneshot' });
    const timeline = { tempo: core.constantTempo(120, 96), length: 96, voices: [{ id: 'v', name: 'V' }], events: [{ type: 'note', tick: 0, duration: 10, voice: 'v', pitch: 60, velocity: 127 }, { type: 'note', tick: 48, duration: 10, voice: 'v', pitch: 60, velocity: 127 }] };
    const D = 300;
    const delay = (ctx: BaseAudioContext, input: AudioNode) => {
      const d = ctx.createDelay(1);
      d.delayTime.value = D / ctx.sampleRate;
      input.connect(d);
      return d;
    };
    const run = (latency: number) => core.renderTimeline({ timeline, tailSeconds: 0.2, master: true, stems: [{ voice: 'v', processed: true }], resolve: () => inst, fxModuleUrl: workletUrl, masterInsert: delay, masterLatencyFrames: latency });
    const late = await run(0);
    const fixed = await run(D);
    const diff = (a: Float32Array, b: Float32Array) => a.reduce((m: number, v: number, i: number) => Math.max(m, Math.abs(v - b[i])), 0);
    return {
      lengths: [late.outputs[0].channels[0].length, fixed.outputs[0].channels[0].length, fixed.outputs[1].channels[0].length, fixed.frames],
      lateDiff: diff(late.outputs[0].channels[0], late.outputs[1].channels[0]),
      fixedDiff: diff(fixed.outputs[0].channels[0], fixed.outputs[1].channels[0]),
    };
  }, b64(kickWav()));
  expect(new Set(r.lengths).size).toBe(1);
  expect(r.lateDiff).toBeGreaterThan(0.1);
  expect(r.fixedDiff).toBeLessThan(1e-6);
});
