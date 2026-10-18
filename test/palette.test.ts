/**
 * Palettes: the model, validation, the style sheet, palette files, preferences and the shared
 * presets. Ported from the first application's palette tests, plus: an application with its own
 * roles and areas behaves exactly as that application's own palette code did (so it can move to
 * Core without its users' palettes or files changing), and palette files cross between apps.
 */
import { describe, expect, it } from 'vitest';
import {
  AMBER,
  applyPalette,
  ATARI,
  completeColors,
  contrast,
  contrastWarnings,
  exportPalette,
  importPalette,
  isDefaultPalette,
  normHex,
  PaletteError,
  PaletteLibrary,
  paletteCss,
  SHARED_PRESETS,
  SHARED_ROLES,
  SWAP_INK_PAPER,
  type Palette,
  type PaletteConfig,
  type PaletteRole,
  type PaletteStore,
} from '../src/palette';

function memStore(init: Record<string, string> = {}): PaletteStore & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

/** Just enough of a Document for applyPalette. */
function fakeDoc() {
  const els: Record<string, { id: string; textContent: string }> = {};
  return {
    els,
    getElementById: (id: string) => els[id] ?? null,
    createElement: () => ({ id: '', textContent: '' }),
    head: { appendChild: (e: { id: string; textContent: string }) => (els[e.id] = e) },
    documentElement: { dataset: {} as Record<string, string> },
  } as unknown as Document & { els: typeof els };
}

/** An application with only the shared roles and presets. */
const plain: PaletteConfig = { app: 'plain', roles: SHARED_ROLES, builtIns: SHARED_PRESETS };

/** An application shaped like the first one: area roles, its own built-in "Colour", extra inversion CSS. */
const AREAS = ['patterns', 'variables', 'cyclic'];
const areaRoles: PaletteRole[] = [...SHARED_ROLES.slice(0, 4), ...AREAS.map((id) => ({ id, label: id, help: id, css: `--${id}`, contrast: 3, from: 'ink', area: true })), ...SHARED_ROLES.slice(4)];
const colour: Palette = { id: 'colour', name: 'Colour', builtIn: true, colors: { desktop: '#23303a', paper: '#fbf8ef', ink: '#202020', dim: '#8c8576', patterns: '#1d6a86', variables: '#8a2f5e', cyclic: '#2c7149', activity: '#d0372a', selection: '#2b78c9' } };
const areas: PaletteConfig = {
  app: 'areas',
  roles: areaRoles,
  builtIns: [{ ...ATARI, name: 'Classic' }, SHARED_PRESETS[1]!, colour],
  accept: ['plain-palette'],
  extraCss: () => `.flash{filter:none;${SWAP_INK_PAPER}}\n`,
};

describe('presets', () => {
  it('the shared presets are Atari (the original 1-bit look, the default), Dark and the eight newer ones', () => {
    expect(SHARED_PRESETS.map((p) => p.name)).toEqual(['Atari', 'Dark', 'Amber', 'Green Screen', 'C64', 'Phosphor', 'Pink Noise', 'Rave', 'Paper']);
    expect(new Set(SHARED_PRESETS.map((p) => p.id)).size).toBe(SHARED_PRESETS.length);
    expect(ATARI.id).toBe('classic'); // the first application's "Classic": a saved choice still matches
    for (const r of SHARED_ROLES) expect(ATARI.colors[r.id]).toBe(r.id === 'paper' ? '#ffffff' : '#000000');
    expect(new PaletteLibrary(plain, memStore()).selected.id).toBe('classic');
  });
  it('every preset defines every shared role, reads well (ink 4.5:1 on paper) and has no contrast warning', () => {
    for (const p of SHARED_PRESETS) {
      for (const r of SHARED_ROLES) expect(normHex(p.colors[r.id]), `${p.name} ${r.id}`).toBe(p.colors[r.id]);
      expect(contrast(p.colors.ink!, p.colors.paper!), p.name).toBeGreaterThanOrEqual(4.5);
      expect(contrastWarnings(plain, p.colors), p.name).toEqual([]);
      // an inverted selection (selection behind paper-coloured text) is readable too
      expect(contrast(p.colors.selection!, p.colors.paper!), p.name).toBeGreaterThanOrEqual(2);
    }
  });
  it('a preset in shared roles works in an application with more roles: they follow the roles they name', () => {
    const c = completeColors(areas, AMBER.colors);
    for (const a of AREAS) expect(c[a]).toBe(AMBER.colors.ink);
    expect(c.paper).toBe(AMBER.colors.paper);
  });
});

