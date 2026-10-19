/**
 * Portable kits: one ZIP that holds a kit and the original bytes of every sample it uses, so a
 * kit moves between browsers and between applications with its audio. Nothing in it depends on
 * the browser storage it came from.
 *
 *   manifest.json            { format: 'slopfactory-kit', version: 1, generator, kit, samples }
 *   samples/01-kick.wav      original sample bytes, named for people (the manifest is the index)
 *
 * Archives are untrusted input: their size, number of files, expansion, paths, manifest and
 * every sample's fingerprint are checked before anything is used. Nothing in an archive is
 * executed or rendered as HTML.
 */
import { createZip, readZip, ZipLimitError, type ZipEntry } from '../export/zip';
import { slug } from '../export/names';
import { readBundle, BUNDLE_FORMAT, type BundleContents } from '../storage/bundle';
import { sha256Hex, type StoredSample } from '../storage/samples';
import { cleanText, KitError, kitSamples, validateKitData, type KitData } from './model';
import { formatExtension, formatMime, SAMPLE_ID, sniffFormat, type LibrarySample } from './sampleInfo';

export const KIT_FORMAT = 'slopfactory-kit';
export const KIT_VERSION = 1;
/** The file extension of portable kits (a plain ZIP: any unzip tool can open it). */
export const KIT_EXTENSION = '.kit.zip';
/** What a file chooser should accept for portable kits (applications add their legacy extensions). */
export const KIT_ACCEPT = '.zip,application/zip';

export interface KitArchiveLimits {
  /** largest archive file */
  maxArchiveBytes: number;
  /** most files inside */
  maxEntries: number;
  /** largest single file inside */
  maxEntryBytes: number;
  /** most bytes after expansion */
  maxTotalBytes: number;
  /** largest manifest */
  maxManifestBytes: number;
}

export const KIT_LIMITS: KitArchiveLimits = {
  maxArchiveBytes: 512 * 1024 * 1024,
  maxEntries: 2048,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalBytes: 768 * 1024 * 1024,
  maxManifestBytes: 4 * 1024 * 1024,
};

export interface ManifestSample {
  id: string;
  /** path inside the archive */
  file: string;
  /** original file name */
  name: string;
  type: string;
  size: number;
  format: string;
  duration?: number;
  sampleRate?: number;
  channels?: number;
}

export interface KitManifest {
  format: typeof KIT_FORMAT;
  version: number;
  /** the application (and Core version) that wrote it */
  generator: { app: string; core?: string };
  kit: KitData;
  samples: ManifestSample[];
}

/** A sample with its library information and bytes. */
export type ArchiveSample = StoredSample & Partial<Pick<LibrarySample, 'format' | 'duration' | 'sampleRate' | 'channels'>>;

export interface ReadKit {
  kit: KitData;
  samples: ArchiveSample[];
  generator: { app: string; core?: string };
  /** the archive was a legacy format, converted (its name) */
  legacy?: string;
}

/** Convert a legacy archive (a Core project bundle) to a kit, or null if it is not one. */
export type LegacyKitReader = (bundle: BundleContents) => Promise<{ kit: KitData; samples: StoredSample[] } | null> | { kit: KitData; samples: StoredSample[] } | null;

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** Write a portable kit. Every sample the kit uses must be given (KitError('missing-audio') otherwise). */
export function writeKitArchive(kit: KitData, samples: ArchiveSample[], generator: { app: string; core?: string }): Uint8Array {
  const data = validateKitData(kit);
  const byId = new Map(samples.map((s) => [s.id, s]));
  const ids = kitSamples(data);
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new KitError('missing-audio', `The kit cannot be exported: ${missing.length} sample${missing.length === 1 ? ' is' : 's are'} not in this browser.`, missing);
  const w = Math.max(2, String(ids.length).length);
  const list: ManifestSample[] = ids.map((id, n) => {
    const s = byId.get(id)!;
    const format = s.format || sniffFormat(s.bytes, s.name);
    const stem = slug(s.name.replace(/\.[A-Za-z0-9]{1,5}$/, ''), 40) || 'sample';
    const m: ManifestSample = { id, file: `samples/${pad(n + 1, w)}-${stem}.${formatExtension(format)}`, name: cleanText(s.name) || `sample ${n + 1}`, type: s.type || formatMime(format), size: s.bytes.byteLength, format };
    if (s.duration) m.duration = s.duration;
    if (s.sampleRate) m.sampleRate = s.sampleRate;
    if (s.channels) m.channels = s.channels;
    return m;
  });
  const manifest: KitManifest = { format: KIT_FORMAT, version: KIT_VERSION, generator, kit: data, samples: list };
  const entries: ZipEntry[] = [{ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 1)) }];
  for (const m of list) entries.push({ name: m.file, data: new Uint8Array(byId.get(m.id)!.bytes) });
  return createZip(entries);
}

