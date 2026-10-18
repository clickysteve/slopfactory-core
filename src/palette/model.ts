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
export const SHARED_ROLES: PaletteRole[] = [
  { id: 'desktop', label: 'Desktop', help: 'background behind the windows', css: '--desktop' },
  { id: 'paper', label: 'Paper', help: 'window and panel background', css: '--paper' },
  { id: 'ink', label: 'Ink', help: 'frames, text and drawing', css: '--ink', contrast: 3 },
  { id: 'dim', label: 'Dim', help: 'guide lines, tiny labels, disabled items', css: '--dim', contrast: 1.6, from: 'ink' },
  { id: 'activity', label: 'Activity', help: 'playheads, now-playing marks', css: '--activity', contrast: 2, from: 'ink' },
  { id: 'selection', label: 'Selection', help: 'selected items, menu highlight', css: '--selection', contrast: 2, from: 'ink' },
];

// ---------------------------------------------------------------------------- colour maths

/** Lenient hex parsing (#rgb, #rrggbb, with or without #) → '#rrggbb' lowercase, or null. */
export function normHex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.replace(/./g, (c) => c + c);
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return '#' + s.toLowerCase();
}

function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (1 … 21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface ContrastWarning {
  role: string;
  ratio: number;
  against: string;
}

/** Roles that are hard to see against the paper. Never changes any colour. */
export function contrastWarnings(config: PaletteConfig, c: Colors): ContrastWarning[] {
  const out: ContrastWarning[] = [];
  for (const role of config.roles) {
    if (role.contrast === undefined || !c[role.id] || !c.paper) continue;
    const ratio = contrast(c[role.id]!, c.paper);
    if (ratio < role.contrast) out.push({ role: role.id, ratio, against: 'paper' });
  }
  // the paper itself is unreadable if even the base ink disappears on it
  if (c.ink && c.paper && contrast(c.ink, c.paper) < 3) out.push({ role: 'paper', ratio: contrast(c.ink, c.paper), against: 'ink' });
  return out;
}

/** A complete colour set for the config's roles from a partial one: missing roles follow their `from` role, else the default palette. */
export function completeColors(config: PaletteConfig, partial: Partial<Colors>): Colors {
  const base = config.builtIns[0]!.colors;
  const out: Colors = {};
  const get = (id: string, depth = 0): string => {
    const own = normHex(partial[id]);
    if (own) return own;
    const role = config.roles.find((r) => r.id === id);
    if (role?.from && depth < 8) return get(role.from, depth + 1);
    return base[id] ?? '#000000';
  };
  for (const r of config.roles) out[r.id] = get(r.id);
  return out;
}

// ---------------------------------------------------------------------------- CSS

const enc = (hex: string) => hex.replace('#', '%23');
/** 1-bit fills as SVG data URIs in a given colour (2×2 and 4×4 cells). */
function fills(ink: string, paper: string): Record<string, string> {
  const svg = (w: number, body: string) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${w}' shape-rendering='crispEdges'%3E${body}%3C/svg%3E")`;
  const px = (x: number, y: number, c: string) => `%3Crect x='${x}' y='${y}' width='1' height='1' fill='${enc(c)}'/%3E`;
  return {
    '--grey': svg(2, px(0, 0, ink) + px(1, 1, ink)),
    '--lightgrey': svg(4, px(0, 0, ink) + px(2, 2, ink)),
    '--dots': svg(4, px(1, 1, ink)),
    '--hatch': svg(4, px(3, 0, ink) + px(2, 1, ink) + px(1, 2, ink) + px(0, 3, ink)),
    '--whitegrey': svg(2, px(0, 0, paper) + px(1, 1, paper)),
  };
}

const decl = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

/** Ink, paper and fills for one scope (the root, or one area), plus their swapped versions (--inv-*) for inverted controls. */
function scope(ink: string, paper: string): Record<string, string> {
  const inv = Object.fromEntries(Object.entries(fills(paper, ink)).map(([k, v]) => ['--inv-' + k.slice(2), v]));
  return { '--ink': ink, ...fills(ink, paper), '--inv-ink': paper, '--inv-paper': ink, ...inv };
}

/** CSS declarations that swap ink and paper (an inverted control in a non-default palette). */
export const SWAP_INK_PAPER = '--ink:var(--inv-ink);--paper:var(--inv-paper);' + ['grey', 'lightgrey', 'dots', 'hatch', 'whitegrey'].map((f) => `--${f}:var(--inv-${f})`).join(';');

export function isDefaultPalette(config: PaletteConfig, c: Colors): boolean {
  const base = completeColors(config, config.builtIns[0]!.colors);
  return config.roles.every((r) => c[r.id] === base[r.id]);
}

/** The one style sheet that applies a palette. */
export function paletteCss(config: PaletteConfig, colors: Colors): string {
  const c = completeColors(config, colors);
  const root: Record<string, string> = {};
  for (const r of config.roles) if (!r.area && r.id !== 'ink') root[r.css] = c[r.id]!;
  Object.assign(root, scope(c.ink!, c.paper!));
  let css = `:root{${decl(root)}}\n`;
  for (const r of config.roles) if (r.area) css += `[data-area="${r.id}"]{${decl(scope(c[r.id]!, c.paper!))}}\n`;
  if (!isDefaultPalette(config, c)) {
    // marks (playheads) in the activity colour rather than difference blending
    css += `:root{--mark-color:var(--activity);--mark-blend:normal}\n`;
    css += config.extraCss?.(c) ?? '';
  }
  return css;
}

/** Apply a palette to a document (one <style> element; nothing else is touched). */
export function applyPalette(config: PaletteConfig, colors: Colors, doc: Document = document): void {
  const id = `${config.app}-palette`;
  let el = doc.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = doc.createElement('style');
    el.id = id;
    doc.head.appendChild(el);
  }
  el.textContent = paletteCss(config, colors);
  doc.documentElement.dataset.palette = isDefaultPalette(config, completeColors(config, colors)) ? 'default' : 'custom';
}

