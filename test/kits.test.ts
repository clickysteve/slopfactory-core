import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createZip, readZip } from '../src/export/zip';
import { encodeWav16 } from '../src/export/wav';
import { decodeSample } from '../src/sampler/decode';
import { writeBundle } from '../src/storage/bundle';
import { IndexedDbSampleStore, MemorySampleStore, sampleFromBytes, sha256Hex, StorageError } from '../src/storage/samples';
import {
  Auditioner,
  describeMapping,
  IndexedDbKitStore,
  installBundledKits,
  KIT_FORMAT,
  KitError,
  KitLibrary,
  KitSession,
  kitName,
  mapKit,
  MemoryKitStore,
  migrateOnce,
  readKitArchive,
  safeArchivePath,
  sniffFormat,
  uniqueKitName,
  validateKitData,
  writeKitArchive,
  type KitData,
  type KitHost,
  type KitInstrument,
  type KitMapping,
  type KitTarget,
} from '../src/kits';

/** A real 16-bit WAV: a decaying tone, distinct per seed. */
async function wav(seed: number, frames = 2205): Promise<ArrayBuffer> {
  const ch = new Float32Array(frames);
  for (let i = 0; i < frames; i++) ch[i] = Math.sin((i * (seed + 2) * Math.PI) / 50) * Math.exp(-i / 600) * 0.8;
  return (await encodeWav16([ch], 44100)).slice().buffer;
}

function lib(o: { audio?: MemorySampleStore | IndexedDbSampleStore | null; store?: MemoryKitStore | IndexedDbKitStore | null; inUse?: () => string[] } = {}) {
  const audio = o.audio === undefined ? new MemorySampleStore() : o.audio;
  const store = o.store === undefined ? new MemoryKitStore() : o.store;
  return { library: new KitLibrary({ app: 'test-app', audio, store, inUse: o.inUse }), audio: audio as MemorySampleStore, store };
}

async function kitWith(library: KitLibrary, names: [string, string][]): Promise<KitData> {
  const instruments: KitInstrument[] = [];
  let n = 1;
  for (const [role, name] of names) {
    const r = await library.addSample(await wav(n++), name, 'audio/wav');
    instruments.push({ role, samples: [{ sample: r.sample.id, name }] });
  }
  return { name: 'Test Kit', instruments };
}

describe('names and validation', () => {
  it('accepts 1-64 character names and refuses empty, long and control characters', () => {
    expect(kitName('  Jungle  ')).toBe('Jungle');
    for (const bad of ['', '   ', 'x'.repeat(65), 'a\u0007b', 42]) expect(() => kitName(bad)).toThrow(KitError);
    expect(uniqueKitName('Kit', ['kit', 'Kit 2'])).toBe('Kit 3');
    expect(uniqueKitName('x'.repeat(64), ['x'.repeat(64)])).toHaveLength(64);
  });

  it('validates kit data, cleans text and keeps application data', () => {
    const id = 'a'.repeat(64);
    const k = validateKitData({ name: 'K', junk: 1, instruments: [{ role: 'kick', label: '<b>KICK</b>\u0000', samples: [{ sample: id, weight: 3, velocity: [0, 64] }], ext: { other: { keep: [1, 2] } } }] });
    expect(k).not.toHaveProperty('junk');
    expect(k.instruments[0].label).toBe('<b>KICK</b>'); // text, never HTML: control characters only are removed
    expect(k.instruments[0].ext).toEqual({ other: { keep: [1, 2] } });
    for (const bad of [
      { name: 'K', instruments: [{ role: 'Kick!', samples: [] }] },
      { name: 'K', instruments: [{ role: 'kick', samples: [{ sample: 'not-a-hash' }] }] },
      { name: 'K', instruments: [{ role: 'kick', samples: [{ sample: id, velocity: [90, 10] }] }] },
      { name: 'K', instruments: [{ role: 'kick', samples: [{ sample: id, weight: -1 }] }] },
      { name: 'K' },
      { name: '', instruments: [] },
    ])
      expect(() => validateKitData(bad)).toThrow(KitError);
  });

  it('safe archive paths cannot escape', () => {
    for (const ok of ['manifest.json', 'samples/01-kick.wav']) expect(safeArchivePath(ok)).toBe(true);
    for (const bad of ['../x.wav', 'samples/../../x', '/etc/passwd', 'C:/x', 'a\\b', 'samples//x', '', './x']) expect(safeArchivePath(bad)).toBe(false);
  });

  it('sniffs formats from content, then the extension', async () => {
    expect(sniffFormat(await wav(1), 'whatever.bin')).toBe('wav');
    expect(sniffFormat(new Uint8Array([0x66, 0x4c, 0x61, 0x43]), 'x')).toBe('flac');
    expect(sniffFormat(new Uint8Array([1, 2, 3, 4]), 'hat.AIF')).toBe('aiff');
  });
});

