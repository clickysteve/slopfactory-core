/**
 * The package as applications receive it: the committed dist/ build, its "exports", its
 * declarations and its runtime files. Run `npm run build` first after changing src/.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from '../src/version';

const ROOT = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { name: string; version: string; exports: Record<string, string | { types: string; import: string }>; dependencies?: object };
const MODULES = ['events', 'audio', 'sampler', 'dsp', 'render', 'export', 'storage', 'midi', 'palette'];
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

describe('package', () => {
  it('is @slopfactory/core with a semantic version that matches CORE_VERSION', () => {
    expect(pkg.name).toBe('@slopfactory/core');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(CORE_VERSION).toBe(pkg.version);
  });

  it('has no runtime dependencies', () => {
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('exports the root and one subpath per module, each with JS and declarations that exist', () => {
    expect(Object.keys(pkg.exports)).toEqual(expect.arrayContaining(['.', ...MODULES.map((m) => `./${m}`), './output-fx-worklet.js', './transform-worker.js']));
    for (const [k, v] of Object.entries(pkg.exports)) {
      const targets = typeof v === 'string' ? [v] : [v.types, v.import];
      for (const t of targets) expect(existsSync(join(ROOT, t)), `${k} -> ${t}`).toBe(true);
    }
  });

  it('every entry point imports without a browser (no globals touched at import time)', async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
    expect(typeof (globalThis as { indexedDB?: unknown }).indexedDB).toBe('undefined');
    const root = await import(join(ROOT, 'dist/index.js'));
    expect(root.CORE_VERSION).toBe(pkg.version);
    for (const m of MODULES) await import(join(ROOT, `dist/${m}.js`));
  });

  it('the built package is the source: same exports from dist and src', async () => {
    const built = await import(join(ROOT, 'dist/index.js'));
    const src = await import('../src/index');
    expect(Object.keys(built).sort()).toEqual(Object.keys(src).sort());
    expect(built.CORE_VERSION).toBe(src.CORE_VERSION);
  });

  it('the AudioWorklet and Worker files are self-contained (loadable by URL)', () => {
    for (const f of ['dist/output-fx-worklet.js', 'dist/transform-worker.js']) {
      const text = readFileSync(join(ROOT, f), 'utf8');
      expect(text, f).not.toMatch(/^\s*(import|export)\b/m);
    }
    expect(readFileSync(join(ROOT, 'dist/output-fx-worklet.js'), 'utf8')).toContain('registerProcessor(');
  });

  it('dist names no application in its code', () => {
    const hits = walk(join(ROOT, 'dist'))
      .filter((f) => /\.(js|ts)$/.test(f))
      .filter((f) => /\b(anvil|downbeat|emmm|feelers|frakmc)\b/i.test(readFileSync(f, 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')));
    expect(hits).toEqual([]);
  });

  it('declarations type-check in a consumer that imports by package name (skipLibCheck off)', () => {
    execFileSync(process.execPath, [join(ROOT, 'e2e/harness/link.mjs')]);
    execFileSync(process.execPath, [join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', join(ROOT, 'e2e/harness/tsconfig.json')], { stdio: 'pipe' });
  }, 60_000);
});
