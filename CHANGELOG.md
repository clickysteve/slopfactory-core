# Changelog

## 0.1.0

First release: Slop Factory Core extracted from ANVIL (`src/core/` on ANVIL's
`claude/anvil-samples-processing-export-6uy6wt` branch at `b3c4dcd`) into its own package,
without behaviour changes.

* Modules: events, audio, sampler, dsp (output processing and sample transformations, with
  The Good Bits DSP vendored unchanged), render, export, storage, midi (interfaces only).
* Package: ES modules per entry point, TypeScript declarations, a self-contained
  AudioWorklet (`output-fx-worklet.js`) and Worker (`transform-worker.js`), committed and
  reproducible `dist/`.
* Tests: the Core unit tests moved from ANVIL, package and declaration checks, and Chromium
  tests against the built package.