// ---------------------------------------------------------------------------- file format

export const PALETTE_VERSION = 1;

export interface PaletteFile {
  format: string;
  version: number;
  name: string;
  colors: Colors;
}

export const paletteFormat = (config: PaletteConfig) => `${config.app}-palette`;

export function exportPalette(config: PaletteConfig, p: { name: string; colors: Colors }): string {
  const f: PaletteFile = { format: paletteFormat(config), version: PALETTE_VERSION, name: p.name, colors: { ...p.colors } };
  return JSON.stringify(f, null, 2);
}

export class PaletteError extends Error {}

export interface ImportResult {
  name: string;
  colors: Colors;
  /** roles that were missing or unreadable and were taken from the roles they follow, or the default palette */
  filled: string[];
  /** keys this application does not know (another application's roles), ignored */
  ignored: string[];
}

/** Parse and validate a palette file (this application's, or an accepted one's). Throws PaletteError with a readable message. */
export function importPalette(config: PaletteConfig, text: string): ImportResult {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new PaletteError('The file is not valid JSON.');
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new PaletteError('The file is not a palette.');
  const o = obj as Record<string, unknown>;
  const own = paletteFormat(config);
  if (o.format !== undefined && o.format !== own && !(config.accept ?? []).includes(String(o.format))) throw new PaletteError(`The file is not a palette this application reads (${String(o.format)}).`);
  const version = Number(o.version);
  if (!Number.isInteger(version) || version < 1) throw new PaletteError('The palette file has no valid version number.');
  if (version > PALETTE_VERSION) throw new PaletteError(`This palette was made by a newer version (format v${version}).`);
  if (!o.colors || typeof o.colors !== 'object' || Array.isArray(o.colors)) throw new PaletteError('The palette file has no colours.');
  const src = o.colors as Record<string, unknown>;
  const read: Partial<Colors> = {};
  const filled: string[] = [];
  for (const r of config.roles) {
    const h = normHex(src[r.id]);
    if (h) read[r.id] = h;
    else filled.push(r.id);
  }
  if (!Object.keys(read).length) throw new PaletteError('None of the palette colours could be read.');
  const ignored = Object.keys(src).filter((k) => !config.roles.some((r) => r.id === k));
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : 'Imported palette';
  return { name, colors: completeColors(config, read), filled, ignored };
}

// ---------------------------------------------------------------------------- preferences

