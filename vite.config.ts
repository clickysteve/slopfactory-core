import { defineConfig } from 'vite';

// Unit tests only; the package build is scripts/build.mjs.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
} as never);
