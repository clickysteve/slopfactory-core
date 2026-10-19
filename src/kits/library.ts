/**
 * The kit library: an application's samples and kits in this browser.
 *
 * - **Samples** are imported once (decoded to validate them, then kept as their original bytes
 *   in the application's SampleStore, keyed by SHA-256) and indexed here with their metadata.
 *   Importing the same file again finds the stored one. Any kit can use any sample.
 * - **Kits** refer to samples by id. Duplicating or renaming a kit copies no audio. Deleting a
 *   kit never deletes a sample that another kit or the application still uses.
 * - **Portable kits** are exported with their audio and imported from files (archive.ts).
 * - Decoded audio is cached (least recently used, within a memory budget), so switching kits
 *   does not decode the same samples again; nothing is decoded until it is needed.
 *
 * Every operation either completes or changes nothing, and fails with a KitError, StorageError
 * or SampleError whose message is meant for the user.
 */
import { decodeSample, SampleError, type DecodedSample } from '../sampler/decode';
import { sampleFromBytes, StorageError, type SampleStore } from '../storage/samples';
import { CORE_VERSION } from '../version';
import { kitFileName, readKitArchive, writeKitArchive, type ArchiveSample, type LegacyKitReader } from './archive';
import { cleanText, copyName, KitError, kitName, kitSamples, uniqueKitName, validateKitData, type Kit, type KitData } from './model';
import { sniffFormat, type LibrarySample } from './sampleInfo';
import type { KitStore } from './store';

export interface KitLibraryOptions {
  /** the application's id, written into exported kits */
  app: string;
  /** where sample bytes are kept (the application's existing store), or null for none */
  audio: SampleStore | null;
  /** where kits and the sample index are kept, or null for none */
  store: KitStore | null;
  /** decoder (default: Core's decodeSample) */
  decode?: (bytes: ArrayBuffer, name: string) => Promise<DecodedSample>;
  /** samples the application uses outside saved kits (its current sounds, its projects): never deleted */
  inUse?: () => Iterable<string> | Promise<Iterable<string>>;
  /** decoded audio kept in memory, in bytes of sample data (default 160 MB) */
  cacheBytes?: number;
  now?: () => number;
  newId?: () => string;
}

export interface KitSummary {
  id: string;
  name: string;
  description?: string;
  /** distinct samples */
  samples: number;
  instruments: number;
  modified: number;
  /** a bundled kit's id */
  bundled?: string;
}

export interface SampleImport {
  sample: LibrarySample;
  decoded: DecodedSample;
  /** the same audio was already in the library */
  duplicate: boolean;
  /** kept in browser storage (false: for this visit only) */
  stored: boolean;
}

export interface SampleImportReport {
  added: SampleImport[];
  duplicates: SampleImport[];
  errors: { name: string; message: string }[];
}

export interface KitImport {
  /** the kit (saved: with its library id) */
  kit: Kit;
  saved: boolean;
  /** the name was taken, so it was changed */
  renamed: boolean;
  /** samples new to this library */
  added: number;
  /** the archive was a legacy format */
  legacy?: string;
}

/** A file to import: a File, or anything with a name and its bytes. */
export interface ImportFile {
  name: string;
  type?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0));
const sameName = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
const audioBytes = (d: DecodedSample) => d.channels.reduce((a, c) => a + c.length * 4, 0);

/** Decoded samples by id, least recently used dropped first beyond a memory budget. */
export class DecodeCache {
  private items = new Map<string, { p: Promise<DecodedSample>; bytes: number }>();
  private used = 0;
  constructor(readonly maxBytes = 160 * 1024 * 1024) {}

