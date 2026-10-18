/**
 * The palette editor: choose, edit, save and exchange colour palettes. The same controls in
 * every Slop Factory application: the list of palettes (built-in and yours), the name, Duplicate,
 * Delete (press twice), Import…, Export…, Back to the default, and one row per colour role with a
 * swatch (the browser's colour picker), a hex field and a low-contrast warning.
 *
 * Mounted into an element the application provides (the body of one of its windows) and drawn
 * with the shared class names of the Slop Factory style sheets (`label`, `box`, `mtext`,
 * `mbutton`, `inv`), in fixed logical pixels like the rest of the 1-bit screen. Purely cosmetic:
 * nothing here touches the music. Keys typed in it never reach the application's shortcuts.
 */
import { applyPalette, contrastWarnings, exportPalette, importPalette, normHex, PaletteError, paletteFormat, type Colors, type PaletteLibrary } from './model';

export interface PaletteEditorOptions {
  /** restyle the page (default: apply the palette to this document) */
  apply?: (colors: Colors) => void;
  /** save a palette file (default: a download) */
  save?: (fileName: string, text: string) => void;
  /** choose a palette file (default: the browser's file chooser) */
  open?: (accept: string) => Promise<File | null>;
  /** after any change of palette (selection, colour, import, delete) */
  onChange?: () => void;
}

export interface PaletteEditor {
  /** redraw from the library (after it changed elsewhere) */
  refresh(): void;
  /** clear the status line */
  reset(): void;
  /** the editor's size in logical pixels */
  width: number;
  height: number;
}

const ROW_Y = 16;
const ROW_H = 17;
export const PALETTE_EDITOR_WIDTH = 302;

function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, rect?: [number, number, number?, number?], text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (rect) {
    e.style.position = 'absolute';
    e.style.left = rect[0] + 'px';
    e.style.top = rect[1] + 'px';
    if (rect[2] !== undefined) e.style.width = rect[2] + 'px';
    if (rect[3] !== undefined) e.style.height = rect[3] + 'px';
  }
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

