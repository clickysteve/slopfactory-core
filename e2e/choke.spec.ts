/**
 * Choke groups in a real browser: offline rendering (master and stems, a stem rendered on
 * its own, stereo, rapid retriggering, backwards compatibility) and live playback recorded
 * from a real AudioContext compared with the offline render of the same notes.
 */
import { expect, test, type Page } from '@playwright/test';
import { closedHatWav, openHatWav, rms } from './fixtures';

const SR = 44100;
const FADE_FRAMES = Math.ceil(0.006 * SR); // 5 ms fade + 1 ms stop margin

async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('ready');
}

/** Install shared page helpers: decoded hats, a timeline builder and a renderer. */
async function setup(page: Page) {
  await open(page);
  await page.evaluate(async ([oh, ch]) => {
    const w = window as any;
    const { core } = w;
    const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
    const zone = { ...core.defaultZone(), root: 60, mode: 'oneshot' };
    const sounds: Record<string, unknown> = {
      open: new core.SampleInstrument(core.toAudioBuffer(await core.decodeSample(bytes(oh), 'open.wav')), zone),
      closed: new core.SampleInstrument(core.toAudioBuffer(await core.decodeSample(bytes(ch), 'closed.wav')), zone),
    };
    const ppq = 960;
    // [seconds, voice, sound] at 120 BPM: 1 s = 2 quarters
    w.timeline = (notes: [number, string, string][]) => ({
      tempo: core.constantTempo(120, ppq),
      length: ppq * 4,
      voices: [{ id: 'v1', name: 'V1' }, { id: 'v2', name: 'V2' }],
      events: core.sortEvents(notes.map(([s, voice, instrument]) => ({ type: 'note', tick: Math.round(s * 2 * ppq), duration: 10, voice, pitch: 60, velocity: 127, instrument }))),
    });
    w.resolve = (_v: string, n: { instrument: string }) => sounds[n.instrument];
    w.hh = (_v: string, n: { instrument: string }) => (n.instrument === 'open' || n.instrument === 'closed' ? { group: 'hh' } : null);
    w.render = async (notes: [number, string, string][], opts: Record<string, unknown> = {}) => {
      const res = await core.renderTimeline({ timeline: w.timeline(notes), tailSeconds: 0, master: true, stems: [{ voice: 'v1', processed: true }, { voice: 'v2', processed: true }], resolve: w.resolve, fxModuleUrl: w.workletUrl, ...opts });
      return res.outputs.map((o: { channels: Float32Array[] }) => o.channels.map((c) => Array.from(c)));
    };
  }, [openHatWav().toString('base64'), closedHatWav().toString('base64')] as const);
}

const F = (a: number[]) => Float32Array.from(a);

test('a closed hat on another voice cuts the open hat, in the master and in the stems', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const w = window as any;
    const notes: [number, string, string][] = [[0, 'v1', 'open'], [0.5, 'v2', 'closed']];
    return { choked: await w.render(notes, { choke: w.hh }), free: await w.render(notes) };
  });
  const [master, v1, v2] = r.choked.map((o: number[][]) => o.map(F));
  const half = SR / 2;
  // the open hat rings until the closed hat, then is silent after the fade (both channels)
  for (const c of [0, 1]) {
    expect(rms(v1[c], half - 2000, half)).toBeGreaterThan(0.05);
    expect(rms(v1[c], half + FADE_FRAMES, 2 * SR)).toBe(0);
  }
  // stereo content is kept until the cut
  let lr = 0;
  for (let i = 1000; i < half; i++) lr = Math.max(lr, Math.abs(v1[0][i] - v1[1][i]));
  expect(lr).toBeGreaterThan(0.05);
  // the closed hat itself is not cut, and its stem starts exactly at 0.5 s
  expect(rms(v2[0], 0, half)).toBe(0);
  expect(Math.abs(v2[0][half]) + Math.abs(v2[0][half + 1])).toBeGreaterThan(0);
  // master = v1 + v2
  let err = 0;
  for (let i = 0; i < master[0].length; i++) err = Math.max(err, Math.abs(master[0][i] - v1[0][i] - v2[0][i]));
  expect(err).toBeLessThan(1e-6);
  // without a choke resolver nothing changes: the open hat rings on
  const free = F(r.free[1][0]);
  expect(rms(free, half + FADE_FRAMES, SR)).toBeGreaterThan(0.01);
  // before the cut, choked and free renders are identical
  let pre = 0;
  for (let i = 0; i < half; i++) pre = Math.max(pre, Math.abs(free[i] - v1[0][i]));
  expect(pre).toBe(0);
});

