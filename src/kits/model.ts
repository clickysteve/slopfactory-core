/**
 * Kits: named sets of samples assigned to instrument roles. A kit says which sounds play which
 * drum, never what is played: tracks, patterns, sequencing, mixing and MIDI belong to the
 * application. Kits refer to samples by content (the SHA-256 of the original file bytes), so the
 * same sample in several kits is stored once and a kit can be copied or renamed without copying
 * audio.
 *
 * The model is plain JSON. Applications may keep their own data on a kit, an instrument or a
 * sample reference under `ext[<application id>]`; other applications keep it untouched, so a kit
 * that passes through an application that does not read it loses nothing.
 */
import { SAMPLE_ID } from './sampleInfo';

/** One sample of an instrument. */
export interface KitSampleRef {
  /** sample id: SHA-256 of the original file bytes, lower-case hex */
  sample: string;
  /** the name this kit gives the sample (default: the sample's own name) */
  name?: string;
  /** the instrument's main sample (for example a FIXED pick) */
  primary?: boolean;
  /** relative weight for weighted selection (0 = never) */
  weight?: number;
  /** reserved for velocity layers: the MIDI velocities it plays, inclusive */
  velocity?: [number, number];
  /** reserved for articulations ('rimshot', 'flam', 'edge' ...) */
  articulation?: string;
  ext?: Record<string, unknown>;
}

/** Reserved for choke groups: a closed hat that cuts an open hat. */
export interface KitChoke {
  group: string;
  /** it cuts the group's sounding notes (default true) */
  cuts?: boolean;
  /** it is cut by the group (default true) */
  cutBy?: boolean;
}

/** One instrument of a kit: a role (KICK, SNARE ...) and its samples. */
export interface KitInstrument {
  /** a role id: one of DRUM_ROLES, or an application's own (`app:role`) */
  role: string;
  /** which of several instruments of the same role (0 = the first); default: order in the kit */
  index?: number;
  /** a label from the application that wrote it ("CL HAT 2"), for display */
  label?: string;
  /**
   * The samples. Several samples are alternates: how one is chosen is `selection`. Order is
   * significant (round robin, the first is the default pick).
   */
  samples: KitSampleRef[];
  /** how a sample is chosen among several (an open vocabulary: 'auto', 'fixed', 'random', 'roundrobin', 'weighted', 'velocity' ...) */
  selection?: string;
  choke?: KitChoke;
  ext?: Record<string, unknown>;
}

/** The portable part of a kit: what an exported file carries. */
export interface KitData {
  name: string;
  description?: string;
  instruments: KitInstrument[];
  ext?: Record<string, unknown>;
}

/** A kit in an application's library. */
export interface Kit extends KitData {
  /** local id (not portable: a kit imported twice gets two ids) */
  id: string;
  /** ms since 1970 */
  created: number;
  modified: number;
  /** where it came from: the application that exported it, or a bundled kit's id */
  origin?: { app?: string; bundled?: string };
}

export type KitErrorCode = 'invalid' | 'not-a-kit' | 'version' | 'too-large' | 'missing-audio' | 'damaged' | 'name' | 'exists' | 'not-found' | 'in-use' | 'unavailable';

/** A kit operation failed; `message` is meant for the user. Nothing was changed. */
export class KitError extends Error {
  constructor(readonly code: KitErrorCode, message: string, readonly details: string[] = []) {
    super(message);
    this.name = 'KitError';
  }
}

export const MAX_KIT_NAME = 64;
export const MAX_INSTRUMENTS = 512;
export const MAX_SAMPLES_PER_INSTRUMENT = 256;
/** most sample references in one kit (all instruments) */
export const MAX_KIT_REFS = 2000;
const MAX_TEXT = 255;
const MAX_DESCRIPTION = 2000;
const MAX_EXT_CHARS = 256 * 1024;
const ROLE_ID = /^[a-z0-9][a-z0-9:._-]{0,63}$/;
const CONTROL = /[\u0000-\u001f\u007f]/g;
const HAS_CONTROL = /[\u0000-\u001f\u007f]/;

/** A kit name, trimmed: 1-64 characters, no control characters. Throws KitError('name'). */
export function kitName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > MAX_KIT_NAME || HAS_CONTROL.test(name)) throw new KitError('name', `Use a kit name of 1-${MAX_KIT_NAME} characters without control characters.`);
  return name;
}

/** Display text from untrusted input: control characters removed, length capped. Never HTML. */
export function cleanText(value: unknown, max = MAX_TEXT): string {
  return typeof value === 'string' ? value.replace(CONTROL, ' ').trim().slice(0, max) : '';
}

/** `name` or, if taken (case-insensitively), "name 2", "name 3" ... within 64 characters. */
export function uniqueKitName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.toLocaleLowerCase()));
  if (!used.has(name.toLocaleLowerCase())) return name;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = name.slice(0, MAX_KIT_NAME - suffix.length).trimEnd() + suffix;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

/** "Name Copy" (within 64 characters), the default name of a duplicate. */
export const copyName = (name: string): string => name.slice(0, MAX_KIT_NAME - 5).trimEnd() + ' Copy';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

function ext(v: unknown, where: string): Record<string, unknown> | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) throw new KitError('invalid', `${where}: application data must be an object.`);
  if (JSON.stringify(v).length > MAX_EXT_CHARS) throw new KitError('too-large', `${where}: application data is too large.`);
  return JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
}