function download(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function chooseFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function paletteEditor(host: HTMLElement, lib: PaletteLibrary, opts: PaletteEditorOptions = {}): PaletteEditor {
  const config = lib.config;
  const apply = opts.apply ?? ((c: Colors) => applyPalette(config, c));
  const b = make('div', 'paletteeditor', host);
  Object.assign(b.style, { position: 'relative', width: PALETTE_EDITOR_WIDTH + 'px' });
  // keys typed here are for the text fields, not the application's keyboard shortcuts
  b.addEventListener('keydown', (e) => e.stopPropagation());
  const defaultName = lib.builtIns[0]!.name;

  make('div', 'label small', b, [6, 4], 'Palettes');
  const list = make('div', 'box', b, [6, 16, 112, 112]);
  Object.assign(list.style, { overflowY: 'auto', background: 'var(--paper)' });
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Palettes');

  make('div', 'label tiny', b, [6, 133], 'Name');
  const name = make('input', 'mtext', b, [6, 142, 112, 16]);
  name.setAttribute('aria-label', 'Palette name');
  name.addEventListener('focus', () => name.select());
  const rename = () => {
    const p = lib.selected;
    if (!p.builtIn && lib.rename(p.id, name.value)) refresh();
    else name.value = p.name;
  };
  name.addEventListener('change', rename);
  name.addEventListener('keydown', (e) => e.key === 'Enter' && (rename(), name.blur()));

  const btn = (x: number, y: number, w: number, t: string, title: string, f: () => void) => {
    const d = make('button', 'mbutton', b, [x, y, w, 17], t);
    d.style.padding = '0';
    d.title = title;
    d.addEventListener('click', f);
    return d;
  };
  let deleteArmed = 0;
  const btns = {
    duplicate: btn(6, 164, 54, 'Duplicate', 'Make an editable copy of this palette', () => say(`Made “${lib.duplicate(lib.selectedId).name}”.`, true)),
    delete: btn(64, 164, 54, 'Delete', 'Delete this custom palette (press twice)', () => remove()),
    import: btn(6, 185, 54, 'Import…', `Load a palette file (.${paletteFormat(config)}.json, or another Slop Factory application's)`, () => void importFile()),
    export: btn(64, 185, 54, 'Export…', 'Save this palette as a file', () => exportFile()),
    reset: btn(6, 206, 112, `Back to ${defaultName}`, `Use the original look (${defaultName})`, () => say(`${defaultName} palette.`, lib.resetToDefault())),
  };

  make('div', 'label small', b, [128, 4], 'Colours');
  const rows = new Map<string, { swatch: HTMLDivElement; picker: HTMLInputElement; hex: HTMLInputElement; warn: HTMLDivElement }>();
  config.roles.forEach((role, i) => {
    const y = ROW_Y + i * ROW_H;
    const l = make('div', 'label small', b, [128, y + 3], role.label);
    l.title = role.help;
    const swatch = make('div', 'box', b, [194, y, 22, 14]);
    swatch.title = `${role.label}: ${role.help}. Click to pick a colour.`;
    swatch.setAttribute('role', 'button');
    swatch.tabIndex = 0;
    // the browser's colour picker, opened from the swatch
    const picker = make('input', '', swatch);
    picker.type = 'color';
    Object.assign(picker.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0', border: '0', padding: '0', cursor: 'default' });
    picker.setAttribute('aria-label', `${role.label} colour`);
    picker.addEventListener('input', () => set(role.id, picker.value));
    swatch.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && picker.click());
    const hex = make('input', 'mtext', b, [220, y, 60, 14]);
    hex.style.padding = '0 3px';
    hex.spellcheck = false;
    hex.maxLength = 7;
    hex.setAttribute('aria-label', `${role.label} hex colour`);
    hex.addEventListener('focus', () => hex.select());
    hex.addEventListener('input', () => /^#?[0-9a-f]{6}$/i.test(hex.value.trim()) && set(role.id, hex.value, false));
    const commit = () => {
      if (normHex(hex.value)) set(role.id, hex.value);
      else {
        say(`“${hex.value}” is not a colour. Use a hex value such as #1d6a86.`);
        hex.value = lib.selected.colors[role.id] ?? '';
      }
    };
    hex.addEventListener('change', commit);
    hex.addEventListener('keydown', (e) => e.key === 'Enter' && (commit(), hex.blur()));
    const warn = make('div', 'label', b, [284, y + 3, 12, 10], '!');
    warn.style.fontWeight = '600';
    rows.set(role.id, { swatch, picker, hex, warn });
  });
  const statusY = Math.max(228, ROW_Y + config.roles.length * ROW_H + 6);
  const status = make('div', 'label tiny', b, [6, statusY, 292, 16]);
  Object.assign(status.style, { whiteSpace: 'normal', lineHeight: '8px' });
  status.setAttribute('aria-live', 'polite');
  const height = statusY + 18;
  b.style.height = height + 'px';

  function set(role: string, value: string, rewriteHex = true): void {
    const wasBuiltIn = lib.selected.builtIn;
    const p = lib.setColor(role, value);
    applySoon();
    if (wasBuiltIn && !p.builtIn) say(`Built-in palettes stay as they are: editing “${p.name}”.`);
    refresh(rewriteHex ? undefined : role);
    opts.onChange?.();
  }

  /** Live edits (a colour picker drag fires many events) restyle at most once per frame. */
  let frame = 0;
  function applySoon(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      apply(lib.selected.colors);
    });
  }

  function say(text: string, changed: unknown = false): void {
    if (changed) {
      apply(lib.selected.colors);
      refresh();
      opts.onChange?.();
    }
    status.textContent = text;
  }

  function remove(): void {
    const p = lib.selected;
    if (p.builtIn) return;
    // two clicks to delete (no system dialog)
    if (performance.now() - deleteArmed > 3000) {
      deleteArmed = performance.now();
      btns.delete.textContent = 'Sure?';
      setTimeout(() => (btns.delete.textContent = 'Delete'), 3000);
      return;
    }
    deleteArmed = 0;
    btns.delete.textContent = 'Delete';
    lib.remove(p.id);
    say(`Deleted “${p.name}”.`, true);
  }

  function exportFile(): void {
    const p = lib.selected;
    const safe = p.name.replace(/[^\w\- ]+/g, '').trim() || 'palette';
    (opts.save ?? download)(`${safe}.${paletteFormat(config)}.json`, exportPalette(config, p));
    say(`Exported “${p.name}”.`);
  }

  async function importFile(): Promise<void> {
    const f = await (opts.open ?? chooseFile)('.json,application/json');
    if (!f) return;
    try {
      const r = importPalette(config, await f.text());
      const p = lib.addImported(r);
      const label = (id: string) => config.roles.find((x) => x.id === id)?.label ?? id;
      let msg = `Imported “${p.name}”.`;
      if (r.filled.length) msg += ` Not in the file: ${r.filled.map(label).join(', ')} (made from the other colours).`;
      say(msg, true);
    } catch (e) {
      say('Could not import: ' + (e instanceof PaletteError ? e.message : 'the file could not be read.'));
    }
  }

  /** Redraw the list and the colour rows from the library. `editing` keeps that hex field as typed. */
  function refresh(editing?: string): void {
    const sel = lib.selected;
    list.replaceChildren();
    for (const p of lib.all()) {
      const d = make('div', 'label', list, undefined, p.name + (p.builtIn ? '' : ' *'));
      Object.assign(d.style, { position: 'relative', padding: '2px 4px', overflow: 'hidden', textOverflow: 'ellipsis' });
      d.setAttribute('role', 'option');
      d.setAttribute('aria-selected', String(p.id === sel.id));
      d.dataset.palette = p.id;
      d.title = p.builtIn ? `${p.name} (built in)` : `${p.name} (yours)`;
      if (p.id === sel.id) d.classList.add('inv');
      d.addEventListener('pointerdown', () => {
        lib.select(p.id);
        say('', true);
      });
    }
    name.value = sel.name;
    name.disabled = sel.builtIn;
    name.title = sel.builtIn ? 'Built-in palettes cannot be renamed: Duplicate first' : 'Rename this palette';
    btns.delete.disabled = sel.builtIn;
    btns.delete.style.opacity = sel.builtIn ? '0.4' : '1';
    name.style.opacity = sel.builtIn ? '0.6' : '1';
    const warnings = new Map(contrastWarnings(config, sel.colors).map((w) => [w.role, w]));
    for (const role of config.roles) {
      const r = rows.get(role.id)!;
      const c = sel.colors[role.id] ?? '#000000';
      r.swatch.style.background = c;
      r.picker.value = c;
      if (role.id !== editing) r.hex.value = c;
      const w = warnings.get(role.id);
      r.warn.style.visibility = w ? 'visible' : 'hidden';
      r.warn.title = w ? `Low contrast against ${config.roles.find((x) => x.id === w.against)?.label ?? w.against} (${w.ratio.toFixed(1)}:1): may be hard to see` : '';
    }
  }

  refresh();
  return { refresh: () => refresh(), reset: () => (status.textContent = ''), width: PALETTE_EDITOR_WIDTH, height };
}