  get(id: string, load: () => Promise<DecodedSample>): Promise<DecodedSample> {
    const hit = this.items.get(id);
    if (hit) {
      this.items.delete(id);
      this.items.set(id, hit);
      return hit.p;
    }
    const entry = { p: load(), bytes: 0 };
    this.items.set(id, entry);
    entry.p.then(
      (d) => {
        if (this.items.get(id) !== entry) return;
        entry.bytes = audioBytes(d);
        this.used += entry.bytes;
        this.trim(id);
      },
      () => this.items.get(id) === entry && this.items.delete(id),
    );
    return entry.p;
  }
  set(id: string, d: DecodedSample): void {
    this.drop(id);
    const entry = { p: Promise.resolve(d), bytes: audioBytes(d) };
    this.items.set(id, entry);
    this.used += entry.bytes;
    this.trim(id);
  }
  has(id: string): boolean {
    return this.items.has(id);
  }
  drop(id: string): void {
    const e = this.items.get(id);
    if (!e) return;
    this.used -= e.bytes;
    this.items.delete(id);
  }
  clear(): void {
    this.items.clear();
    this.used = 0;
  }
  get bytes(): number {
    return this.used;
  }
  private trim(keep: string): void {
    for (const [id, e] of this.items) {
      if (this.used <= this.maxBytes) break;
      if (id === keep || !e.bytes) continue;
      this.drop(id);
    }
  }
}

export class KitLibrary {
  readonly app: string;
  readonly cache: DecodeCache;
  private now: () => number;
  private newId: () => string;

  constructor(private opts: KitLibraryOptions) {
    this.app = opts.app;
    this.cache = new DecodeCache(opts.cacheBytes);
    this.now = opts.now ?? (() => Date.now());
    this.newId = opts.newId ?? (() => globalThis.crypto.randomUUID());
  }

  /** Whether kits and samples outlive the page (browser storage is available). */
  get persistent(): boolean {
    return !!(this.opts.audio && this.opts.store);
  }
  get audio(): SampleStore | null {
    return this.opts.audio;
  }

  private stores(): { audio: SampleStore; store: KitStore } {
    if (!this.opts.audio || !this.opts.store) throw new KitError('unavailable', 'Browser storage is unavailable, so kits cannot be kept in this browser. You can still export the current kit.');
    return { audio: this.opts.audio, store: this.opts.store };
  }

  private decode(bytes: ArrayBuffer, name: string): Promise<DecodedSample> {
    return (this.opts.decode ?? ((b, n) => decodeSample(b, n)))(bytes, name);
  }

  // ---------------------------------------------------------------- samples

  /**
   * Import one sample: decoded first (an unsupported or damaged file throws SampleError and
   * nothing is stored), then kept as its original bytes and indexed. The same audio imported
   * again is the same sample (`duplicate`). Without browser storage the sample is still
   * returned, for this visit (`stored: false`).
   */
  async addSample(bytes: ArrayBuffer, name: string, type = ''): Promise<SampleImport> {
    const fileName = cleanText(name) || 'sample';
    const decoded = await this.decode(bytes, fileName);
    const s = await sampleFromBytes(bytes, fileName, type);
    const { audio, store } = this.opts;
    const existing = store ? await store.getSample(s.id) : null;
    const info: LibrarySample = {
      ...(existing ?? { id: s.id, name: fileName, type: s.type, size: s.size, added: this.now(), format: sniffFormat(bytes, fileName) }),
      duration: decoded.duration,
      sampleRate: decoded.sampleRate,
      channels: decoded.channels.length,
    };
    let stored = false;
    if (audio && store) {
      const had = await audio.has(s.id);
      if (!had) await audio.put(s);
      try {
        await store.commit({ putSamples: [info] });
      } catch (e) {
        if (!had && !existing) await audio.delete(s.id).catch(() => {});
        throw e;
      }
      stored = true;
    }
    this.cache.set(s.id, decoded);
    return { sample: info, decoded, duplicate: !!existing, stored };
  }

  /**
   * Import several files, one at a time (the page stays responsive). A file that fails is
   * reported and skipped; the others are kept.
   */
  async importFiles(files: ImportFile[], onProgress?: (done: number, total: number) => void): Promise<SampleImportReport> {
    const report: SampleImportReport = { added: [], duplicates: [], errors: [] };
    for (let i = 0; i < files.length; i++) {
      onProgress?.(i, files.length);
      const f = files[i];
      try {
        const r = await this.addSample(await f.arrayBuffer(), f.name, f.type ?? '');
        (r.duplicate ? report.duplicates : report.added).push(r);
      } catch (e) {
        report.errors.push({ name: cleanText(f.name), message: e instanceof Error ? e.message : String(e) });
        if (e instanceof StorageError && e.code === 'quota') {
          for (const rest of files.slice(i + 1)) report.errors.push({ name: cleanText(rest.name), message: 'Not imported: browser storage is full.' });
          break;
        }
      }
      await yieldToBrowser();
    }
    onProgress?.(files.length, files.length);
    return report;
  }