describe('sample library', () => {
  it('imports, decodes, deduplicates and records metadata', async () => {
    const { library, audio } = lib();
    const bytes = await wav(1);
    const a = await library.addSample(bytes, 'Kick 01.wav', 'audio/wav');
    expect(a.duplicate).toBe(false);
    expect(a.stored).toBe(true);
    expect(a.sample).toMatchObject({ name: 'Kick 01.wav', format: 'wav', sampleRate: 44100, channels: 1, size: bytes.byteLength });
    expect(a.sample.duration).toBeCloseTo(2205 / 44100, 5);
    const b = await library.addSample(bytes.slice(0), 'copy.wav');
    expect(b.duplicate).toBe(true);
    expect(b.sample.name).toBe('Kick 01.wav');
    expect((await audio.list()).length).toBe(1);
    expect((await library.listSamples()).length).toBe(1);
  });

  it('rejects unsupported and damaged files without storing anything; reports each file in a batch', async () => {
    const { library, audio } = lib();
    const file = (name: string, b: ArrayBuffer) => ({ name, arrayBuffer: async () => b });
    const r = await library.importFiles([file('notes.txt', new TextEncoder().encode('hello').buffer), file('broken.wav', new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]).buffer), file('ok.wav', await wav(3))]);
    expect(r.added.map((x) => x.sample.name)).toEqual(['ok.wav']);
    expect(r.errors.map((e) => e.name)).toEqual(['notes.txt', 'broken.wav']);
    expect((await audio.list()).length).toBe(1);
  });

  it('a full disk stops the import and leaves no half-stored sample', async () => {
    const { library, audio, store } = lib();
    audio!.quotaBytes = 10;
    await expect(library.addSample(await wav(1), 'big.wav')).rejects.toMatchObject({ code: 'quota' });
    expect((await library.listSamples()).length).toBe(0);
    audio!.quotaBytes = Infinity;
    (store as MemoryKitStore).failNext = new StorageError('failed', 'index write failed');
    await expect(library.addSample(await wav(1), 'big.wav')).rejects.toThrow('index write failed');
    expect((await audio!.list()).length).toBe(0); // the audio written before the failed index write is removed again
  });

  it('works for the visit without browser storage', async () => {
    const { library } = lib({ audio: null, store: null });
    const r = await library.addSample(await wav(1), 'k.wav');
    expect(r.stored).toBe(false);
    expect(library.persistent).toBe(false);
    await expect(library.createKit('K')).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('caches decoded audio within a budget and decodes stored samples on demand', async () => {
    const audio = new MemorySampleStore();
    const store = new MemoryKitStore();
    const decode = vi.fn((b: ArrayBuffer, n: string) => decodeSample(b, n));
    const a = new KitLibrary({ app: 't', audio, store, decode, cacheBytes: 2205 * 4 * 2 });
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await a.addSample(await wav(i), `s${i}.wav`)).sample.id);
    expect(a.cache.bytes).toBeLessThanOrEqual(2205 * 4 * 2);
    expect(a.cache.has(ids[0])).toBe(false); // the oldest was dropped
    decode.mockClear();
    await a.decoded(ids[2]);
    expect(decode).not.toHaveBeenCalled();
    const fresh = new KitLibrary({ app: 't', audio, store, decode });
    await Promise.all([fresh.decoded(ids[0]), fresh.decoded(ids[0])]);
    expect(decode).toHaveBeenCalledTimes(1);
    await expect(fresh.decoded('f'.repeat(64), 'gone.wav')).rejects.toMatchObject({ code: 'missing-audio' });
  });
});

