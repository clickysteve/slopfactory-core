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
export declare const DRUM_ROLES: readonly RoleInfo[];
/** Information about a role (an application role gets a label from its id). */
export declare function roleInfo(id: string): RoleInfo;
/** The common roles of a family. */
export declare const rolesOf: (family: RoleFamily) => string[];
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
export declare function pickOrder(ins: KitInstrument): KitSampleRef[];
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
export declare function mapKit(kit: Pick<KitData, 'instruments'>, targets: KitTarget[]): KitMapping;
/** A short, human-readable account of a mapping (plain text, one line per item). */
export declare function describeMapping(m: KitMapping, opts?: {
    sampleName?: (ref: KitSampleRef) => string;
}): string[];