describe('colour helpers', () => {
  it('normHex accepts #rgb / #rrggbb with or without # and rejects the rest', () => {
    expect(normHex('#ABC')).toBe('#aabbcc');
    expect(normHex(' 1d6a86 ')).toBe('#1d6a86');
    expect(normHex('#12345')).toBeNull();
    expect(normHex('red')).toBeNull();
    expect(normHex(12)).toBeNull();
  });
  it('contrast follows WCAG', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });
  it('warns, without changing anything, when a colour is hard to see', () => {
    const c = { ...completeColors(areas, ATARI.colors), variables: '#f4f4f4' };
    expect(contrastWarnings(areas, c).map((x) => x.role)).toEqual(['variables']);
    expect(c.variables).toBe('#f4f4f4');
    expect(contrastWarnings(plain, { ...ATARI.colors, ink: '#fefefe' }).map((x) => x.role)).toEqual(['ink', 'paper']);
  });
});

describe('the style sheet', () => {
  it('the default palette sets the original colours and keeps exact filter inversion and difference marks', () => {
    const css = paletteCss(areas, ATARI.colors);
    expect(css).toContain('--paper:#ffffff');
    expect(css).toContain('--ink:#000000');
    expect(css).not.toContain('--mark-color');
    expect(css).not.toContain('.flash');
    expect(isDefaultPalette(areas, completeColors(areas, ATARI.colors))).toBe(true);
  });
  it('other palettes give each area its own ink, redraw the fills, swap for inversion, and colour the marks', () => {
    const css = paletteCss(areas, colour.colors);
    expect(css).toContain(`[data-area="patterns"]{--ink:${colour.colors.patterns}`);
    expect(css).toContain(`[data-area="cyclic"]{--ink:${colour.colors.cyclic}`);
    expect(css).toContain(colour.colors.variables!.replace('#', '%23'));
    expect(css).toContain(`.flash{filter:none;${SWAP_INK_PAPER}}`);
    expect(css).toContain('--mark-color:var(--activity)');
    // every role sets its property
    for (const r of areaRoles.filter((x) => !x.area)) expect(css).toContain(`${r.css}:`);
  });
  it('applyPalette writes one style element and nothing else', () => {
    const doc = fakeDoc();
    applyPalette(areas, SHARED_PRESETS[1]!.colors, doc);
    applyPalette(areas, colour.colors, doc);
    expect(Object.keys(doc.els)).toEqual(['areas-palette']);
    expect(doc.els['areas-palette']!.textContent).toBe(paletteCss(areas, colour.colors));
    expect(doc.documentElement.dataset.palette).toBe('custom');
    applyPalette(areas, ATARI.colors, doc);
    expect(doc.documentElement.dataset.palette).toBe('default');
  });
});

describe('library and preferences', () => {
  it('editing a built-in creates a custom copy; the built-in stays unchanged', () => {
    const lib = new PaletteLibrary(areas, memStore());
    lib.select('dark');
    const p = lib.setColor('activity', '#ff0000');
    expect(p.builtIn).toBe(false);
    expect(p.name).toBe('Dark copy');
    expect(lib.selectedId).toBe(p.id);
    expect(lib.find('dark')!.colors.activity).toBe(SHARED_PRESETS[1]!.colors.activity);
    expect(p.colors.activity).toBe('#ff0000');
  });
  it('invalid colours and unknown roles are ignored', () => {
    const lib = new PaletteLibrary(areas, memStore());
    const p = lib.duplicate('classic');
    lib.setColor('ink', 'not a colour');
    lib.setColor('nonsense', '#123456');
    expect(lib.selected.colors.ink).toBe(p.colors.ink);
    expect(lib.selected.colors.nonsense).toBeUndefined();
  });
  it('rename, duplicate, delete, back to the default', () => {
    const lib = new PaletteLibrary(areas, memStore());
    const a = lib.duplicate('colour');
    expect(lib.rename(a.id, '  Studio  ')).toBe(true);
    expect(lib.selected.name).toBe('Studio');
    expect(lib.rename('classic', 'Nope')).toBe(false);
    const b = lib.duplicate(a.id);
    expect(b.name).toBe('Studio copy');
    expect(lib.duplicate(a.id).name).toBe('Studio copy 2');
    expect(lib.remove('classic')).toBe(false);
    expect(lib.remove(b.id)).toBe(true);
    expect(lib.find(b.id)).toBeUndefined();
    lib.select(a.id);
    lib.remove(a.id); // deleting the selected palette falls back to the default
    expect(lib.selectedId).toBe('classic');
    lib.select('dark');
    expect(lib.resetToDefault().id).toBe('classic');
  });
  it('selection and custom palettes survive a reload, under the application’s own keys', () => {
    const store = memStore();
    const lib = new PaletteLibrary(areas, store);
    const p = lib.setColor('selection', '#123456');
    lib.rename(p.id, 'Mine');
    const again = new PaletteLibrary(areas, store);
    expect(again.selected.name).toBe('Mine');
    expect(again.selected.colors.selection).toBe('#123456');
    expect(Object.keys(store.data).sort()).toEqual(['areas.palette.custom', 'areas.palette.selected']);
  });
  it('reads preferences the application stored before it used Core (same keys, same shape)', () => {
    const before = { 'areas.palette.selected': 'custom-1', 'areas.palette.custom': JSON.stringify([{ id: 'custom-1', name: 'Old', colors: { ...colour.colors, patterns: '#abcdef' } }]) };
    const lib = new PaletteLibrary(areas, memStore(before));
    expect(lib.selected.name).toBe('Old');
    expect(lib.selected.colors.patterns).toBe('#abcdef');
  });
  it('damaged or unknown stored preferences fall back to the default safely', () => {
    expect(new PaletteLibrary(areas, memStore({ 'areas.palette.custom': '{nope', 'areas.palette.selected': 'custom-1' })).selected.id).toBe('classic');
    expect(new PaletteLibrary(areas, memStore({ 'areas.palette.selected': 'gone' })).selected.id).toBe('classic');
    const lib = new PaletteLibrary(areas, memStore({ 'areas.palette.custom': JSON.stringify([{ id: 'custom-1', name: 'ok', colors: { ink: '#111111' } }, 42, { colors: 'x' }]) }));
    expect(lib.custom.map((p) => p.name)).toEqual(['ok']);
    expect(lib.custom[0]!.colors.paper).toBe('#ffffff'); // missing roles from the default
    expect(lib.custom[0]!.colors.patterns).toBe('#111111'); // an area follows the ink
  });
  it('works without any storage at all', () => {
    const lib = new PaletteLibrary(areas, null);
    expect(lib.duplicate('dark').name).toBe('Dark copy');
  });
});

