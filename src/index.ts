/**
 * Slop Factory Core: shared audio, sampling, processing, rendering, export and storage for
 * browser music applications. One package, separate modules; nothing here knows which
 * application uses it. See docs/ARCHITECTURE.md.
 *
 * Each module is also importable on its own: `@slopfactory/core/events`, `/audio`,
 * `/sampler`, `/dsp`, `/engines`, `/render`, `/export`, `/storage`, `/midi`, `/palette`.
 */
export { CORE_VERSION } from './version';
export * from './events';
export * from './audio';
export * from './sampler';
export * from './dsp';
export * from './engines';
export * from './render';
export * from './export';
export * from './storage';
export * from './midi';
export * from './palette';