describe('kits', () => {
  it('create, save, load, rename, duplicate and delete', async () => {
    const { library, audio } = lib();
    const data = await kitWith(library, [['kick', 'kick.wav'], ['snare', 'snare.wav']]);
    const kit = await library.saveKit(data);
    expect((await library.getKit(kit.id))!.instruments).toEqual(data.instruments);
    const renamed = await library.renameKit(kit.id, 'Renamed');
    expect(renamed.name).toBe('Renamed');
    const before = (await audio.list()).length;
    const copy = await library.duplicateKit(kit.id);
    expect(copy.name).toBe('Renamed Copy');
    expect(copy.id).not.toBe(kit.id);
    expect((await audio.list()).length).toBe(before); // no audio copied
    await expect(library.renameKit(copy.id, 'renamed')).rejects.toMatchObject({ code: 'exists' });
    await expect(library.saveKit({ ...data, name: 'RENAMED' })).rejects.toMatchObject({ code: 'exists' });
    expect((await library.listKits()).map((k) => k.name)).toEqual(['Renamed', 'Renamed Copy']);
    await library.setDefault(kit.id);
    await library.deleteKit(kit.id);
    expect(await library.getDefault()).toBeNull();
    expect((await library.listKits()).map((k) => k.name)).toEqual(['Renamed Copy']);
  });

  it('replacing a kit of the same name happens only when asked, in one step', async () => {
    const { library } = lib();
    const data = await kitWith(library, [['kick', 'kick.wav']]);
    const a = await library.saveKit({ ...data, name: 'Main' });
    await library.setDefault(a.id);
    const b = await library.saveKit({ ...data, name: 'main', instruments: [] }, { replace: true });
    expect((await library.listKits()).map((k) => k.id)).toEqual([b.id]);
    expect(await library.getDefault()).toBe(b.id);
  });

  it('deleting a kit never deletes samples another kit or the application still uses', async () => {
    let appUses: string[] = [];
    const { library, audio } = lib({ inUse: () => appUses });
    const data = await kitWith(library, [['kick', 'kick.wav'], ['snare', 'snare.wav'], ['hat-closed', 'hat.wav']]);
    const [kick, snare, hat] = data.instruments.map((i) => i.samples[0].sample);
    const one = await library.saveKit({ ...data, name: 'One' });
    await library.saveKit({ name: 'Two', instruments: [data.instruments[0]] });
    appUses = [snare];
    expect(await library.deleteKit(one.id, { removeUnusedSamples: true })).toBe(1);
    expect(await audio.has(kick)).toBe(true); // in kit Two
    expect(await audio.has(snare)).toBe(true); // used by the application
    expect(await audio.has(hat)).toBe(false); // used by nothing
    await expect(library.removeSample(kick)).rejects.toMatchObject({ code: 'in-use' });
    await expect(library.removeSample(snare)).rejects.toMatchObject({ code: 'in-use' });
    appUses = [];
    expect(await library.removeUnused()).toBe(1);
    expect(await audio.has(snare)).toBe(false);
    expect(await audio.has(kick)).toBe(true);
  });

  it('reports and resolves missing samples', async () => {
    const { library, audio } = lib();
    const data = await kitWith(library, [['kick', 'kick.wav'], ['snare', 'snare.wav']]);
    const kit = await library.saveKit(data);
    const snare = data.instruments[1].samples[0].sample;
    await audio!.delete(snare);
    expect(await library.missing(kit)).toEqual([snare]);
    await expect(library.exportKit(kit)).rejects.toMatchObject({ code: 'missing-audio' });
    // the same file imported again is the same sample: the kit is whole again
    const again = await library.addSample(await wav(2), 'found it.wav');
    expect(again.sample.id).toBe(snare);
    expect(await library.missing(kit)).toEqual([]);
    const other = await library.addSample(await wav(9), 'other.wav');
    const fixed = await library.replaceSample(kit.id, snare, other.sample.id);
    expect(fixed.instruments[1].samples[0].sample).toBe(other.sample.id);
  });
});

