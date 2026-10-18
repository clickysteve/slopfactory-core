/**
 * Colour palettes for the Slop Factory's 1-bit interfaces: a purely cosmetic layer that never
 * changes anything musical. Extracted from the first application's palette code (its role list,
 * colour maths, CSS, file format and preferences) and made generic: each application declares
 * its colour ROLES; Core provides everything else, so palettes look, behave, persist and
 * exchange the same way in every application.
 *
 * The interface draws with a handful of CSS custom properties. Every role sets one; a palette
 * gives each role a colour; `paletteCss` turns that into one style sheet. The shared roles
 * (`desktop`, `paper`, `ink`, `dim`, `activity`, `selection`) are common to every application, so
 * the shared presets (presets.ts) and palette files from any application work everywhere. An
 * application's own roles say which shared role they follow (`from`) when a palette leaves them
 * out. AREA roles redefine `--ink` (and the 1-bit fills drawn in it) inside `[data-area="<id>"]`,
 * so a functional area of an application can have its own colour.
 *
 * The first built-in palette is the default: the original black-and-white look, for which
 * inverted controls use `filter: invert()` and marks use difference blending (exact in 1-bit);
 * every other palette swaps ink and paper instead (`--inv-*`), and marks (playheads) use the
 * activity colour (`--mark-color`, `--mark-blend`).
 *
 * Preferences (localStorage, `<app>.palette.custom` and `<app>.palette.selected`) never belong
 * to a musical document. Built-in palettes are never edited: editing one makes a custom copy.
 * Palette files are JSON: `{ "format": "<app>-palette", "version": 1, "name", "colors" }`; a
 * file from another application imports by the role names the two share.
 */
/** A colour role: one CSS custom property. */
export interface PaletteRole {
    id: string;
    label: string;
    /** what it colours (shown in the editor) */
    help: string;
    /** the CSS custom property it sets ('--ink') */
    css: string;
    /** contrast it needs against the paper to stay readable (WCAG ratio); no check if absent */
    contrast?: number;
    /** a role a palette file or preset may leave out: it then takes this role's colour */
    from?: string;
    /** an area role: redefines --ink (and its fills) inside [data-area="<id>"] */
    area?: boolean;
}
export type Colors = Record<string, string>;
export interface Palette {
    id: string;
    name: string;
    builtIn: boolean;
    colors: Colors;
}
export interface PaletteConfig {
    /** the application's short name: storage keys and the file format "<app>-palette" */
    app: string;
    /** the application's roles; must include the shared roles (SHARED_ROLES) */
    roles: PaletteRole[];
    /** built-in palettes; the first is the default */
    builtIns: Palette[];
    /** other applications' palette formats this one imports ("other-palette") */
    accept?: string[];
    /** extra CSS for palettes other than the default (application-specific inversions) */
    extraCss?: (colors: Colors) => string;
}
/** The roles every Slop Factory application has. */
export declare const SHARED_ROLES: PaletteRole[];
/** Lenient hex parsing (#rgb, #rrggbb, with or without #) → '#rrggbb' lowercase, or null. */
export declare function normHex(v: unknown): string | null;
/** WCAG relative luminance. */
export declare function luminance(hex: string): number;
/** WCAG contrast ratio between two colours (1 … 21). */
export declare function contrast(a: string, b: string): number;
export interface ContrastWarning {
    role: string;
    ratio: number;
    against: string;
}
/** Roles that are hard to see against the paper. Never changes any colour. */
export declare function contrastWarnings(config: PaletteConfig, c: Colors): ContrastWarning[];
/** A complete colour set for the config's roles from a partial one: missing roles follow their `from` role, else the default palette. */
export declare function completeColors(config: PaletteConfig, partial: Partial<Colors>): Colors;
/** CSS declarations that swap ink and paper (an inverted control in a non-default palette). */
export declare const SWAP_INK_PAPER: string;
export declare function isDefaultPalette(config: PaletteConfig, c: Colors): boolean;
/** The one style sheet that applies a palette. */
export declare function paletteCss(config: PaletteConfig, colors: Colors): string;
/** Apply a palette to a document (one <style> element; nothing else is touched). */
export declare function applyPalette(config: PaletteConfig, colors: Colors, doc?: Document): void;
export declare const PALETTE_VERSION = 1;
export interface PaletteFile {
    format: string;
    version: number;
    name: string;
    colors: Colors;
}
export declare const paletteFormat: (config: PaletteConfig) => string;
export declare function exportPalette(config: PaletteConfig, p: {
    name: string;
    colors: Colors;
}): string;
export declare class PaletteError extends Error {
}
export interface ImportResult {
    name: string;
    colors: Colors;
    /** roles that were missing or unreadable and were taken from the roles they follow, or the default palette */
    filled: string[];
    /** keys this application does not know (another application's roles), ignored */
    ignored: string[];
}
/** Parse and validate a palette file (this application's, or an accepted one's). Throws PaletteError with a readable message. */
export declare function importPalette(config: PaletteConfig, text: string): ImportResult;
export interface PaletteStore {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
}
/** Palette preferences: the custom palettes and which palette is selected. */
export declare class PaletteLibrary {
    readonly config: PaletteConfig;
    private store;
    custom: Palette[];
    selectedId: string;
    readonly builtIns: Palette[];
    constructor(config: PaletteConfig, store?: PaletteStore | null);
    get defaultId(): string;
    private key;
    load(): void;
    private save;
    private newId;
    all(): Palette[];
    find(id: string): Palette | undefined;
    get selected(): Palette;
    select(id: string): Palette;
    private uniqueName;
    /** A custom copy of any palette, selected. */
    duplicate(id: string, name?: string): Palette;
    /** Change one colour. Built-ins are never modified: editing one makes a custom copy first. */
    setColor(role: string, value: string): Palette;
    rename(id: string, name: string): boolean;
    remove(id: string): boolean;
    /** Add an imported palette as a new custom palette, selected. */
    addImported(r: ImportResult): Palette;
    /** Back to the default palette (the original look). */
    resetToDefault(): Palette;
}
