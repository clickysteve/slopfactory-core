# Slop Factory Core

Shared audio, sampling, DSP, output engines, rendering, WAV/ZIP export, storage, sample libraries and portable kits, and colour palettes for the Slop Factory family
of browser music applications. Infrastructure, not an application: the applications provide
the musical ideas; Core provides the plumbing.

`@slopfactory/core` is one TypeScript package with separate modules. It runs entirely in the
browser (Web Audio, AudioWorklet, OfflineAudioContext, Web Workers, IndexedDB, Web Crypto),
needs no server, makes no network requests and has no runtime dependencies. Each application
bundles it into its own static build.

Users today: **ANVIL** (<https://github.com/clickysteve/anvil>), **DOWNBEAT**
(<https://github.com/clickysteve/downbeat>) and **The Breakery**
(<https://github.com/clickysteve/the-breakery>), which also uses the palettes. This is not the Slop Factory catalogue site
(<https://github.com/clickysteve/slopfactory>).

## What is in it

| Module | Import | Provides |
|---|---|---|
| events | `@slopfactory/core/events` | The musical event model: integer ticks at any PPQ, tempo maps, notes with voice and instrument keys, validation, a MIDI-style note pairer. |
| audio | `@slopfactory/core/audio` | The `Instrument` interface, the `Mixer` (voice processing, gain, pan, mute/solo, master), the `NotePlayer` (retrigger rules, polyphony limits, choke groups). |
| sampler | `@slopfactory/core/sampler` | Sample zones (tuning, volume, pan, ONE SHOT / GATED / LOOP, start/end, loop points), the polyphonic `SampleInstrument`, decoding, zero-crossing snapping, waveform peaks. |
| dsp | `@slopfactory/core/dsp` | **Output processing** (Good Bits output stage, drive, crunch, gain, tone) streamed live and offline; **sample transformations** (Good Bits STRETCH FX) with a cache and a Worker runner. |
| engines | `@slopfactory/core/engines` | **Output engines**: a plugin contract, registries, parameter descriptions, a serial output chain (headless controller, AudioWorklet node, offline `renderChain`, all one implementation) and a note-safe MIDI engine chain. Built-in engines: Good Bits OUTPUT STAGE, DRIVE, CRUNCH, and TONE. See `docs/OUTPUT-ENGINES.md`. |
| render | `@slopfactory/core/render` | Offline rendering of a timeline to a master and sample-aligned stems through the same graph as live playback. |
| export | `@slopfactory/core/export` | 16-bit WAV encoding, level statistics, WAV header reading, a stored-ZIP writer and reader, file names. |
| storage | `@slopfactory/core/storage` | Content-addressed sample storage (SHA-256) in IndexedDB or memory; portable project bundles. |
| midi | `@slopfactory/core/midi` | **Interfaces only.** No shared MIDI implementation yet (see `docs/MIDI-ROADMAP.md`). |
| kits | `@slopfactory/core/kits` | **Sample libraries and kits**: import and validation, sample metadata and storage (one copy per file, by SHA-256), kits (save, load, rename, duplicate, delete, default) with the shared kit workflow (`KitSession`), instrument roles and mapping a kit onto any application's tracks, portable `.kit.zip` files that move kits (with their audio) between browsers and applications, audition, migration helpers and bundled kits. See `docs/KITS.md`. |
| palette | `@slopfactory/core/palette` | Colour palettes for the 1-bit interfaces: colour roles (shared, plus each application's own), the style sheet, contrast checks, palette files (importable across applications), preferences, the shared presets (Atari, Dark, Amber, Green Screen, C64, Phosphor, Pink Noise, Rave, Paper) and the palette editor. Cosmetic only. |

Everything is also exported from `@slopfactory/core`.

## Installing

Applications depend on an immutable version tag of this repository (no npm registry):

```bash
npm install "git+https://github.com/clickysteve/slopfactory-core.git#v0.2.0"
```

which records in `package.json`

```json
"dependencies": { "@slopfactory/core": "git+https://github.com/clickysteve/slopfactory-core.git#v0.2.0" }
```

and pins the tag's commit SHA in `package-lock.json`. The tagged commit contains the built
package (`dist/`), so installing needs no build step. Commit the lockfile; `npm ci` then
installs exactly that commit on any machine. To upgrade, install the new tag and commit both
files. See `docs/RELEASING.md`.

## Using it

```ts
import { constantTempo, sortEvents, type Timeline } from '@slopfactory/core/events';
import { Mixer, NotePlayer } from '@slopfactory/core/audio';
import { decodeSample, defaultZone, SampleInstrument, toAudioBuffer } from '@slopfactory/core/sampler';
import { loadOutputFx } from '@slopfactory/core/dsp';
import { renderTimeline } from '@slopfactory/core/render';
import { encodeWav16 } from '@slopfactory/core/export';
// The AudioWorklet and the transformation Worker are separate, self-contained files.
// With Vite, `?url` copies them into the build and gives their URLs:
import workletUrl from '@slopfactory/core/output-fx-worklet.js?url';
import workerUrl from '@slopfactory/core/transform-worker.js?url';

const kick = new SampleInstrument(toAudioBuffer(await decodeSample(bytes, 'kick.wav')), { ...defaultZone(), mode: 'oneshot' });

// live
const ctx = new AudioContext({ sampleRate: 44100 });
const fxAvailable = await loadOutputFx(ctx, workletUrl);
const mixer = new Mixer(ctx, { voices: ['drums'], fxAvailable });
mixer.output.connect(ctx.destination);
const player = new NotePlayer(ctx, mixer, () => kick);
player.noteOn('n1', 'drums', { time: ctx.currentTime + 0.05, pitch: 60, velocity: 110 });

// offline: the same graph in an OfflineAudioContext
const timeline: Timeline = { tempo: constantTempo(120, 96), length: 384, voices: [{ id: 'drums', name: 'Drums' }], events: sortEvents([/* notes */]) };
const result = await renderTimeline({ timeline, tailSeconds: 1, master: true, stems: [{ voice: 'drums', processed: true }], resolve: () => kick, fxModuleUrl: workletUrl });
const wav = await encodeWav16(result.outputs[0].channels, result.sampleRate);
```

`src/examples/newApp.ts` is a longer, type-checked example.

## Browser requirements

* Web Audio with `OfflineAudioContext`. AudioWorklet (a secure context: https or localhost)
  for output processing; without it, audio plays and renders unprocessed and Core reports it
  (`Mixer.processing`, `RenderResult.processed`).
* IndexedDB and Web Crypto for sample storage; without them storage reports
  `StorageError('unavailable')` and applications keep working without persistence.
* Module Workers for sample transformations in the background (or the synchronous runner).
* Tested in Chromium (Playwright). Firefox and Safari support the same APIs but are not
  tested automatically.

Importing any module touches no browser global, so Core can be imported in Node, in unit
tests and by build tools.

## Developing

```bash
npm ci
npm run typecheck
npm test            # unit tests (Vitest), including package and declaration checks
npm run build       # dist/ (commit it)
npm run test:e2e    # Chromium tests against the built package, imported by name
npm run verify      # all of the above
npm run check:dist  # rebuild and fail if dist/ differs from what is committed
```

## Documentation

* [Architecture](docs/ARCHITECTURE.md): the event model, routing, processing, rendering, stems, storage, choke groups, determinism.
* [API](docs/API.md): every module's public interface.
* [Releasing](docs/RELEASING.md): versions, tags, how applications upgrade.
* [Kits](docs/KITS.md): the shared sample library and kit system, the portable kit format, storage, migration, bundled kits.
* [Output engines](docs/OUTPUT-ENGINES.md): the engines found in The Good Bits, the plugin contract, the chain, and a short guide to adding an engine.
* [Good Bits DSP](docs/GOOD-BITS-DSP.md): what is reused from The Good Bits and how its provenance is checked.
* [MIDI roadmap](docs/MIDI-ROADMAP.md): the MIDI audit, interfaces and plan.

## Licence

MIT. Good Bits DSP is vendored under its own MIT licence. See `NOTICE.md`.