describe('portable kits', () => {
  it('export a real ZIP with every sample as playable audio, and import it into an independent library', async () => {
    const a = lib();
    const data = await kitWith(a.library, [['kick', 'Kick 01.wav'], ['snare', 'snare.wav'], ['tom-high', 'Hi tom.wav']]);
    data.instruments[0].ext = { 'test-app': { level: 0.5 } };
    const kit = await a.library.saveKit({ ...data, description: 'Three drums' });
    const { bytes, fileName } = await a.library.exportKit(kit);
    expect(fileName).toBe('Test Kit.kit.zip');

    // the archive itself: a manifest and the original bytes, readable by any ZIP reader
    const files = await readZip(bytes);
    const manifest = JSON.parse(new TextDecoder().decode(files.find((f) => f.name === 'manifest.json')!.data));
    expect(manifest).toMatchObject({ format: KIT_FORMAT, version: 1, generator: { app: 'test-app' }, kit: { name: 'Test Kit', description: 'Three drums' } });
    expect(manifest.samples.map((s: { file: string }) => s.file)).toEqual(['samples/01-kick-01.wav', 'samples/02-snare.wav', 'samples/03-hi-tom.wav']);
    for (const s of manifest.samples) {
      const f = files.find((x) => x.name === s.file)!;
      expect(await sha256Hex(f.data)).toBe(s.id);
      const d = await decodeSample(f.data.slice().buffer, s.name);
      expect(d.frames).toBe(2205);
      expect(Math.max(...d.channels[0])).toBeGreaterThan(0.3);
    }
    expect(JSON.stringify(manifest)).not.toMatch(/"id":"[0-9a-f-]{36}"/); // no browser-local kit ids

    const b = lib();
    const r = await b.library.importKit(bytes);
    expect(r).toMatchObject({ saved: true, renamed: false, added: 3 });
    expect(r.kit.instruments).toEqual(kit.instruments);
    expect(r.kit.origin).toEqual({ app: 'test-app' });
    expect(await b.library.missing(r.kit)).toEqual([]);
    const back = await b.library.readSample(kit.instruments[0].samples[0].sample);
    expect(new Uint8Array(back!.bytes)).toEqual(new Uint8Array((await a.library.readSample(kit.instruments[0].samples[0].sample))!.bytes));
    // importing again: a new kit with a new name, no new audio
    const r2 = await b.library.importKit(bytes);
    expect(r2).toMatchObject({ renamed: true, added: 0 });
    expect(r2.kit.name).toBe('Test Kit 2');
    expect((await b.audio!.list()).length).toBe(3);
  });

  it('refuses corrupt archives, bad manifests, newer versions, traversal and expansion, keeping nothing', async () => {
    const a = lib();
    const data = await kitWith(a.library, [['kick', 'kick.wav']]);
    const { bytes } = await a.library.exportKit(data);
    const files = await readZip(bytes);
    const manifest = JSON.parse(new TextDecoder().decode(files[0].data));
    const rezip = (m: unknown, extra: { name: string; data: Uint8Array }[] = files.slice(1)) => createZip([{ name: 'manifest.json', data: new TextEncoder().encode(typeof m === 'string' ? m : JSON.stringify(m)) }, ...extra]);
    const b = lib();
    const cases: [Uint8Array, string][] = [
      [new Uint8Array([1, 2, 3]), 'not-a-kit'],
      [bytes.slice(0, bytes.length - 40), 'not-a-kit'],
      [createZip([{ name: 'readme.txt', data: new Uint8Array([1]) }]), 'not-a-kit'],
      [rezip('{nope'), 'damaged'],
      [rezip({ ...manifest, format: 'something-else' }), 'not-a-kit'],
      [rezip({ ...manifest, version: 2 }), 'version'],
      [rezip({ ...manifest, kit: { name: 'x', instruments: [{ role: 'kick', samples: [{ sample: 'zz' }] }] } }), 'invalid'],
      [rezip(manifest, []), 'missing-audio'],
      [rezip(manifest, [{ name: files[1].name, data: new Uint8Array(files[1].data.length).fill(7) }]), 'missing-audio'],
      [rezip({ ...manifest, samples: [{ ...manifest.samples[0], file: '../../escape.wav' }] }, [{ name: '../../escape.wav', data: files[1].data }]), 'damaged'],
    ];
    for (const [bad, code] of cases) await expect(b.library.importKit(bad), code).rejects.toMatchObject({ code });
    // a manifest whose audio is not audio decodes to nothing: refused before anything is kept
    const junk = new TextEncoder().encode('RIFF....WAVEjunkjunk');
    const junkId = await sha256Hex(junk);
    const m2 = { ...manifest, kit: { name: 'x', instruments: [{ role: 'kick', samples: [{ sample: junkId }] }] }, samples: [{ ...manifest.samples[0], id: junkId, file: 'samples/x.wav' }] };
    await expect(b.library.importKit(rezip(m2, [{ name: 'samples/x.wav', data: junk }]))).rejects.toMatchObject({ code: 'damaged' });
    // a tiny archive that expands beyond the limit
    await expect(readKitArchive(bytes, { limits: { maxTotalBytes: 100 } })).rejects.toMatchObject({ code: 'too-large' });
    await expect(readKitArchive(bytes, { limits: { maxArchiveBytes: 100 } })).rejects.toMatchObject({ code: 'too-large' });
    expect((await b.audio!.list()).length).toBe(0);
    expect((await b.library.listKits()).length).toBe(0);
  });

  it('a storage failure during import keeps nothing', async () => {
    const a = lib();
    const { bytes } = await a.library.exportKit(await kitWith(a.library, [['kick', 'kick.wav'], ['snare', 'snare.wav']]));
    const b = lib();
    (b.store as MemoryKitStore).failNext = new StorageError('quota', 'Browser storage is full');
    await expect(b.library.importKit(bytes)).rejects.toMatchObject({ code: 'quota' });
    expect((await b.audio!.list()).length).toBe(0);
    expect((await b.library.listKits()).length).toBe(0);
  });

  it('writes nothing for a kit whose audio is not given', async () => {
    expect(() => writeKitArchive({ name: 'x', instruments: [{ role: 'kick', samples: [{ sample: 'a'.repeat(64) }] }] }, [], { app: 't' })).toThrow(KitError);
  });

  it('reads a legacy archive through the application\'s converter', async () => {
    const s = await sampleFromBytes(await wav(4), 'kick.wav', 'audio/wav');
    const legacy = writeBundle('old-kit', { name: 'kit.json', text: JSON.stringify({ name: 'Old', items: [{ cat: 'kick', audio: s.id }] }) }, [s]);
    const { library } = lib();
    await expect(library.importKit(legacy)).rejects.toMatchObject({ code: 'not-a-kit' });
    const r = await library.importKit(legacy, {
      legacy: (b) => {
        const doc = JSON.parse(b.projectText) as { name: string; items: { cat: string; audio: string }[] };
        return { kit: { name: doc.name, instruments: doc.items.map((i) => ({ role: i.cat, samples: [{ sample: i.audio }] })) }, samples: b.samples };
      },
    });
    expect(r.legacy).toBe('old-kit');
    expect(r.kit.instruments[0].samples[0].sample).toBe(s.id);
  });
});

