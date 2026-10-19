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
    origin?: {
        app?: string;
        bundled?: string;
    };
}
export type KitErrorCode = 'invalid' | 'not-a-kit' | 'version' | 'too-large' | 'missing-audio' | 'damaged' | 'name' | 'exists' | 'not-found' | 'in-use' | 'unavailable';
/** A kit operation failed; `message` is meant for the user. Nothing was changed. */
export declare class KitError extends Error {
    readonly code: KitErrorCode;
    readonly details: string[];
    constructor(code: KitErrorCode, message: string, details?: string[]);
}
export declare const MAX_KIT_NAME = 64;
export declare const MAX_INSTRUMENTS = 512;
export declare const MAX_SAMPLES_PER_INSTRUMENT = 256;
/** most sample references in one kit (all instruments) */
export declare const MAX_KIT_REFS = 2000;
/** A kit name, trimmed: 1-64 characters, no control characters. Throws KitError('name'). */
export declare function kitName(value: unknown): string;
/** Display text from untrusted input: control characters removed, length capped. Never HTML. */
export declare function cleanText(value: unknown, max?: number): string;
/** `name` or, if taken (case-insensitively), "name 2", "name 3" ... within 64 characters. */
export declare function uniqueKitName(name: string, taken: Iterable<string>): string;
/** "Name Copy" (within 64 characters), the default name of a duplicate. */
export declare const copyName: (name: string) => string;
/**
 * Check and normalise untrusted kit data (from a file or storage): every field is validated,
 * text is cleaned, unknown top-level fields are dropped, application data (`ext`) is kept.
 * Throws KitError('invalid' | 'too-large' | 'name').
 */
export declare function validateKitData(v: unknown): KitData;
/** Validate a stored kit (KitData plus id and dates). */
export declare function validateKit(v: unknown): Kit;
/** Every sample a kit refers to, each once, in order of first use. */
export declare function kitSamples(kit: Pick<KitData, 'instruments'>): string[];
/** The kit's data that an application may change, with application data (ext) of others kept. */
export declare function portable(kit: KitData): KitData;