function sampleRef(v: unknown, where: string): KitSampleRef {
  if (!isObj(v) || typeof v.sample !== 'string' || !SAMPLE_ID.test(v.sample)) throw new KitError('invalid', `${where}: a sample reference is not a sample id.`);
  const r: KitSampleRef = { sample: v.sample };
  const name = cleanText(v.name);
  if (name) r.name = name;
  if (v.primary === true) r.primary = true;
  if (v.weight !== undefined) {
    if (typeof v.weight !== 'number' || !Number.isFinite(v.weight) || v.weight < 0 || v.weight > 1000) throw new KitError('invalid', `${where}: a sample weight is not a number from 0 to 1000.`);
    r.weight = v.weight;
  }
  if (v.velocity !== undefined) {
    const vel = v.velocity;
    if (!Array.isArray(vel) || vel.length !== 2 || !vel.every((x) => Number.isInteger(x) && x >= 0 && x <= 127) || vel[0] > vel[1]) throw new KitError('invalid', `${where}: a velocity range is not [low, high] in 0-127.`);
    r.velocity = [vel[0], vel[1]];
  }
  const art = cleanText(v.articulation, 64);
  if (art) r.articulation = art;
  const e = ext(v.ext, where);
  if (e) r.ext = e;
  return r;
}

function instrument(v: unknown, n: number): KitInstrument {
  const where = `Instrument ${n + 1}`;
  if (!isObj(v)) throw new KitError('invalid', `${where} is not an object.`);
  if (typeof v.role !== 'string' || !ROLE_ID.test(v.role)) throw new KitError('invalid', `${where} has no valid role.`);
  if (!Array.isArray(v.samples) || v.samples.length > MAX_SAMPLES_PER_INSTRUMENT) throw new KitError('invalid', `${where} has no valid sample list.`);
  const ins: KitInstrument = { role: v.role, samples: v.samples.map((s) => sampleRef(s, where)) };
  if (v.index !== undefined) {
    if (!Number.isInteger(v.index) || (v.index as number) < 0 || (v.index as number) > 255) throw new KitError('invalid', `${where} has an invalid index.`);
    ins.index = v.index as number;
  }
  const label = cleanText(v.label, 64);
  if (label) ins.label = label;
  const sel = cleanText(v.selection, 32);
  if (sel) ins.selection = sel;
  if (v.choke !== undefined) {
    const c = v.choke;
    if (!isObj(c) || typeof c.group !== 'string' || !c.group || c.group.length > 64) throw new KitError('invalid', `${where} has an invalid choke group.`);
    ins.choke = { group: cleanText(c.group, 64), ...(typeof c.cuts === 'boolean' ? { cuts: c.cuts } : {}), ...(typeof c.cutBy === 'boolean' ? { cutBy: c.cutBy } : {}) };
  }
  const e = ext(v.ext, where);
  if (e) ins.ext = e;
  return ins;
}

/**
 * Check and normalise untrusted kit data (from a file or storage): every field is validated,
 * text is cleaned, unknown top-level fields are dropped, application data (`ext`) is kept.
 * Throws KitError('invalid' | 'too-large' | 'name').
 */
export function validateKitData(v: unknown): KitData {
  if (!isObj(v)) throw new KitError('invalid', 'The kit is not an object.');
  const name = kitName(v.name);
  if (!Array.isArray(v.instruments)) throw new KitError('invalid', 'The kit has no instrument list.');
  if (v.instruments.length > MAX_INSTRUMENTS) throw new KitError('too-large', `The kit has more than ${MAX_INSTRUMENTS} instruments.`);
  const instruments = v.instruments.map(instrument);
  const refs = instruments.reduce((a, i) => a + i.samples.length, 0);
  if (refs > MAX_KIT_REFS) throw new KitError('too-large', `The kit has more than ${MAX_KIT_REFS} sample assignments.`);
  const kit: KitData = { name, instruments };
  const description = cleanText(v.description, MAX_DESCRIPTION);
  if (description) kit.description = description;
  const e = ext(v.ext, 'The kit');
  if (e) kit.ext = e;
  return kit;
}

/** Validate a stored kit (KitData plus id and dates). */
export function validateKit(v: unknown): Kit {
  const data = validateKitData(v);
  const o = v as Obj;
  if (typeof o.id !== 'string' || !o.id || o.id.length > 128) throw new KitError('invalid', 'The kit has no id.');
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const kit: Kit = { ...data, id: o.id, created: num(o.created), modified: num(o.modified) };
  if (isObj(o.origin)) {
    const app = cleanText(o.origin.app, 64);
    const bundled = cleanText(o.origin.bundled, 64);
    if (app || bundled) kit.origin = { ...(app ? { app } : {}), ...(bundled ? { bundled } : {}) };
  }
  return kit;
}

/** Every sample a kit refers to, each once, in order of first use. */
export function kitSamples(kit: Pick<KitData, 'instruments'>): string[] {
  const ids = new Set<string>();
  for (const i of kit.instruments) for (const s of i.samples) ids.add(s.sample);
  return [...ids];
}

/** The kit's data that an application may change, with application data (ext) of others kept. */
export function portable(kit: KitData): KitData {
  const out: KitData = { name: kit.name, instruments: kit.instruments };
  if (kit.description) out.description = kit.description;
  if (kit.ext) out.ext = kit.ext;
  return JSON.parse(JSON.stringify(out)) as KitData;
}
