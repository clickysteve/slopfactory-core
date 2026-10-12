import { defineConfig } from 'vite';

// Builds the harness against the package's dist/ (through node_modules/@slopfactory/core).
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  logLevel: 'warn',
  build: { outDir: '../../dist-e2e', emptyOutDir: true },
});