describe('mapping', () => {
  const ref = (n: number) => ({ sample: n.toString(16).padStart(64, '0') });
  const kit = (...ins: [string, number[], number?][]): KitData => ({ name: 'k', instruments: ins.map(([role, s, index]) => ({ role, samples: s.map(ref), ...(index !== undefined ? { index } : {}) })) });

  it('matches roles and indexes; fewer targets keep the rest as unmapped, never dropped', () => {
    const k = kit(['kick', [1]], ['tom-high', [2]], ['tom-mid', [3]], ['tom-low', [4]], ['snare-ghost', [5, 6]]);
    const targets: KitTarget[] = [{ id: 'K', role: 'kick' }, { id: 'T', role: 'tom-low', accepts: ['tom-mid', 'tom-high'] }];
    const m = mapKit(k, targets);
    expect(m.mapped.map((x) => [x.target.id, x.instrument.role, x.match])).toEqual([['K', 'kick', 'exact'], ['T', 'tom-low', 'exact']]);
    expect(m.unmapped.map((u) => [u.instrument.role, u.samples.length, u.reason])).toEqual([['tom-high', 1, 'no-target'], ['tom-mid', 1, 'no-target'], ['snare-ghost', 2, 'no-target']]);
    expect(m.empty).toEqual([]);
    expect(describeMapping(m).join('\n')).toContain('GHOST SNARE: not played here; 2 samples kept');
  });

  it('alternates fill empty targets; capacity keeps extra samples (primary first)', () => {
    const k = kit(['perc', [1, 2, 3]], ['clap', [4]]);
    k.instruments[0].samples[2].primary = true;
    const m = mapKit(k, [{ id: 'COWBELL', role: 'cowbell', accepts: ['perc'] }, { id: 'CLAP', role: 'clap' }, { id: 'RIDE', role: 'ride' }]);
    expect(m.mapped.map((x) => [x.target.id, x.samples.map((s) => parseInt(s.sample, 16)), x.match])).toEqual([['COWBELL', [3], 'alternate'], ['CLAP', [4], 'exact']]);
    expect(m.unmapped).toMatchObject([{ reason: 'capacity', samples: [ref(1), ref(2)] }]);
    expect(m.empty.map((t) => t.id)).toEqual(['RIDE']);
  });

  it('unlimited targets take every instrument of their role and the roles they accept', () => {
    const k = kit(['snare', [1]], ['snare', [2]], ['clap', [3]], ['rim', [4]], ['hat-closed', [5]], ['hat-closed', [6]]);
    const m = mapKit(k, [{ id: 'snare', role: 'snare', capacity: Infinity }, { id: 'perc', role: 'perc', capacity: Infinity, accepts: ['clap', 'rim'] }, { id: 'hat', role: 'hat-closed', capacity: Infinity }]);
    expect(m.mapped.map((x) => [x.target.id, x.samples.length])).toEqual([['snare', 1], ['snare', 1], ['perc', 1], ['perc', 1], ['hat', 1], ['hat', 1]]);
    expect(m.unmapped).toEqual([]);
  });

  it('several targets of one role take instruments by index', () => {
    const k = kit(['snare', [1]], ['snare', [2]], ['kick', [3], 1]);
    const m = mapKit(k, [{ id: 'S1', role: 'snare' }, { id: 'S2', role: 'snare' }, { id: 'K1', role: 'kick' }, { id: 'K2', role: 'kick' }]);
    expect(m.mapped.map((x) => [x.target.id, parseInt(x.samples[0].sample, 16)])).toEqual([['S1', 1], ['S2', 2], ['K2', 3]]);
    expect(m.empty.map((t) => t.id)).toEqual(['K1']);
  });
});

