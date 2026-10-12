# Changelog

## 0.2.0

* **Choke groups** (`NotePlayer` option `choke`, `RenderRequest.choke`): a note can belong to a
  group and cut the group's sounding notes, across voices, with a short anti-click fade.
  Configurable per note: `cuts`, `cutBy`, `fade`. Notes starting at the same instant do not
  cut each other. Notes without a group are never cut, so nothing changes unless an
  application assigns groups. Offline renders apply chokes from every voice, including voices
  that are not part of the current render pass, so stems match the mix.
* **`masterInsert`** (`RenderRequest`): the application's own nodes after the master (for
  example a master compressor), applied to the master output only, never to stems.
* **`masterLatencyFrames`** (`RenderRequest`): the delay a master insert adds (a compressor's
  look-ahead). The master is rendered that much longer and advanced, so it stays
  sample-aligned with the stems.
* **`preRollSeconds`** (`RenderRequest`): silence rendered before the music and discarded, so an
  application's own stateful master nodes settle as they have live (a fresh
  `DynamicsCompressorNode` attenuates for about 100 ms). Core's processors are reset where the
  music starts, so their output does not change.
* `NoteHandle.stop(time, fade?)` takes an optional fade length.
* **Fix: fades scheduled ahead start at the right time.** A GATED or LOOP note's release, a
  stolen note and a stopped note now fade from their level at the note-off/stop time. Before,
  when the note-off was scheduled in advance (always offline, usually live), Chromium ramped
  from the note's start, because `cancelAndHoldAtTime` adds no hold point unless a ramp is in
  progress: held notes faded out over their whole length. The sample instrument now records
  its gain automation (`GainEnvelope`) and anchors every fade with an explicit value. ONE SHOT
  notes, which ignore note-off, were not affected unless stolen or stopped.
* The AudioWorklet and Worker files are minified.

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
