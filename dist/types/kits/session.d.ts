/**
 * The current kit: the kit-management workflow every application shares (NEW, SAVE, SAVE AS,
 * LOAD, RENAME, DUPLICATE, DELETE, IMPORT, EXPORT, SET DEFAULT), with UNSAVED tracking. The
 * application supplies a host that turns its own state into a kit and back; the session never
 * touches tracks, patterns, sequencing or MIDI.
 *
 * Views (each application's own) call these methods and ask the user before anything is lost:
 * `dirty` says when NEW, LOAD or IMPORT would discard changes; a KitError('exists') from SAVE AS
 * means a kit of that name would be replaced (`{ replace: true }` after the user agrees).
 */
import type { ArchiveSample, LegacyKitReader } from './archive';
import type { KitImport, KitLibrary, KitSummary } from './library';
import { type Kit, type KitData, type KitInstrument } from './model';
import { type KitMapping, type KitTarget } from './roles';
/** The application's side of a session. */
export interface KitHost {
    /** the instruments the application plays (to map kits onto) */
    targets(): KitTarget[];
    /**
     * The application's current sounds as a kit. `base` is the kit last loaded or saved: keep its
     * instruments and data this application does not use, so nothing it carried is lost. `audio`
     * gives bytes the library may not have (sounds made by the application itself).
     */
    capture(base: KitData | null): Promise<{
        instruments: KitInstrument[];
        ext?: Record<string, unknown>;
        audio?: ArchiveSample[];
    }>;
    /**
     * Play this kit. Prepare everything first (decode with `library.decoded`) and throw if
     * anything fails, leaving the current sounds unchanged.
     */
    apply(kit: KitData, mapping: KitMapping): Promise<void>;
    /** start an empty kit */
    clear(): void | Promise<void>;
    /** a cheap fingerprint of the current sounds (what a kit holds), for UNSAVED */
    signature(): string;
}
export interface KitSessionOptions {
    /** the name of a new kit (default "Untitled Kit") */
    untitled?: string;
}
export declare class KitSession {
    readonly library: KitLibrary;
    private host;
    /** saved kits, kept up to date for views to read synchronously */
    kits: KitSummary[];
    defaultId: string | null;
    /** the saved kit the current sounds came from or were saved as (null: not saved) */
    currentId: string | null;
    /** the current kit's name */
    name: string;
    /** the kit last loaded, saved or imported (its data the application does not use is kept) */
    base: KitData | null;
    private baseline;
    private listeners;
    private untitled;
    constructor(library: KitLibrary, host: KitHost, opts?: KitSessionOptions);
    /** Changes since the kit was loaded or saved (an imported kit is unsaved until saved). */
    get dirty(): boolean;
    onChange(f: () => void): () => void;
    private emit;
    /** Re-read the saved kits and preferences. */
    refresh(): Promise<void>;
    /** Mark the current sounds as matching the current kit (after the application restored them itself). */
    markSaved(): void;
    /** Remember the current kit and the fingerprint of its sounds (for `resume` after a reload). */
    private record;
    /**
     * At startup, for applications that keep the current sounds themselves (a project that is
     * autosaved): take the kit last loaded or saved as the current kit **without** applying it.
     * The sounds count as unsaved if they changed since (the fingerprint recorded then differs).
     */
    resume(): Promise<void>;
    /**
     * At startup: open the default kit, else the kit last used. Returns a message if that failed
     * (the current sounds are then unchanged), or null.
     */
    restore(): Promise<string | null>;
    /** How a saved kit (or kit data) would map onto the application, without loading it. */
    preview(kit: string | KitData): Promise<{
        kit: KitData;
        mapping: KitMapping;
        missing: string[];
    }>;
    /** A new, empty, unsaved kit. */
    newKit(): Promise<void>;
    private captureKit;
    /**
     * Save the current sounds: over the current saved kit (renaming it if `name` differs), or as
     * a new kit if there is none.
     */
    save(name?: string, opts?: {
        replace?: boolean;
    }): Promise<Kit>;
    /** Save the current sounds as a new kit. KitError('exists') if the name is taken (unless `replace`). */
    saveAs(name: string, opts?: {
        replace?: boolean;
    }): Promise<Kit>;
    private store;
    /** Load a saved kit (the application plays its mapping). Nothing changes if it fails. */
    load(id: string): Promise<KitMapping>;
    /**
     * Import a kit file. `open` (the default) plays it at once, unsaved (SAVE keeps it); its
     * samples join the library either way. With `save`, it is also saved as a new kit.
     */
    importFile(bytes: Uint8Array, opts?: {
        open?: boolean;
        save?: boolean;
        legacy?: LegacyKitReader;
    }): Promise<KitImport & {
        mapping?: KitMapping;
    }>;
    /** The current sounds (unsaved changes included) as a portable kit file. */
    exportCurrent(name?: string): Promise<{
        bytes: Uint8Array;
        fileName: string;
    }>;
    /** A saved kit as a portable kit file. */
    exportSaved(id: string): Promise<{
        bytes: Uint8Array;
        fileName: string;
    }>;
    rename(id: string, name: string): Promise<void>;
    duplicate(id: string, name?: string): Promise<Kit>;
    /** Delete a saved kit (its samples stay in the library unless `removeUnusedSamples`). The current sounds are kept, now unsaved. */
    delete(id: string, opts?: {
        removeUnusedSamples?: boolean;
    }): Promise<number>;
    setDefault(id: string | null): Promise<void>;
}
