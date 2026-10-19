/**
 * Kits in a real browser: the built package by name, real IndexedDB (kept across a reload),
 * real Web Crypto, the browser's decoder, a real AudioContext for audition, and portable kit
 * files moved between two libraries that share nothing but the file.
 */
import { expect, test, type Page } from '@playwright/test';
import { kickWav, stereoWav, wav16 } from './fixtures';

async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('ready');
}
const b64 = (b: Buffer) => b.toString('base64');
const snareWav = () => wav16([Float32Array.from({ length: 8000 }, (_, i) => (Math.random() * 2 - 1) * Math.exp(-i / 1500) * 0.7)]);

test('a library in IndexedDB survives a reload; a portable kit carries playable audio into an independent library', async ({ page }) => {
  await open(page);
  const exported = await page.evaluate(async ([kick, snare]) => {
    const { kits, storage } = (window as any).modules;
    const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
    const lib = new kits.KitLibrary({ app: 'source-app', audio: new storage.IndexedDbSampleStore('e2e-a-samples'), store: new kits.IndexedDbKitStore('e2e-a-kits') });
    const k = await lib.addSample(bytes(kick), 'kick.wav', 'audio/wav');
    const s = await lib.addSample(bytes(snare), 'snare.wav', 'audio/wav');
    const kit = await lib.saveKit({ name: 'Browser Kit', instruments: [{ role: 'kick', samples: [{ sample: k.sample.id }] }, { role: 'snare', samples: [{ sample: s.sample.id }] }, { role: 'tom-high', samples: [{ sample: s.sample.id, name: 'tom stand-in' }] }] });
    await lib.setDefault(kit.id);
    return kit.id;
  }, [b64(kickWav()), b64(snareWav())] as const);

  await page.reload();
  await expect(page.locator('#status')).toHaveText('ready');
  const r = await page.evaluate(async (id) => {
    const { kits, storage } = (window as any).modules;
    const a = new kits.KitLibrary({ app: 'source-app', audio: new storage.IndexedDbSampleStore('e2e-a-samples'), store: new kits.IndexedDbKitStore('e2e-a-kits') });
    const listed = (await a.listKits()).map((k: any) => [k.id === id, k.name, k.samples]);
    const def = (await a.getDefault()) === id;
    const kit = await a.getKit(id);
    const file = await a.exportKit(kit);
    // a second library: other databases, nothing shared but the file's bytes
    const b = new kits.KitLibrary({ app: 'other-app', audio: new storage.IndexedDbSampleStore('e2e-b-samples'), store: new kits.IndexedDbKitStore('e2e-b-kits') });
    const imp = await b.importKit(new Uint8Array(file.bytes));
    const mapping = kits.mapKit(imp.kit, [{ id: 'K', role: 'kick' }, { id: 'S', role: 'snare' }]);
    const kickId = mapping.mapped[0].samples[0].sample;
    const decoded = await b.decoded(kickId);
    let peak = 0;
    for (const x of decoded.channels[0]) peak = Math.max(peak, Math.abs(x));
    // audition through a real AudioContext (one preview at a time, cleaned up)
    const ctx = new AudioContext();
    const au = new kits.Auditioner({ context: () => ctx });
    const played = await au.playSample(b, kickId);
    const active = au.active;
    au.stop();
    await ctx.close();
    return { listed, def, fileName: file.fileName, size: file.bytes.length, imported: imp.kit.name, unmapped: mapping.unmapped.map((u: any) => u.instrument.role), frames: decoded.frames, peak, played, active, after: au.active };
  }, exported);
  expect(r.listed).toEqual([[true, 'Browser Kit', 2]]);
  expect(r.def).toBe(true);
  expect(r.fileName).toBe('Browser Kit.kit.zip');
  expect(r.imported).toBe('Browser Kit');
  expect(r.unmapped).toEqual(['tom-high']);
  expect(r.frames).toBe(kickWav().length / 2 - 22);
  expect(r.peak).toBeGreaterThan(0.5);
  expect([r.played, r.active, r.after]).toEqual([true, true, false]);
});

test('stereo WAV metadata is recorded; a damaged compressed file is refused and the rest is kept', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async ([stereo]) => {
    const { kits, storage } = (window as any).modules;
    const lib = new kits.KitLibrary({ app: 't', audio: new storage.IndexedDbSampleStore('e2e-c-samples'), store: new kits.IndexedDbKitStore('e2e-c-kits') });
    const bytes = Uint8Array.from(atob(stereo), (c) => c.charCodeAt(0)).buffer;
    const ok = await lib.addSample(bytes, 'stereo.wav');
    const bad = await lib.importFiles([{ name: 'fake.mp3', arrayBuffer: async () => new Uint8Array([0xff, 0xfb, 1, 2, 3, 4, 5]).buffer }]);
    return { channels: ok.sample.channels, errors: bad.errors.length, kept: (await lib.listSamples()).length };
  }, [b64(stereoWav())] as const);
  expect(r).toEqual({ channels: 2, errors: 1, kept: 1 });
});
