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
import { KitError, kitName, portable, type Kit, type KitData, type KitInstrument } from './model';
import { mapKit, type KitMapping, type KitTarget } from './roles';

/** The application's side of a session. */
export interface KitHost {
  /** the instruments the application plays (to map kits onto) */
  targets(): KitTarget[];
  /**
   * The application's current sounds as a kit. `base` is the kit last loaded or saved: keep its
   * instruments and data this application does not use, so nothing it carried is lost. `audio`
   * gives bytes the library may not have (sounds made by the application itself).
   */
  capture(base: KitData | null): Promise<{ instruments: KitInstrument[]; ext?: Record<string, unknown>; audio?: ArchiveSample[] }>;
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

export class KitSession {
  /** saved kits, kept up to date for views to read synchronously */
  kits: KitSummary[] = [];
  defaultId: string | null = null;
  /** the saved kit the current sounds came from or were saved as (null: not saved) */
  currentId: string | null = null;
  /** the current kit's name */
  name: string;
  /** the kit last loaded, saved or imported (its data the application does not use is kept) */
  base: KitData | null = null;
  private baseline = '';
  private listeners = new Set<() => void>();
  private untitled: string;

  constructor(readonly library: KitLibrary, private host: KitHost, opts: KitSessionOptions = {}) {
    this.untitled = opts.untitled ?? 'Untitled Kit';
    this.name = this.untitled;
    this.baseline = host.signature();
  }

  /** Changes since the kit was loaded or saved (an imported kit is unsaved until saved). */
  get dirty(): boolean {
    return this.host.signature() !== this.baseline;
  }

