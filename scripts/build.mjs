// Reproducible package build: ES modules per entry point, two self-contained runtime files
// (the output-processing AudioWorklet and the sample-transformation Worker) and TypeScript
// declarations. The output is committed in dist/ so applications can install a tag with
// no build step; `npm run check:dist` rebuilds and fails if dist/ differs.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const MODULES = ['events', 'audio', 'sampler', 'dsp', 'render', 'export', 'storage', 'midi'];

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

// 2. self-contained runtime files (no imports): loaded by URL, not imported
for (const [entry, name] of [
  ['src/dsp/output/worklet.ts', 'output-fx-worklet'],
  ['src/dsp/transform/worker.ts', 'transform-worker'],
]) {
  await build({
    ...common,
    build: {
      outDir: dist,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      target: 'es2022',
      lib: { entry, formats: ['es'], fileName: () => `${name}.js` },
    },
  });
}

// 3. declarations, plus the hand-written declarations of the vendored Good Bits files
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' });
const vendor = join(root, 'src/dsp/vendor/goodbits');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const f of walk(vendor).filter((f) => f.endsWith('.d.ts'))) {
  const to = join(dist, 'types/dsp/vendor/goodbits', relative(vendor, f));
  mkdirSync(dirname(to), { recursive: true });
  cpSync(f, to);
}
console.log('built', relative(process.cwd(), dist) || dist);
