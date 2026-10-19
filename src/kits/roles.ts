/**
 * Instrument roles and mapping a kit onto an application's instruments.
 *
 * A role says what a sound is (KICK, CLOSED HAT ...), not where an application plays it. Core
 * offers a common drum vocabulary; an application may also use its own roles (`app:role`).
 * Each application declares its **targets**: the instruments it can play (a category, a track,
 * a sound step), each with a role, how many samples it can hold, and which other roles it will
 * take when a kit has none of its own. `mapKit` matches a kit's instruments to targets and
 * reports what could not be placed, so nothing is dropped silently: unplaced instruments and
 * samples stay in the kit (and its samples in the library).
 */
import type { KitData, KitInstrument, KitSampleRef } from './model';

export type RoleFamily = 'kick' | 'snare' | 'tom' | 'hat' | 'cymbal' | 'perc' | 'other';

export interface RoleInfo {
  id: string;
  /** upper-case display label */
  label: string;
  family: RoleFamily;
}

/** The common drum vocabulary. Not exhaustive: applications may add roles of their own. */
export const DRUM_ROLES: readonly RoleInfo[] = [
  { id: 'kick', label: 'KICK', family: 'kick' },
  { id: 'snare', label: 'SNARE', family: 'snare' },
  { id: 'snare-ghost', label: 'GHOST SNARE', family: 'snare' },
  { id: 'rim', label: 'RIM', family: 'snare' },
  { id: 'clap', label: 'CLAP', family: 'perc' },
  { id: 'tom-high', label: 'HIGH TOM', family: 'tom' },
  { id: 'tom-mid', label: 'MID TOM', family: 'tom' },
  { id: 'tom-low', label: 'LOW TOM', family: 'tom' },
  { id: 'hat-closed', label: 'CLOSED HAT', family: 'hat' },
  { id: 'hat-pedal', label: 'PEDAL HAT', family: 'hat' },
  { id: 'hat-open', label: 'OPEN HAT', family: 'hat' },
  { id: 'ride', label: 'RIDE', family: 'cymbal' },
  { id: 'crash', label: 'CRASH', family: 'cymbal' },
  { id: 'cowbell', label: 'COWBELL', family: 'perc' },
  { id: 'shaker', label: 'SHAKER', family: 'perc' },
  { id: 'clave', label: 'CLAVE', family: 'perc' },
  { id: 'conga', label: 'CONGA', family: 'perc' },
  { id: 'perc', label: 'PERCUSSION', family: 'perc' },
  { id: 'fx', label: 'FX', family: 'other' },
  { id: 'unassigned', label: 'UNASSIGNED', family: 'other' },
];

const BY_ID = new Map(DRUM_ROLES.map((r) => [r.id, r]));

/** Information about a role (an application role gets a label from its id). */
export function roleInfo(id: string): RoleInfo {
  return BY_ID.get(id) ?? { id, label: id.replace(/^[^:]*:/, '').replace(/[-_.]+/g, ' ').toUpperCase(), family: 'other' };
}

/** The common roles of a family. */
export const rolesOf = (family: RoleFamily): string[] => DRUM_ROLES.filter((r) => r.family === family).map((r) => r.id);

/** An instrument an application can play, to map kits onto. */
export interface KitTarget {
  /** the application's key for it (a category, a track id ...) */
  id: string;
  role: string;
  /** which of several targets of the same role (default: their order) */
  index?: number;
  label?: string;
  /** how many samples it plays (default 1; Infinity: every sample, as alternates) */
  capacity?: number;
  /** other roles it takes, in order of preference, when the kit has none of its own */
  accepts?: string[];
}

export type MatchKind = 'exact' | 'alternate';

export interface MappedInstrument {
  target: KitTarget;
  instrument: KitInstrument;
  /** the samples the target plays (within its capacity) */
  samples: KitSampleRef[];
  match: MatchKind;
}

export interface UnmappedInstrument {
  instrument: KitInstrument;
  /** the samples not played */
  samples: KitSampleRef[];
  /** 'no-target': this application has nothing to play it on; 'capacity': the target holds fewer samples */
  reason: 'no-target' | 'capacity';
  /** for 'capacity', the target that took the others */
  target?: KitTarget;
}

export interface KitMapping {
  mapped: MappedInstrument[];
  /** instruments and samples that this application will not play (they stay in the kit) */
  unmapped: UnmappedInstrument[];
  /** targets the kit has no sound for */
  empty: KitTarget[];
}

