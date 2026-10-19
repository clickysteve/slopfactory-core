/**
 * Bundled kits: portable kit files that an application ships (for example a default kit
 * recorded by a real drummer), installed into the library on first launch.
 *
 * - Core distributes no audio: the application serves the kit file (a static asset) and gives
 *   a function that fetches it. Nothing is fetched once the kit is installed.
 * - A bundled kit is installed once per `id` and `version`: deleting or renaming it is the
 *   user's choice and is respected. A new `version` installs alongside, never over, the old
 *   one (and never over a kit of the user's: a taken name gets a number).
 * - It becomes the default kit only if the user has none.
 */
import type { KitLibrary } from './library';

export interface BundledKit {
  /** stable id ('keith-acoustic') */
  id: string;
  /** bump to install a new edition */
  version: number;
  /** the portable kit file's bytes (fetch the application's asset) */
  load: () => Promise<Uint8Array>;
  /** make it the startup kit if none is set (default true) */
  makeDefault?: boolean;
}

export interface BundledResult {
  id: string;
  status: 'installed' | 'present' | 'failed' | 'unavailable';
  kitId?: string;
  error?: string;
}

/** Install the bundled kits not installed yet (in order). Failures are returned, not thrown. */
export async function installBundledKits(library: KitLibrary, kits: BundledKit[]): Promise<BundledResult[]> {
  const out: BundledResult[] = [];
  for (const b of kits) {
    if (!library.persistent) {
      out.push({ id: b.id, status: 'unavailable' });
      continue;
    }
    const key = `bundled:${b.id}`;
    try {
      const done = await library.getMeta<{ version: number; kitId: string }>(key);
      if (done && done.version >= b.version) {
        out.push({ id: b.id, status: 'present', kitId: done.kitId });
        continue;
      }
      const r = await library.importKit(await b.load(), { save: true });
      // mark it as bundled (the import recorded which application wrote it)
      const kit = await library.saveKit({ ...r.kit, origin: { ...r.kit.origin, bundled: b.id } });
      await library.setMeta(key, { version: b.version, kitId: kit.id });
      if (b.makeDefault !== false && !(await library.getDefault())) await library.setDefault(kit.id);
      out.push({ id: b.id, status: 'installed', kitId: kit.id });
    } catch (e) {
      out.push({ id: b.id, status: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