describe('IndexedDB', () => {
  it('kits, the sample index and preferences survive reopening (a reload)', async () => {
    const factory = new IDBFactory();
    const make = () => new KitLibrary({ app: 't', audio: new IndexedDbSampleStore('t-samples', factory), store: new IndexedDbKitStore('t-kits', factory) });
    const one = make();
    const kit = await one.saveKit(await kitWith(one, [['kick', 'kick.wav']]));
    await one.setDefault(kit.id);
    const two = make();
    expect((await two.listKits()).map((k) => k.name)).toEqual(['Test Kit']);
    expect(await two.getDefault()).toBe(kit.id);
    expect((await two.listSamples())[0]).toMatchObject({ name: 'kick.wav', format: 'wav', sampleRate: 44100 });
    expect((await two.decoded(kit.instruments[0].samples[0].sample)).frames).toBe(2205);
  });

  it('a commit is all or nothing', async () => {
    const st = new IndexedDbKitStore('atomic', new IDBFactory());
    await st.commit({ meta: { a: 1 } });
    await expect(st.commit({ meta: { b: 2 }, putKits: [{ id: undefined } as never] })).rejects.toBeInstanceOf(StorageError);
    expect(await st.getMeta('b')).toBeUndefined();
    expect(await st.getMeta('a')).toBe(1);
  });

  it('without IndexedDB the store reports unavailable', async () => {
    await expect(new IndexedDbKitStore('x', null).listKits()).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('session', () => {
  /** A toy application: one sample per role, with application data on instruments. */
  function host(library: KitLibrary) {
    const state = { sounds: new Map<string, string>(), fail: false };
    const targets: KitTarget[] = [{ id: 'K', role: 'kick' }, { id: 'S', role: 'snare' }];
    const h: KitHost = {
      targets: () => targets,
      capture: async (base) => {
        const keep = (base?.instruments ?? []).filter((i) => !targets.some((t) => t.role === i.role));
        return { instruments: [...[...state.sounds].map(([role, sample]) => ({ role, samples: [{ sample }], ext: { 'test-app': { mine: true } } })), ...keep] };
      },
      apply: async (_kit, m: KitMapping) => {
        for (const x of m.mapped) await library.decoded(x.samples[0].sample);
        if (state.fail) throw new Error('cannot play');
        state.sounds = new Map(m.mapped.map((x) => [x.target.role, x.samples[0].sample]));
      },
      clear: () => void state.sounds.clear(),
      signature: () => JSON.stringify([...state.sounds]),
    };
    return { h, state };
  }

  it('new, save, save as, load, rename, duplicate, delete, default and dirty', async () => {
    const { library } = lib();
    const { h, state } = host(library);
    const s = new KitSession(library, h);
    const k = await library.addSample(await wav(1), 'kick.wav');
    const sn = await library.addSample(await wav(2), 'snare.wav');
    state.sounds.set('kick', k.sample.id);
    expect(s.dirty).toBe(true);
    const a = await s.save('A');
    expect(s.dirty).toBe(false);
    expect(s.currentId).toBe(a.id);
    state.sounds.set('snare', sn.sample.id);
    expect(s.dirty).toBe(true);
    await s.save(); // over A
    expect(s.kits.map((x) => x.name)).toEqual(['A']);
    await expect(s.saveAs('a')).rejects.toMatchObject({ code: 'exists' });
    const b = await s.saveAs('B');
    await s.newKit();
    expect(state.sounds.size).toBe(0);
    expect(s.name).toBe('Untitled Kit');
    await s.load(a.id);
    expect(state.sounds.get('snare')).toBe(sn.sample.id);
    await s.rename(a.id, 'A2');
    expect(s.name).toBe('A2');
    const c = await s.duplicate(a.id);
    expect(c.name).toBe('A2 Copy');
    await s.setDefault(b.id);
    expect(s.defaultId).toBe(b.id);
    await s.delete(a.id);
    expect(s.currentId).toBeNull();
    expect(s.dirty).toBe(true);
    // a failed load changes nothing
    state.fail = true;
    const before = h.signature();
    await expect(s.load(b.id)).rejects.toThrow('cannot play');
    expect(h.signature()).toBe(before);
    state.fail = false;
    // restore opens the default
    const again = new KitSession(library, host(library).h);
    expect(await again.restore()).toBeNull();
    expect(again.currentId).toBe(b.id);
  });

  it('resume takes the last kit without applying it; unsaved follows the recorded fingerprint', async () => {
    const { library } = lib();
    const { h, state } = host(library);
    const s = new KitSession(library, h);
    state.sounds.set('kick', (await library.addSample(await wav(1), 'kick.wav')).sample.id);
    const a = await s.save('A');
    const apply = vi.spyOn(h, 'apply');
    const next = new KitSession(library, h);
    await next.resume();
    expect([next.currentId, next.name, next.dirty]).toEqual([a.id, 'A', false]);
    expect(apply).not.toHaveBeenCalled();
    state.sounds.set('snare', (await library.addSample(await wav(2), 'snare.wav')).sample.id);
    const third = new KitSession(library, h);
    await third.resume();
    expect([third.currentId, third.dirty]).toEqual([a.id, true]);
  });

  it('keeps instruments the application does not play through load and save; import opens unsaved', async () => {
    const a = lib();
    const data = await kitWith(a.library, [['kick', 'kick.wav'], ['tom-high', 'tom.wav']]);
    const { bytes } = await a.library.exportKit(data);
    const b = lib();
    const { h } = host(b.library);
    const s = new KitSession(b.library, h);
    const r = await s.importFile(bytes);
    expect(r.saved).toBe(false);
    expect(r.mapping!.unmapped.map((u) => u.instrument.role)).toEqual(['tom-high']);
    expect(s.dirty).toBe(true);
    expect(s.currentId).toBeNull();
    const saved = await s.save('Imported');
    expect(saved.instruments.map((i) => i.role).sort()).toEqual(['kick', 'tom-high']); // the tom survived
    expect(saved.instruments.find((i) => i.role === 'kick')!.ext).toEqual({ 'test-app': { mine: true } });
    const out = await s.exportCurrent();
    expect((await readKitArchive(out.bytes)).samples.length).toBe(2);
  });
});

describe('audition, migration and bundled kits', () => {
  it('plays one preview at a time on the given context and cleans up', async () => {
    const nodes: { disconnected: boolean; stopped?: boolean; onended?: () => void }[] = [];
    const ctx = {
      state: 'suspended',
      resume: vi.fn(async function (this: { state: string }) {
        this.state = 'running';
      }),
      destination: {},
      createBuffer: (ch: number, len: number, sr: number) => ({ numberOfChannels: ch, length: len, sampleRate: sr, copyToChannel: () => {} }),
      createBufferSource() {
        const n = { disconnected: false, buffer: null, connect: () => {}, disconnect: () => (n.disconnected = true), start: () => {}, stop: () => (n.stopped = true), onended: undefined as undefined | (() => void), stopped: false };
        nodes.push(n);
        return n;
      },
      createGain: () => ({ gain: { value: 0 }, connect: () => {}, disconnect: () => {} }),
    };
    const contexts = vi.fn(() => ctx as unknown as AudioContext);
    const au = new Auditioner({ context: contexts });
    const audio = { sampleRate: 44100, channels: [new Float32Array(10)] };
    expect(await au.play(audio, { key: 'a' })).toBe(true);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    await au.play(audio, { key: 'a' });
    expect(nodes[0].stopped).toBe(true);
    expect(nodes[0].disconnected).toBe(true);
    nodes[1].onended!();
    expect(au.active).toBe(false);
    expect(nodes[1].disconnected).toBe(true);
    expect(await new Auditioner({ context: () => null }).play(audio)).toBe(false);
  });

  it('a migration runs once, item by item, and a failure leaves it to run again', async () => {
    const { library } = lib();
    let fail = true;
    const run = (m: Parameters<Parameters<typeof migrateOnce>[2]>[0]) =>
      (async () => {
        await m.step('one', async () => {});
        await m.step('two', async () => {
          if (fail) throw new Error('disk error');
        });
      })();
    const first = await migrateOnce(library, 'x', run);
    expect(first).toMatchObject({ ran: true, migrated: 1, problems: ['two: disk error'] });
    fail = false;
    const second = await migrateOnce(library, 'x', run);
    expect(second).toMatchObject({ ran: true, migrated: 1, problems: [] }); // 'one' is not repeated
    expect(await migrateOnce(library, 'x', run)).toMatchObject({ ran: false });
  });

  it('installs a bundled kit once, as the default only if none, never over the user\'s kits', async () => {
    const src = lib();
    const { bytes } = await src.library.exportKit({ ...(await kitWith(src.library, [['kick', 'kick.wav']])), name: 'House Kit' });
    const { library } = lib();
    const mine = await library.saveKit({ name: 'House Kit', instruments: [] });
    const load = vi.fn(async () => bytes);
    const [r] = await installBundledKits(library, [{ id: 'house', version: 1, load }]);
    expect(r.status).toBe('installed');
    const kits = await library.listKits();
    expect(kits.map((k) => k.name)).toEqual(['House Kit', 'House Kit 2']);
    expect(kits.find((k) => k.id === r.kitId)!.bundled).toBe('house');
    expect(await library.getKit(mine.id)).toBeTruthy();
    expect(await library.getDefault()).toBe(r.kitId);
    await library.deleteKit(r.kitId!);
    expect((await installBundledKits(library, [{ id: 'house', version: 1, load }]))[0].status).toBe('present');
    expect(load).toHaveBeenCalledTimes(1);
    expect((await installBundledKits(library, [{ id: 'bad', version: 1, load: async () => new Uint8Array([1]) }]))[0].status).toBe('failed');
  });
});