/** A path inside an archive that names a file and cannot escape it. */
export function safeArchivePath(p: unknown): p is string {
  return (
    typeof p === 'string' &&
    p.length > 0 &&
    p.length <= 240 &&
    !p.startsWith('/') &&
    !p.includes('\\') &&
    !p.includes('\0') &&
    !/^[a-z]:/i.test(p) &&
    p.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : undefined);

/**
 * Read a portable kit (or, with `legacy`, an older format). Strict: the whole archive is checked
 * and every sample the kit uses must be present and intact, or it throws KitError with the
 * problems in `details`. Nothing is stored; the caller decides what to keep.
 */
export async function readKitArchive(bytes: Uint8Array, opts: { limits?: Partial<KitArchiveLimits>; legacy?: LegacyKitReader } = {}): Promise<ReadKit> {
  const lim = { ...KIT_LIMITS, ...opts.limits };
  if (bytes.byteLength > lim.maxArchiveBytes) throw new KitError('too-large', `The kit file is larger than ${Math.round(lim.maxArchiveBytes / 1048576)} MB.`);
  let files: ZipEntry[];
  try {
    files = await readZip(bytes, { maxEntries: lim.maxEntries, maxEntryBytes: lim.maxEntryBytes, maxTotalBytes: lim.maxTotalBytes });
  } catch (e) {
    if (e instanceof ZipLimitError) throw new KitError('too-large', `The kit file is too large or has too many files (${e.message}).`);
    throw new KitError('not-a-kit', `This is not a readable kit file (${(e as Error).message}).`);
  }
  const byName = new Map<string, Uint8Array>();
  for (const f of files) {
    if (!safeArchivePath(f.name)) throw new KitError('damaged', `The kit file contains an unsafe path ("${cleanText(f.name, 80)}").`);
    byName.set(f.name, f.data);
  }
  const mf = byName.get('manifest.json');
  if (!mf) throw new KitError('not-a-kit', 'This ZIP is not a kit (no manifest.json).');
  if (mf.length > lim.maxManifestBytes) throw new KitError('too-large', 'The kit manifest is too large.');
  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder().decode(mf));
  } catch {
    throw new KitError('damaged', 'The kit manifest is damaged (not JSON).');
  }
  if (!isObj(manifest)) throw new KitError('damaged', 'The kit manifest is damaged.');

  if (manifest.format === BUNDLE_FORMAT && opts.legacy) {
    let bundle: BundleContents;
    try {
      bundle = await readBundle(bytes, String(manifest.app));
    } catch (e) {
      throw new KitError('damaged', (e as Error).message);
    }
    if (bundle.problems.length) throw new KitError('missing-audio', `The kit file is incomplete: ${bundle.problems.join(' ')}`, bundle.problems);
    const r = await opts.legacy(bundle);
    if (!r) throw new KitError('not-a-kit', 'This file is a project bundle, not a kit.');
    const kit = validateKitData(r.kit);
    const have = new Set(r.samples.map((s) => s.id));
    const missing = kitSamples(kit).filter((id) => !have.has(id));
    if (missing.length) throw new KitError('missing-audio', 'The kit file is missing audio for some samples.', missing);
    return { kit, samples: r.samples, generator: { app: cleanText(manifest.app, 64) }, legacy: cleanText(manifest.app, 64) };
  }

  if (manifest.format !== KIT_FORMAT) throw new KitError('not-a-kit', 'This ZIP is not a kit.');
  if (!(typeof manifest.version === 'number' && manifest.version >= 1)) throw new KitError('damaged', 'The kit manifest has no format version.');
  if (manifest.version > KIT_VERSION) throw new KitError('version', `This kit was written by a newer version (kit format ${manifest.version}; this application reads up to ${KIT_VERSION}). Update the application to open it.`);
  const kit = validateKitData(manifest.kit);
  const gen = isObj(manifest.generator) ? manifest.generator : {};
  const generator = { app: cleanText(gen.app, 64) || 'unknown', ...(cleanText(gen.core, 32) ? { core: cleanText(gen.core, 32) } : {}) };
  if (!Array.isArray(manifest.samples) || manifest.samples.length > lim.maxEntries) throw new KitError('damaged', 'The kit manifest has no valid sample list.');

  const problems: string[] = [];
  const samples: ArchiveSample[] = [];
  const seen = new Set<string>();
  for (const m of manifest.samples as unknown[]) {
    if (!isObj(m) || typeof m.id !== 'string' || !SAMPLE_ID.test(m.id) || !safeArchivePath(m.file) || !m.file.startsWith('samples/')) {
      problems.push('A sample entry in the manifest is invalid.');
      continue;
    }
    if (seen.has(m.id)) continue;
    const name = cleanText(m.name) || m.file.split('/').pop()!;
    const data = byName.get(m.file);
    if (!data) {
      problems.push(`Sample "${name}" is missing from the kit file.`);
      continue;
    }
    if ((await sha256Hex(data)) !== m.id) {
      problems.push(`Sample "${name}" is damaged (its contents do not match its fingerprint).`);
      continue;
    }
    seen.add(m.id);
    const format = sniffFormat(data, name) || cleanText(m.format, 8);
    const s: ArchiveSample = { id: m.id, name, type: cleanText(m.type, 64), size: data.length, added: Date.now(), bytes: data.slice().buffer, format };
    const duration = num(m.duration, 36000);
    const sampleRate = num(m.sampleRate, 768000);
    const channels = num(m.channels, 64);
    if (duration) s.duration = duration;
    if (sampleRate) s.sampleRate = sampleRate;
    if (channels) s.channels = Math.round(channels);
    samples.push(s);
  }
  const missing = kitSamples(kit).filter((id) => !seen.has(id));
  if (missing.length && !problems.length) problems.push(`${missing.length} sample${missing.length === 1 ? ' the kit uses is' : 's the kit uses are'} not in the kit file.`);
  if (problems.length) throw new KitError('missing-audio', `The kit file is incomplete or damaged: ${problems.join(' ')}`, problems);
  return { kit, samples, generator };
}

/** A file name for an exported kit: "<name>.kit.zip", safe on every system. */
export function kitFileName(name: string): string {
  return (name.replace(/[^\w .()-]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 64) || 'kit') + KIT_EXTENSION;
}
