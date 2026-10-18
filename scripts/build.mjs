// Reproducible package build: ES modules per entry point, self-contained runtime files (the
// output-processing and output-chain AudioWorklets and the sample-transformation Worker), a
// self-contained copy of the engines module for applications without a bundler, and TypeScript
// declarations. The output is committed in dist/ so applications can install a tag with
// no build step; `npm run check:dist` rebuilds and fails if dist/ differs.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const MODULES = ['events', 'audio', 'sampler', 'dsp', 'engines', 'render', 'export', 'storage', 'midi', 'palette'];

rmSync(dist, { recursive: true, force: true });

const common = { root, configFile: false, logLevel: 'warn', publicDir: false };

// 1. the library: one file per entry point, shared code in chunks
await build({
  ...common,
  build: {
    outDir: dist,
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    target: 'es2022',
    lib: {
      entry: Object.fromEntries([['index', 'src/index.ts'], ...MODULES.map((m) => [m, `src/${m}/index.ts`])]),
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rolldownOptions: {
      output: { chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
});

// 2. self-contained runtime files (no imports): loaded by URL, not imported, and copied into
//    applications' builds as they are, so they are minified here
for (const [entry, name] of [
  ['src/dsp/output/worklet.ts', 'output-fx-worklet'],
  ['src/engines/worklet.ts', 'chain-worklet'],
  ['src/dsp/transform/worker.ts', 'transform-worker'],
]) {
  await build({
    ...common,
    build: {
      outDir: dist,
      emptyOutDir: false,
      minify: true,
      sourcemap: false,
      target: 'es2022',
      lib: { entry, formats: ['es'], fileName: () => `${name}.js` },
    },
  });
}

// 3. the engines module as one self-contained ES module (no imports), readable rather than
//    minified: for applications that use plain ES modules with no bundler, which copy it as a
//    pinned file (see docs/OUTPUT-ENGINES.md)
await build({
  ...common,
  build: {
    outDir: dist,
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    target: 'es2022',
    lib: { entry: 'src/engines/index.ts', formats: ['es'], fileName: () => 'engines.standalone.js' },
  },
});

// 4. declarations, plus the hand-written declarations of the vendored Good Bits files
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' });
const vendor = join(root, 'src/dsp/vendor/goodbits');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const f of walk(vendor).filter((f) => f.endsWith('.d.ts'))) {
  const to = join(dist, 'types/dsp/vendor/goodbits', relative(vendor, f));
  mkdirSync(dirname(to), { recursive: true });
  cpSync(f, to);
}
console.log('built', relative(process.cwd(), dist) || dist);