  /**
   * Index a sample whose bytes are already in the audio store (migrating an application's
   * existing samples): no decoding, nothing copied. False if the audio is not there.
   */
  async indexSample(id: string, info: Partial<Omit<LibrarySample, 'id'>> & { name: string }): Promise<boolean> {
    const { audio, store } = this.stores();
    if (!(await audio.has(id))) return false;
    const existing = await store.getSample(id);
    if (existing) return true;
    await store.commit({ putSamples: [{ id, type: '', size: 0, added: this.now(), format: '', ...info, name: cleanText(info.name) || 'sample' }] });
    return true;
  }

  async listSamples(): Promise<LibrarySample[]> {
    if (!this.opts.store) return [];
    return (await this.opts.store.listSamples()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSample(id: string): Promise<LibrarySample | null> {
    return this.opts.store ? this.opts.store.getSample(id) : null;
  }

  /** A sample's original bytes with its library information, or null if they are not in this browser. */
  async readSample(id: string): Promise<ArchiveSample | null> {
    const s = this.opts.audio ? await this.opts.audio.get(id) : null;
    if (!s) return null;
    const info = await this.getSample(id);
    return info ? { ...s, name: info.name || s.name, format: info.format, duration: info.duration, sampleRate: info.sampleRate, channels: info.channels } : s;
  }

  /** A sample's decoded audio (cached). Throws KitError('missing-audio') if it is not in this browser. */
  decoded(id: string, name = 'sample'): Promise<DecodedSample> {
    return this.cache.get(id, async () => {
      const s = this.opts.audio ? await this.opts.audio.get(id) : null;
      if (!s) throw new KitError('missing-audio', `"${name}" is not in this browser's storage. Import the file again, or a kit that contains it.`, [id]);
      return this.decode(s.bytes, s.name || name);
    });
  }

  /** Change a sample's name or descriptive metadata. */
  async updateSample(id: string, patch: Partial<Pick<LibrarySample, 'name' | 'description' | 'tags' | 'duration' | 'sampleRate' | 'channels'>>): Promise<LibrarySample> {
    const { store } = this.stores();
    const s = await store.getSample(id);
    if (!s) throw new KitError('not-found', 'That sample is no longer in the library.');
    const next: LibrarySample = { ...s, ...patch };
    if (patch.name !== undefined) next.name = cleanText(patch.name) || s.name;
    if (patch.description !== undefined) next.description = cleanText(patch.description, 2000) || undefined;
    if (patch.tags !== undefined) next.tags = patch.tags.map((t) => cleanText(t, 32)).filter(Boolean).slice(0, 32);
    await store.commit({ putSamples: [next] });
    return next;
  }

  /** Which saved kits use a sample, and whether the application does. */
  async usage(id: string): Promise<{ kits: string[]; app: boolean }> {
    const kits = this.opts.store ? await this.opts.store.listKits() : [];
    const app = new Set(await (this.opts.inUse?.() ?? []));
    return { kits: kits.filter((k) => kitSamples(k).includes(id)).map((k) => k.id), app: app.has(id) };
  }

  /** Delete a sample from this browser. Refused (KitError('in-use')) while a kit or the application uses it. */
  async removeSample(id: string): Promise<void> {
    const { audio, store } = this.stores();
    const u = await this.usage(id);
    if (u.kits.length || u.app) {
      const names = (await store.listKits()).filter((k) => u.kits.includes(k.id)).map((k) => `"${k.name}"`);
      throw new KitError('in-use', `This sample is still used${names.length ? ` by ${names.join(', ')}` : ''}${u.app ? `${names.length ? ' and' : ''} by the current sounds` : ''}, so it was kept.`);
    }
    await store.commit({ deleteSamples: [id] });
    await audio.delete(id);
    this.cache.drop(id);
  }

  /** Delete every library sample that no kit and nothing in the application uses. Returns how many. */
  async removeUnused(): Promise<number> {
    const { audio, store } = this.stores();
    const keep = new Set<string>(await (this.opts.inUse?.() ?? []));
    for (const k of await store.listKits()) for (const id of kitSamples(k)) keep.add(id);
    const gone = (await store.listSamples()).filter((s) => !keep.has(s.id)).map((s) => s.id);
    if (!gone.length) return 0;
    await store.commit({ deleteSamples: gone });
    for (const id of gone) {
      await audio.delete(id).catch(() => {});
      this.cache.drop(id);
    }
    return gone.length;
  }

  /** Samples a kit uses whose audio is not in this browser. */
  async missing(kit: Pick<KitData, 'instruments'>): Promise<string[]> {
    const audio = this.opts.audio;
    const out: string[] = [];
    for (const id of kitSamples(kit)) if (!audio || !(await audio.has(id))) out.push(id);
    return out;
  }

  // ---------------------------------------------------------------- kits

  async listKits(): Promise<KitSummary[]> {
    if (!this.opts.store) return [];
    return (await this.opts.store.listKits())
      .map((k) => ({ id: k.id, name: k.name, ...(k.description ? { description: k.description } : {}), samples: kitSamples(k).length, instruments: k.instruments.length, modified: k.modified, ...(k.origin?.bundled ? { bundled: k.origin.bundled } : {}) }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  async getKit(id: string): Promise<Kit | null> {
    return this.opts.store ? this.opts.store.getKit(id) : null;
  }

  private async mustGet(id: string): Promise<Kit> {
    const k = await this.stores().store.getKit(id);
    if (!k) throw new KitError('not-found', 'That kit no longer exists.');
    return k;
  }

  /**
   * Save a kit (new without `id`, else replacing the kit with that id). `audio` gives the bytes
   * of samples the library may not have yet (they are stored first). A different kit with the
   * same name (case-insensitive) is an error unless `replace` (after asking the user): then
   * that kit is replaced in the same step.
   */
  async saveKit(input: KitData & { id?: string; origin?: Kit['origin'] }, opts: { audio?: ArchiveSample[]; replace?: boolean } = {}): Promise<Kit> {
    const { audio, store } = this.stores();
    const data = validateKitData(input);
    const kits = await store.listKits();
    const prior = input.id ? kits.find((k) => k.id === input.id) : undefined;
    const clash = kits.find((k) => k.id !== input.id && sameName(k.name, data.name));
    if (clash && !opts.replace) throw new KitError('exists', `A kit named "${clash.name}" already exists.`);
    const given = new Map((opts.audio ?? []).map((s) => [s.id, s]));
    const infos: LibrarySample[] = [];
    const added: string[] = [];
    try {
      for (const id of kitSamples(data)) {
        const info = await store.getSample(id);
        const s = given.get(id);
        if (s && !(await audio.has(id))) {
          await audio.put(s);
          added.push(id);
        }
        if (!info && (s || (await audio.has(id)))) {
          const ref = data.instruments.flatMap((i) => i.samples).find((r) => r.sample === id);
          infos.push({ id, name: cleanText(s?.name ?? ref?.name) || 'sample', type: s?.type ?? '', size: s?.bytes.byteLength ?? 0, added: this.now(), format: s ? s.format || sniffFormat(s.bytes, s.name) : '', ...(s?.duration ? { duration: s.duration, sampleRate: s.sampleRate, channels: s.channels } : {}) });
        }
      }
      const now = this.now();
      const kit: Kit = { ...data, id: input.id ?? this.newId(), created: prior?.created ?? now, modified: now, ...((input.origin ?? prior?.origin) ? { origin: input.origin ?? prior?.origin } : {}) };
      const meta: Record<string, unknown> = {};
      if (clash) {
        if ((await store.getMeta('default')) === clash.id) meta.default = kit.id;
        if ((await store.getMeta('current')) === clash.id) meta.current = kit.id;
      }
      await store.commit({ putKits: [kit], deleteKits: clash ? [clash.id] : [], putSamples: infos, meta });
      return kit;
    } catch (e) {
      for (const id of added) await audio.delete(id).catch(() => {});
      throw e;
    }
  }

  /** A new, empty kit. */
  createKit(name: string): Promise<Kit> {
    return this.saveKit({ name, instruments: [] });
  }

  async renameKit(id: string, name: string): Promise<Kit> {
    const kit = await this.mustGet(id);
    const n = kitName(name);
    const clash = (await this.stores().store.listKits()).find((k) => k.id !== id && sameName(k.name, n));
    if (clash) throw new KitError('exists', `A kit named "${clash.name}" already exists.`);
    const next = { ...kit, name: n, modified: this.now() };
    await this.stores().store.commit({ putKits: [next] });
    return next;
  }

  /** A copy of a saved kit, sharing its samples (no audio is copied). */
  async duplicateKit(id: string, name?: string): Promise<Kit> {
    const kit = await this.mustGet(id);
    const taken = (await this.stores().store.listKits()).map((k) => k.name);
    const n = name === undefined ? uniqueKitName(copyName(kit.name), taken) : kitName(name);
    const { id: _id, created: _c, modified: _m, origin: _o, ...data } = kit;
    return this.saveKit({ ...data, name: n });
  }

  /**
   * Delete a saved kit. Its samples stay in the library; with `removeUnusedSamples`, those that
   * no other kit and nothing in the application uses are deleted too. Returns how many were.
   */
  async deleteKit(id: string, opts: { removeUnusedSamples?: boolean } = {}): Promise<number> {
    const { audio, store } = this.stores();
    const kit = await this.mustGet(id);
    const meta: Record<string, unknown> = {};
    if ((await store.getMeta('default')) === id) meta.default = undefined;
    if ((await store.getMeta('current')) === id) meta.current = undefined;
    let gone: string[] = [];
    if (opts.removeUnusedSamples) {
      const keep = new Set<string>(await (this.opts.inUse?.() ?? []));
      for (const k of await store.listKits()) if (k.id !== id) for (const s of kitSamples(k)) keep.add(s);
      gone = kitSamples(kit).filter((s) => !keep.has(s));
    }
    await store.commit({ deleteKits: [id], deleteSamples: gone, meta });
    for (const s of gone) {
      await audio.delete(s).catch(() => {});
      this.cache.drop(s);
    }
    return gone.length;
  }

  /** Point every use of one sample in a saved kit at another (to resolve a missing sample). */
  async replaceSample(kitId: string, from: string, to: string): Promise<Kit> {
    const kit = await this.mustGet(kitId);
    if (!(await this.getSample(to))) throw new KitError('not-found', 'The replacement sample is not in the library.');
    const instruments = kit.instruments.map((i) => ({ ...i, samples: i.samples.map((s) => (s.sample === from ? { ...s, sample: to } : s)) }));
    return this.saveKit({ ...kit, instruments });
  }

  /** A portable kit file with every sample's audio. KitError('missing-audio') if any is not in this browser. */
  async exportKit(kit: KitData, extra: ArchiveSample[] = []): Promise<{ bytes: Uint8Array; fileName: string }> {
    const data = validateKitData(kit);
    const given = new Map(extra.map((s) => [s.id, s]));
    const samples: ArchiveSample[] = [];
    const missing: string[] = [];
    for (const id of kitSamples(data)) {
      const s = given.get(id) ?? (await this.readSample(id));
      if (s) samples.push(s);
      else missing.push(data.instruments.flatMap((i) => i.samples).find((r) => r.sample === id)?.name ?? id.slice(0, 8));
    }
    if (missing.length) throw new KitError('missing-audio', `The kit cannot be exported: these samples are not in this browser: ${missing.join(', ')}. Import them again (or remove them from the kit) first.`, missing);
    return { bytes: writeKitArchive(data, samples, { app: this.app, core: CORE_VERSION }), fileName: kitFileName(data.name) };
  }

  /**
   * Import a portable kit file. Everything is checked first (the archive, the manifest, every
   * sample's fingerprint, and that every sample decodes); then its samples join the library
   * (those already there are reused) and, with `save` (the default), the kit is saved under a
   * new id (a taken name gets a number). Without `save` the samples are kept but the kit is
   * only returned, for the application to open unsaved. On any failure nothing is kept.
   */
  async importKit(bytes: Uint8Array, opts: { save?: boolean; legacy?: LegacyKitReader } = {}): Promise<KitImport> {
    const r = await readKitArchive(bytes, { legacy: opts.legacy });
    const problems: string[] = [];
    for (const s of r.samples) {
      try {
        const d = await this.decode(s.bytes, s.name);
        this.cache.set(s.id, d);
        s.duration ??= d.duration;
        s.sampleRate ??= d.sampleRate;
        s.channels ??= d.channels.length;
      } catch (e) {
        problems.push(e instanceof SampleError ? e.message : `"${s.name}" could not be decoded.`);
      }
      await yieldToBrowser();
    }
    if (problems.length) throw new KitError('damaged', `The kit contains audio this browser cannot play: ${problems.join(' ')}`, problems);
    const save = opts.save !== false;
    const base = { kit: r.kit, origin: { app: r.generator.app } };
    if (!this.persistent) {
      if (save) this.stores();
      return { kit: { ...r.kit, id: this.newId(), created: this.now(), modified: this.now(), origin: base.origin }, saved: false, renamed: false, added: r.samples.length, ...(r.legacy ? { legacy: r.legacy } : {}) };
    }
    const { audio, store } = this.stores();
    const fresh: string[] = [];
    try {
      const infos: LibrarySample[] = [];
      for (const s of r.samples) {
        if (!(await audio.has(s.id))) {
          await audio.put(s);
          fresh.push(s.id);
        }
        const info = await store.getSample(s.id);
        if (!info) infos.push({ id: s.id, name: s.name, type: s.type, size: s.size, added: this.now(), format: s.format || sniffFormat(s.bytes, s.name), duration: s.duration, sampleRate: s.sampleRate, channels: s.channels });
        else if (info.duration === undefined && s.duration) infos.push({ ...info, duration: s.duration, sampleRate: s.sampleRate, channels: s.channels });
      }
      const now = this.now();
      let kit: Kit = { ...r.kit, id: this.newId(), created: now, modified: now, origin: base.origin };
      let renamed = false;
      if (save) {
        const name = uniqueKitName(r.kit.name, (await store.listKits()).map((k) => k.name));
        renamed = name !== r.kit.name;
        kit = { ...kit, name };
        await store.commit({ putKits: [kit], putSamples: infos });
      } else await store.commit({ putSamples: infos });
      return { kit, saved: save, renamed, added: fresh.length, ...(r.legacy ? { legacy: r.legacy } : {}) };
    } catch (e) {
      for (const id of fresh) await audio.delete(id).catch(() => {});
      throw e;
    }
  }

  // ---------------------------------------------------------------- preferences

  /** The kit to open at startup (null: none chosen). */
  async getDefault(): Promise<string | null> {
    return ((await this.opts.store?.getMeta<string>('default')) ?? null) || null;
  }
  async setDefault(id: string | null): Promise<void> {
    if (id) await this.mustGet(id);
    await this.stores().store.commit({ meta: { default: id ?? undefined } });
  }
  /** The kit last loaded or saved. */
  async getCurrent(): Promise<string | null> {
    return ((await this.opts.store?.getMeta<string>('current')) ?? null) || null;
  }
  async setCurrent(id: string | null): Promise<void> {
    if (!this.opts.store) return;
    await this.opts.store.commit({ meta: { current: id ?? undefined } });
  }
  /** Application values kept with the library (small JSON). */
  async getMeta<T>(key: string): Promise<T | undefined> {
    return this.opts.store?.getMeta<T>(`app:${key}`);
  }
  async setMeta(key: string, value: unknown): Promise<void> {
    await this.stores().store.commit({ meta: { [`app:${key}`]: value } });
  }
}