test('a stem rendered on its own is cut exactly as in the full render', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const w = window as any;
    const notes: [number, string, string][] = [[0, 'v1', 'open'], [0.5, 'v2', 'closed'], [1, 'v1', 'open'], [1.25, 'v2', 'closed']];
    const full = await w.render(notes, { choke: w.hh });
    const alone = await w.core.renderTimeline({ timeline: w.timeline(notes), tailSeconds: 0, master: false, stems: [{ voice: 'v1', processed: true }], resolve: w.resolve, choke: w.hh, fxModuleUrl: w.workletUrl });
    let err = 0;
    const a = alone.outputs[0].channels[0];
    for (let i = 0; i < a.length; i++) err = Math.max(err, Math.abs(a[i] - full[1][0][i]));
    return err;
  });
  expect(r).toBe(0);
});

test('rapid retriggering: each open hat cuts the one before; overlapping stays without a group', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const w = window as any;
    const hits: [number, string, string][] = [0, 0.05, 0.1, 0.15, 0.2].map((s) => [s, 'v1', 'open']);
    const choked = (await w.render(hits, { choke: w.hh }))[1][0];
    const last = (await w.render([[0.2, 'v1', 'open']], { choke: w.hh }))[1][0];
    const free = (await w.render(hits))[1][0];
    return { choked, last, free };
  });
  const choked = F(r.choked);
  const last = F(r.last);
  const free = F(r.free);
  const at = Math.round(0.2 * SR) + FADE_FRAMES;
  // after the last retrigger's fade, only the last hit sounds
  let err = 0;
  for (let i = at; i < choked.length; i++) err = Math.max(err, Math.abs(choked[i] - last[i]));
  expect(err).toBeLessThan(1e-6);
  // without a group the hits overlap (louder than the single last hit)
  expect(rms(free, at, at + 4410)).toBeGreaterThan(rms(last, at, at + 4410) * 1.5);
});

test('live playback chokes exactly like the offline render', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const w = window as any;
    const { core } = w;
    const notes: [number, string, string][] = [[0, 'v1', 'open'], [0.5, 'v2', 'closed'], [1, 'v1', 'open'], [1.25, 'v1', 'open'], [1.5, 'v2', 'closed']];
    const offline = (await w.render(notes, { choke: w.hh, tailSeconds: 0.5 }))[0][0];

    const ctx = new AudioContext({ sampleRate: 44100 });
    await ctx.resume();
    const fx = await core.loadOutputFx(ctx, w.workletUrl);
    const mixer = new core.Mixer(ctx, { voices: ['v1', 'v2'], fxAvailable: fx });
    const player = new core.NotePlayer(ctx, mixer, w.resolve, { choke: w.hh });
    const code = "registerProcessor('rec', class extends AudioWorkletProcessor { constructor() { super(); this.buf = []; this.port.onmessage = () => this.port.postMessage(this.buf.splice(0)); } process(i) { const c = i[0] && i[0][0]; this.buf.push(c ? c.slice() : new Float32Array(128)); return true; } });";
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
    const rec = new AudioWorkletNode(ctx, 'rec', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
    const sink = ctx.createGain();
    sink.gain.value = 0;
    mixer.output.connect(rec);
    rec.connect(sink).connect(ctx.destination);
    await new Promise((res) => setTimeout(res, 200));
    const t0 = ctx.currentTime + 0.3;
    notes.forEach(([s, voice, instrument], i) => {
      player.noteOn(`n${i}`, voice, { time: t0 + s, pitch: 60, velocity: 127, instrument });
      player.noteOff(`n${i}`, t0 + s + 0.01);
    });
    await new Promise((res) => setTimeout(res, 3400));
    const blocks: Float32Array[] = await new Promise((res) => {
      rec.port.onmessage = (e) => res(e.data);
      rec.port.postMessage('flush');
    });
    await ctx.close();
    const live = new Float32Array(blocks.length * 128);
    blocks.forEach((b, i) => live.set(b, i * 128));
    return { offline, live: Array.from(live), rate: ctx.sampleRate };
  });
  expect(r.rate).toBe(SR);
  const off = F(r.offline);
  const live = F(r.live);
  const start = live.findIndex((v) => v !== 0);
  expect(start).toBeGreaterThan(0);
  // align on the first sample and compare the whole performance
  let err = 0;
  for (let i = 0; i < off.length && start + i < live.length; i++) err = Math.max(err, Math.abs(live[start + i] - off[i]));
  expect(start + off.length).toBeLessThanOrEqual(live.length);
  expect(err).toBeLessThan(1e-4);
});