  onChange(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  private emit(): void {
    for (const f of this.listeners) f();
  }

  /** Re-read the saved kits and preferences. */
  async refresh(): Promise<void> {
    this.kits = await this.library.listKits();
    this.defaultId = await this.library.getDefault();
    if (this.currentId && !this.kits.some((k) => k.id === this.currentId)) this.currentId = null;
    this.emit();
  }

  /** Mark the current sounds as matching the current kit (after the application restored them itself). */
  markSaved(): void {
    this.baseline = this.host.signature();
    void this.record();
    this.emit();
  }

  /** Remember the current kit and the fingerprint of its sounds (for `resume` after a reload). */
  private async record(): Promise<void> {
    await this.library.setCurrent(this.currentId).catch(() => {});
    if (this.library.persistent) await this.library.setMeta('session', { id: this.currentId, name: this.name, signature: this.baseline }).catch(() => {});
  }

  /**
   * At startup, for applications that keep the current sounds themselves (a project that is
   * autosaved): take the kit last loaded or saved as the current kit **without** applying it.
   * The sounds count as unsaved if they changed since (the fingerprint recorded then differs).
   */
  async resume(): Promise<void> {
    await this.refresh();
    const rec = await this.library.getMeta<{ id: string | null; name: string; signature: string }>('session').catch(() => undefined);
    const kit = rec?.id ? await this.library.getKit(rec.id) : null;
    if (kit) {
      this.currentId = kit.id;
      this.name = kit.name;
      this.base = kit;
    } else if (rec && !rec.id && rec.name) this.name = rec.name;
    this.baseline = rec ? rec.signature : this.host.signature();
    this.emit();
  }

  /**
   * At startup: open the default kit, else the kit last used. Returns a message if that failed
   * (the current sounds are then unchanged), or null.
   */
  async restore(): Promise<string | null> {
    await this.refresh();
    const id = this.defaultId ?? (await this.library.getCurrent());
    if (!id || !this.kits.some((k) => k.id === id)) return null;
    try {
      await this.load(id);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  /** How a saved kit (or kit data) would map onto the application, without loading it. */
  async preview(kit: string | KitData): Promise<{ kit: KitData; mapping: KitMapping; missing: string[] }> {
    const k = typeof kit === 'string' ? await this.library.getKit(kit) : kit;
    if (!k) throw new KitError('not-found', 'That kit no longer exists.');
    return { kit: k, mapping: mapKit(k, this.host.targets()), missing: await this.library.missing(k) };
  }

  /** A new, empty, unsaved kit. */
  async newKit(): Promise<void> {
    await this.host.clear();
    this.currentId = null;
    this.base = null;
    this.name = this.untitled;
    this.baseline = this.host.signature();
    await this.record();
    this.emit();
  }

  private async captureKit(name: string): Promise<{ data: KitData; audio: ArchiveSample[] }> {
    const c = await this.host.capture(this.base);
    const data: KitData = { ...(this.base ? portable(this.base) : {}), name, instruments: c.instruments };
    if (c.ext) data.ext = { ...(this.base?.ext ?? {}), ...c.ext };
    return { data, audio: c.audio ?? [] };
  }

  /**
   * Save the current sounds: over the current saved kit (renaming it if `name` differs), or as
   * a new kit if there is none.
   */
  async save(name = this.name, opts: { replace?: boolean } = {}): Promise<Kit> {
    if (!this.currentId) return this.saveAs(name, opts);
    return this.store(kitName(name), this.currentId, opts.replace);
  }

  /** Save the current sounds as a new kit. KitError('exists') if the name is taken (unless `replace`). */
  async saveAs(name: string, opts: { replace?: boolean } = {}): Promise<Kit> {
    return this.store(kitName(name), undefined, opts.replace);
  }

  private async store(name: string, id: string | undefined, replace?: boolean): Promise<Kit> {
    const signature = this.host.signature();
    const { data, audio } = await this.captureKit(name);
    const kit = await this.library.saveKit({ ...data, id }, { audio, replace });
    this.currentId = kit.id;
    this.name = kit.name;
    this.base = kit;
    this.baseline = signature;
    await this.record();
    await this.refresh();
    return kit;
  }

  /** Load a saved kit (the application plays its mapping). Nothing changes if it fails. */
  async load(id: string): Promise<KitMapping> {
    const kit = await this.library.getKit(id);
    if (!kit) throw new KitError('not-found', 'That kit no longer exists.');
    const mapping = mapKit(kit, this.host.targets());
    await this.host.apply(kit, mapping);
    this.currentId = kit.id;
    this.name = kit.name;
    this.base = kit;
    this.baseline = this.host.signature();
    await this.record();
    await this.refresh();
    return mapping;
  }

  /**
   * Import a kit file. `open` (the default) plays it at once, unsaved (SAVE keeps it); its
   * samples join the library either way. With `save`, it is also saved as a new kit.
   */
  async importFile(bytes: Uint8Array, opts: { open?: boolean; save?: boolean; legacy?: LegacyKitReader } = {}): Promise<KitImport & { mapping?: KitMapping }> {
    const r = await this.library.importKit(bytes, { save: !!opts.save, legacy: opts.legacy });
    let mapping: KitMapping | undefined;
    if (opts.open !== false) {
      mapping = mapKit(r.kit, this.host.targets());
      await this.host.apply(r.kit, mapping);
      this.base = portable(r.kit);
      this.name = r.kit.name;
      this.currentId = r.saved ? r.kit.id : null;
      this.baseline = r.saved ? this.host.signature() : '';
      await this.record();
    }
    await this.refresh();
    return { ...r, mapping };
  }

  /** The current sounds (unsaved changes included) as a portable kit file. */
  async exportCurrent(name = this.name): Promise<{ bytes: Uint8Array; fileName: string }> {
    const { data, audio } = await this.captureKit(kitName(name));
    return this.library.exportKit(data, audio);
  }

  /** A saved kit as a portable kit file. */
  async exportSaved(id: string): Promise<{ bytes: Uint8Array; fileName: string }> {
    const kit = await this.library.getKit(id);
    if (!kit) throw new KitError('not-found', 'That kit no longer exists.');
    return this.library.exportKit(kit);
  }

  async rename(id: string, name: string): Promise<void> {
    const k = await this.library.renameKit(id, name);
    if (id === this.currentId) {
      this.name = k.name;
      if (this.base) this.base = { ...this.base, name: k.name };
      await this.record();
    }
    await this.refresh();
  }

  async duplicate(id: string, name?: string): Promise<Kit> {
    const k = await this.library.duplicateKit(id, name);
    await this.refresh();
    return k;
  }

  /** Delete a saved kit (its samples stay in the library unless `removeUnusedSamples`). The current sounds are kept, now unsaved. */
  async delete(id: string, opts: { removeUnusedSamples?: boolean } = {}): Promise<number> {
    const n = await this.library.deleteKit(id, opts);
    if (id === this.currentId) {
      this.currentId = null;
      this.baseline = '';
      await this.record();
    }
    await this.refresh();
    return n;
  }

  async setDefault(id: string | null): Promise<void> {
    await this.library.setDefault(id);
    await this.refresh();
  }
}