/** The instrument's samples in pick order: the primary sample first, then the kit's order. */
export function pickOrder(ins: KitInstrument): KitSampleRef[] {
  const p = ins.samples.findIndex((s) => s.primary);
  return p <= 0 ? [...ins.samples] : [ins.samples[p], ...ins.samples.slice(0, p), ...ins.samples.slice(p + 1)];
}

function withIndexes<T extends { role: string; index?: number }>(xs: T[]): { x: T; index: number }[] {
  const seen = new Map<string, number>();
  return xs.map((x) => {
    const n = seen.get(x.role) ?? 0;
    seen.set(x.role, n + 1);
    return { x, index: x.index ?? n };
  });
}

/**
 * Map a kit onto targets.
 *
 * 1. Same role: a target with room for one sample takes the instrument of its role with the
 *    same index (the second SNARE target the second SNARE instrument); a target with unlimited
 *    room takes every instrument of its role.
 * 2. Alternates: a target still without a sound takes the first unused instrument of the roles
 *    it accepts, in order; a target with unlimited room takes every unused instrument of them.
 * 3. A target plays at most `capacity` samples of an instrument (primary first); the rest, and
 *    every instrument no target took, are reported in `unmapped`.
 *
 * Instruments without samples are ignored. Deterministic: the same kit and targets always give
 * the same mapping.
 */
export function mapKit(kit: Pick<KitData, 'instruments'>, targets: KitTarget[]): KitMapping {
  const ins = withIndexes(kit.instruments.filter((i) => i.samples.length));
  const tgs = withIndexes(targets);
  const used = new Set<KitInstrument>();
  const taken = new Map<KitTarget, { instrument: KitInstrument; match: MatchKind }[]>();
  const give = (t: KitTarget, i: KitInstrument, match: MatchKind) => {
    used.add(i);
    taken.set(t, [...(taken.get(t) ?? []), { instrument: i, match }]);
  };
  const unlimited = (t: KitTarget) => (t.capacity ?? 1) === Infinity;

  for (const { x: t, index } of tgs) {
    const same = ins.filter((i) => i.x.role === t.role && !used.has(i.x));
    if (unlimited(t)) for (const i of same) give(t, i.x, 'exact');
    else {
      const hit = same.find((i) => i.index === index);
      if (hit) give(t, hit.x, 'exact');
    }
  }
  for (const { x: t } of tgs) {
    if (!unlimited(t) && taken.has(t)) continue;
    for (const role of t.accepts ?? []) {
      const alt = ins.filter((i) => i.x.role === role && !used.has(i.x));
      if (!alt.length) continue;
      if (unlimited(t)) for (const i of alt) give(t, i.x, 'alternate');
      else {
        give(t, alt[0].x, 'alternate');
        break;
      }
    }
  }

  const mapped: MappedInstrument[] = [];
  const unmapped: UnmappedInstrument[] = [];
  for (const { x: t } of tgs) {
    for (const { instrument, match } of taken.get(t) ?? []) {
      const order = pickOrder(instrument);
      const cap = Math.max(0, t.capacity ?? 1);
      mapped.push({ target: t, instrument, samples: order.slice(0, cap), match });
      if (order.length > cap) unmapped.push({ instrument, samples: order.slice(cap), reason: 'capacity', target: t });
    }
  }
  for (const { x: i } of ins) if (!used.has(i)) unmapped.push({ instrument: i, samples: [...i.samples], reason: 'no-target' });
  return { mapped, unmapped, empty: targets.filter((t) => !taken.has(t)) };
}

/** A short, human-readable account of a mapping (plain text, one line per item). */
export function describeMapping(m: KitMapping, opts: { sampleName?: (ref: KitSampleRef) => string } = {}): string[] {
  const name = (r: KitSampleRef) => opts.sampleName?.(r) ?? r.name ?? r.sample.slice(0, 8);
  const label = (i: KitInstrument) => i.label ?? roleInfo(i.role).label;
  const lines: string[] = [];
  for (const x of m.mapped) lines.push(`${x.target.label ?? x.target.id} ← ${label(x.instrument)}${x.match === 'alternate' ? ' (closest match)' : ''}: ${x.samples.map(name).join(', ')}`);
  for (const u of m.unmapped) {
    const n = u.samples.length;
    lines.push(u.reason === 'capacity' ? `${label(u.instrument)}: ${n} more sample${n === 1 ? '' : 's'} kept in the kit (${u.target?.label ?? u.target?.id} plays one)` : `${label(u.instrument)}: not played here; ${n} sample${n === 1 ? '' : 's'} kept in the kit and the library`);
  }
  return lines;
}
