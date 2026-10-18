# Changelog

## 0.4.0

* **Output engines** (`@slopfactory/core/engines`, `docs/OUTPUT-ENGINES.md`): The Good Bits'
  output stages as independent plugins: `goodbits.output-stage` (10 character modes),
  `goodbits.drive`, `goodbits.crunch`, plus `core.tone`. Each is bit-identical to its Good Bits
  function with steady parameters.
  * Plugin contract with separate audio (`AudioEngineDef`, block kernels) and MIDI
    (`MidiEngineDef`) interfaces; parameter descriptions (continuous, integer, boolean, enum;
    ranges, units, neutral values, smoothing) with validation and formatting.
  * `EngineRegistry` (owned by each application, no global state) and `coreEngines(ids?)` for
    per-application availability.
  * Serial output chain: plain-JSON `ChainConfig` (unknown engines kept and passed through),
    `repairChain`, presets (Core's processing presets as chains), the headless `OutputChain`
    controller with change notifications, `ChainStream`/`renderChain` (offline) and
    `createChainNode` + `chain-worklet.js` (live and OfflineAudioContext) running the same
    code. Parameter ramps and crossfades make changes, bypass and reordering click-free.
  * `MidiEngineChain`: MIDI engines in series with note-off routing owned by the chain, so no
    note can stick on bypass, removal, reconfiguration, panic or stop. No MIDI engine is built
    in (The Good Bits has none).
  * `engines.standalone.js`: the engines module as one self-contained file for applications
    without a bundler.
* `MixerOptions.masterChain` / `chainAvailable`, `Mixer.setMasterChain()`: a master output chain
  after master processing and before master gain. Built only when given, so existing mixers
  are unchanged.
* `RenderRequest.masterChain` / `chainModuleUrl`, `RenderResult.chainProcessed`: the same chain
  in offline renders, master output only (never stems).
* The combined output processor (`createChain`, `OutputFxStream`) is now built from the same
  shared stage kernels as the engines. Its output is unchanged (the bit-identity tests against
  Good Bits still pass).

## 0.3.0

* **Palettes** (`@slopfactory/core/palette`): the colour-palette system of the first Slop
  Factory application, made generic and shared: colour roles (the shared six plus each
  application's own, which follow a shared role unless a palette colours them), the style sheet
  with 1-bit fills redrawn in the palette's colours, contrast warnings, palette files that
  import across applications by the roles they share, preferences in `<app>.palette.*` (the same
  keys and shape as before, so an application moving to Core keeps its users' palettes), and the
  palette editor. Shared presets: Atari (the original black and white, id `classic`), Dark,
  Amber, Green Screen, C64, Phosphor, Pink Noise, Rave and Paper. New module only: nothing else
  changes.

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
* Offline renders place notes that fall exactly on a frame a hair before it, so floating-point
  rounding never makes Chromium start them a whole (interpolated) frame late.
* `createOutputFxNode(..., resetAt)` and `MixerOptions.resetAt`: a processor reset at a known
  time is part of the node's construction instead of a message that a fast offline render can
  overtake.
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