export interface PaletteStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function defaultStore(): PaletteStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Palette preferences: the custom palettes and which palette is selected. */
export class PaletteLibrary {
  custom: Palette[] = [];
  selectedId: string;
  readonly builtIns: Palette[];

  constructor(
    readonly config: PaletteConfig,
    private store: PaletteStore | null = defaultStore(),
  ) {
    this.builtIns = config.builtIns.map((p) => ({ ...p, builtIn: true, colors: completeColors(config, p.colors) }));
    this.selectedId = this.defaultId;
    this.load();
  }

  get defaultId(): string {
    return this.builtIns[0]!.id;
  }

  private key(k: 'custom' | 'selected'): string {
    return `${this.config.app}.palette.${k}`;
  }

  load(): void {
    try {
      const raw = this.store?.getItem(this.key('custom'));
      const list = raw ? (JSON.parse(raw) as unknown[]) : [];
      this.custom = [];
      for (const item of Array.isArray(list) ? list : []) {
        try {
          const r = importPalette(this.config, JSON.stringify({ format: paletteFormat(this.config), version: 1, ...(item as object) }));
          const id = typeof (item as Palette).id === 'string' ? (item as Palette).id : this.newId();
          this.custom.push({ id, name: r.name, builtIn: false, colors: r.colors });
        } catch {
          /* skip a damaged entry */
        }
      }
      const sel = this.store?.getItem(this.key('selected'));
      this.selectedId = sel && this.find(sel) ? sel : this.defaultId;
    } catch {
      this.custom = [];
      this.selectedId = this.defaultId;
    }
  }

  private save(): void {
    try {
      this.store?.setItem(this.key('custom'), JSON.stringify(this.custom.map((p) => ({ id: p.id, name: p.name, colors: p.colors }))));
      this.store?.setItem(this.key('selected'), this.selectedId);
    } catch {
      /* storage full or blocked: palettes still work for this session */
    }
  }

  private newId(): string {
    let i = this.custom.length + 1;
    while (this.find('custom-' + i)) i++;
    return 'custom-' + i;
  }

  all(): Palette[] {
    return [...this.builtIns, ...this.custom];
  }

  find(id: string): Palette | undefined {
    return this.all().find((p) => p.id === id);
  }

  get selected(): Palette {
    return this.find(this.selectedId) ?? this.builtIns[0]!;
  }

  select(id: string): Palette {
    if (this.find(id)) this.selectedId = id;
    this.save();
    return this.selected;
  }

  private uniqueName(base: string): string {
    const names = new Set(this.all().map((p) => p.name));
    if (!names.has(base)) return base;
    for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
  }

  /** A custom copy of any palette, selected. */
  duplicate(id: string, name?: string): Palette {
    const src = this.find(id) ?? this.builtIns[0]!;
    const p: Palette = { id: this.newId(), name: this.uniqueName(name ?? `${src.name} copy`), builtIn: false, colors: { ...src.colors } };
    this.custom.push(p);
    this.selectedId = p.id;
    this.save();
    return p;
  }

  /** Change one colour. Built-ins are never modified: editing one makes a custom copy first. */
  setColor(role: string, value: string): Palette {
    const hex = normHex(value);
    let p = this.selected;
    if (!hex || !this.config.roles.some((r) => r.id === role)) return p;
    if (p.builtIn) p = this.duplicate(p.id);
    p.colors[role] = hex;
    this.save();
    return p;
  }

  rename(id: string, name: string): boolean {
    const p = this.custom.find((x) => x.id === id);
    const n = name.trim().slice(0, 40);
    if (!p || !n) return false;
    p.name = n;
    this.save();
    return true;
  }

  remove(id: string): boolean {
    const i = this.custom.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.custom.splice(i, 1);
    if (this.selectedId === id) this.selectedId = this.defaultId;
    this.save();
    return true;
  }

  /** Add an imported palette as a new custom palette, selected. */
  addImported(r: ImportResult): Palette {
    const p: Palette = { id: this.newId(), name: this.uniqueName(r.name), builtIn: false, colors: { ...r.colors } };
    this.custom.push(p);
    this.selectedId = p.id;
    this.save();
    return p;
  }

  /** Back to the default palette (the original look). */
  resetToDefault(): Palette {
    return this.select(this.defaultId);
  }
}