describe('palette files', () => {
  it('export → import round-trips', () => {
    const c = completeColors(areas, colour.colors);
    const text = exportPalette(areas, { name: 'Studio', colors: c });
    expect(JSON.parse(text)).toEqual({ format: 'areas-palette', version: 1, name: 'Studio', colors: c });
    expect(importPalette(areas, text)).toEqual({ name: 'Studio', colors: c, filled: [], ignored: [] });
  });
  it('accepts the minimal {version, name, colors} form; missing roles follow their roles, unknown keys are ignored', () => {
    const r = importPalette(areas, JSON.stringify({ version: 1, name: 'Bits', colors: { ink: '#0F0', paper: '102030', foo: '#fff', cyclic: 'nope' } }));
    expect(r.colors.ink).toBe('#00ff00');
    expect(r.colors.paper).toBe('#102030');
    expect(r.colors.cyclic).toBe('#00ff00');
    expect(r.filled).toContain('cyclic');
    expect(r.ignored).toEqual(['foo']);
  });
  it('another application’s palette imports by the roles they share', () => {
    const fromPlain = exportPalette(plain, AMBER);
    const r = importPalette(areas, fromPlain);
    expect(r.colors.ink).toBe(AMBER.colors.ink);
    expect(r.colors.patterns).toBe(AMBER.colors.ink);
    // and the other way: the areas are ignored
    const back = importPalette({ ...plain, accept: ['areas-palette'] }, exportPalette(areas, colour));
    expect(back.ignored).toEqual(expect.arrayContaining(AREAS));
    expect(back.colors.paper).toBe(colour.colors.paper);
  });
  it.each([
    ['not json', 'not valid JSON'],
    ['[1,2]', 'not a palette'],
    [JSON.stringify({ format: 'something', version: 1, colors: {} }), 'not a palette this application reads'],
    [JSON.stringify({ name: 'x', colors: { ink: '#000' } }), 'no valid version'],
    [JSON.stringify({ version: 2, colors: { ink: '#000' } }), 'newer version'],
    [JSON.stringify({ version: 1 }), 'no colours'],
    [JSON.stringify({ version: 1, colors: { ink: 'red' } }), 'None of the palette colours'],
  ])('rejects %s', (text, msg) => {
    expect(() => importPalette(areas, text)).toThrow(PaletteError);
    expect(() => importPalette(areas, text)).toThrow(msg);
  });
  it('a failed import leaves the library untouched', () => {
    const store = memStore();
    const lib = new PaletteLibrary(areas, store);
    lib.select('dark');
    const before = JSON.stringify(store.data);
    try {
      lib.addImported(importPalette(areas, '{"version":9,"colors":{}}'));
    } catch {
      /* expected */
    }
    expect(JSON.stringify(store.data)).toBe(before);
  });
});
