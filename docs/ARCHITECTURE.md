# Architecture

Slop Factory Core is shared infrastructure for browser music applications: the event model,
audio routing, the sampler, output processing, sample transformations, offline rendering,
WAV/ZIP export and sample storage. It was developed inside ANVIL (`src/core/`) and extracted
into this repository as `@slopfactory/core` 0.1.0. Version 0.2.0 added choke groups (for
DOWNBEAT), an application master insert for offline renders, and fixed fades scheduled ahead.

## 1. Modules and boundaries

| Module | Source | Depends on |
|---|---|---|
| events | `src/events/` | nothing |
| audio | `src/audio/` | dsp (output nodes), engines (master chain node) |
| sampler | `src/sampler/` | audio, dsp/vendor |
| dsp | `src/dsp/` (`output/`, `transform/`, `vendor/goodbits/`) | nothing outside dsp |
| engines | `src/engines/` | dsp (kernels, Good Bits metadata) |
| render | `src/render/` | events, audio, dsp, engines |
| export | `src/export/` | dsp/vendor (WAV encoder) |
| storage | `src/storage/` | export (ZIP) |
| midi | `src/midi/` | nothing (types only) |
| palette | `src/palette/` | nothing (DOM only when the editor or `applyPalette` is called) |
| kits | `src/kits/` | storage (sample stores, bundles), sampler (decoding), export (ZIP, names) |

### Rules that keep Core reusable

* Core imports nothing but its own files (enforced by `test/boundary.test.ts`), names no
  application in its code, and never imports application code. Applications import Core;
  never the reverse.
* Core never decides what a voice means. Applications give voice ids and names, and a
  `resolve(voice, note)` function that picks the instrument for each note. Application
  adapters (ANVIL's `src/audio/`, DOWNBEAT's `src/audio/`) translate each application's own
  musical output into Core's model.
* Core does not own project files. Applications store Core's settings objects (zones,
  transformations, processor settings: plain JSON with `repair*` functions) inside their own
  formats and migrations.
* Core makes no network requests and needs no server. Importing a module touches no browser
  global; browser APIs are used only when a function that needs them is called.

## 2. The model in brief

### Events

```ts
interface Timeline {
  tempo: TempoMap;            // { ppq, changes: [{ tick, bpm }] }
  length: Tick;               // end of the music
  voices: VoiceInfo[];        // [{ id, name }]
  events: MusicEvent[];       // NoteEvent | ControlEvent, sorted with sortEvents()
  meta?: Record<string, string | number | boolean>;
}
interface NoteEvent { type: 'note'; tick; duration; voice; pitch; velocity; channel?; instrument? }
```

* **Timing.** Integer ticks are the canonical time: exact, comparable, and free of
  accumulated error. `TimeMap.seconds(tick)` and `TimeMap.frame(tick, rate)` compute each
  position from its own tick and tempo segment (segment start times are summed once from
  exact tick differences), so a note a million ticks in is placed exactly where a direct
  calculation puts it. Tempo changes are segments of the map. Applications choose the
  resolution: ANVIL uses 24 PPQ (MIDI clocks); DOWNBEAT uses 96 000, because swing, groove and
  shifts put its notes between its 96-per-quarter fine units.
* **Durations, not note-offs.** Renderers schedule notes with known lengths. Applications
  that think in MIDI note-on/note-off use `NotePairer`, which applies MIDI pairing semantics
  (a retrigger ends the sounding note).
* **Instrument keys.** `instrument` routes one note to a different sound than its voice's
  default while it stays in its voice's stem (ANVIL's drum-table notes; DOWNBEAT's fills that
  borrow another voice's sound).
* **Determinism.** A timeline is plain data. Freezing an application's generated performance
  into one, then rendering it, never regenerates anything.

### Audio

```ts
interface Instrument { start(ctx: BaseAudioContext, out: AudioNode, note: NoteRequest): NoteHandle | null }
interface NoteHandle { release(time): void; stop(time): void; readonly end: number }
new Mixer(ctx, { voices, strips?, masterFx?, masterGain?, fxAvailable, seed?, dryTaps? })
new NotePlayer(ctx, mixer, resolve, { maxPerVoice })   // noteOn(key, voice, note), noteOff(key, t)
```

Signal flow: instrument, per-voice processing, voice gain and pan, mute/solo gate, master bus,
master processing, master output chain (when the application gives one), master gain, output. The same objects run in an `AudioContext` and in an
`OfflineAudioContext`.

### Sample processing vs output processing

| | Sample processing (`dsp/transform`) | Output processing (`dsp/output`) |
|---|---|---|
| Acts on | the sample's audio, once | the audio stream, continuously |
| Algorithms | Good Bits STRETCH FX: stretch characters (WSOLA, cyclic, repeat, granular, phase vocoder, spectral freeze, PaulStretch, varispeed), varispeed pitch, reverse, drive, crunch | Good Bits output stage (10 modes), drive, crunch; gain; one-pole tone |
| When | before playback, in a Worker, cached per (sample, settings) | live in an AudioWorklet, and identically in offline rendering |
| Stored as | a `SampleTransform` beside the original sample | an `OutputFxSettings` per voice and for the master |
| Changes duration | can | never |

Destructive, whole-buffer algorithms (time-stretch) are never forced into the real-time graph.

### Output engines

Version 0.4.0 splits output processing into independent **engines** (Good Bits OUTPUT STAGE,
DRIVE, CRUNCH, and TONE) behind a plugin contract, with registries an application owns, a
serial **output chain** whose configuration is plain JSON, a headless controller for
interfaces, and a note-safe MIDI engine chain. The chain runs one implementation everywhere:
an AudioWorklet live, the same worklet offline, and `renderChain` over buffers. The combined
`OutputFxSettings` processor stays (per voice and master) and is built from the same kernels.
See `docs/OUTPUT-ENGINES.md`.

### Rendering and export

```ts
renderTimeline({ timeline, tailSeconds, master, stems: [{ voice, processed }], strips, masterFx,
                 resolve, fxModuleUrl, onProgress, signal }) -> { outputs, frames, sampleRate, ... }
encodeWav16(channels, rate) ; createZip(entries) ; readZip(bytes)
```

Every output of a render starts at frame 0 (= tick 0), has the same length (music plus the
shared tail) and rate. Stems contain only their voice. With `processed: true` a stem includes
its voice's processing; master processing only ever reaches the master output. Nothing is
trimmed or normalised; level statistics report peaks and clamped samples.

A non-linear master processor (saturation, crunch, a compressor) applied to the full mix
cannot be reproduced by processing each stem and summing them: the sum of the stems is the
mix *before* master processing.

### Storage

```ts
interface SampleStore { put; get; has; delete; list }          // IndexedDbSampleStore, MemorySampleStore
sampleFromBytes(bytes, name)   // id = SHA-256 of the bytes: identical files stored once
writeBundle(app, { name, text }, samples) ; readBundle(bytes, app)
```

Bundles are ZIPs of `manifest.json`, the application's project file and each sample once;
hashes are checked on import and problems are reported without blocking the project.


## 3. Audio routing

```
instrument notes -> voice input -> voice processing -> voice gain -> pan -> mute/solo gate --+
                         \-> (dry tap: gain -> pan -> gate, for unprocessed stems)            |
                                                                                              v
                                    master bus -> master processing -> master gain -> output
```

The `Mixer` builds this graph on any `BaseAudioContext`. Applications may insert their own
nodes after `mixer.output` (DOWNBEAT keeps its existing master compressor there); such nodes
are outside Core. For offline renders, `RenderRequest.masterInsert(ctx, master)` builds the
same nodes in the render's context; they are applied to the master output only, never to
stems. If those nodes delay the signal (Chromium's `DynamicsCompressorNode` looks ahead by
`floor(0.006 x sampleRate)` frames), `masterLatencyFrames` advances the master by that much so
it stays sample-aligned with the stems. Such nodes also start cold in a new
OfflineAudioContext (a fresh compressor holds its first ~100 ms down), so `preRollSeconds`
renders a little silence first and discards it; Core's own processors are reset where the music
starts, so the pre-roll does not change them.

**Fades.** Instruments fade notes out (release, voice stealing, chokes, panic) from the level
the note has at that moment. `GainEnvelope` records what an instrument scheduled on a gain
parameter, and `fadeOut()` anchors each fade with an explicit value at its start time, so a
fade scheduled ahead (always the case offline) starts exactly when it should.

## 4. Rendering and stems

`renderTimeline` runs the same `Mixer`, `NotePlayer`, instruments and processor worklet in an
`OfflineAudioContext`. Every requested output (the master, or one voice's stem, processed or
dry) is two channels of one multichannel render, so all outputs start at frame 0 (= tick 0),
have the same length (the music plus one shared tail) and the same sample rate. Renders too
large for the memory budget (or more than 16 outputs) are split into several renders of whole
outputs; each starts at frame 0 with the same events, so alignment is unchanged. Nothing is
trimmed or normalised; `levelStats` reports peaks and clamped samples.

**Which processing a stem carries.** A processed stem includes its voice's processing; master
processing only ever reaches the master. Summing processed stems therefore gives the mix
*before* master processing. A non-linear master processor (saturation, crunch, a compressor)
cannot be reproduced by processing each stem and summing.

**Grouping stems differently.** A stem is "everything routed to one Mixer voice". An
application that wants stems grouped another way (DOWNBEAT's drum-sound stems) renders a
second timeline whose voice ids are the new groups. The events are the same; only the
`voice` field (the routing key) differs.

## 5. Choke groups

A note can belong to a **choke group**. When a note of a group starts, it cuts the sounding
notes of that group (an open hat stopped by a closed hat), on any voice, with a short
anti-click fade, before it starts itself.

```ts
interface ChokeSettings { group: string; cuts?: boolean; cutBy?: boolean; fade?: number }
new NotePlayer(ctx, mixer, resolve, { choke: (voice, note) => settingsFor(note.instrument) });
renderTimeline({ ..., choke: sameFunction });
```

* **Opt-in.** Notes with no group (the resolver returns `null`, or there is no resolver) are
  never cut and never cut anything. ANVIL assigns no groups, so its sound is unchanged.
* **Configurable.** `cuts` (default true): this note cuts its group. `cutBy` (default true):
  this note can be cut. A one-way choke (closed cuts open, open never cuts closed) is
  `{ cutBy: false }` on the closed hat and `{ cuts: false }` on the open hat. With both true,
  a sound retriggered in its own group cuts its previous hit. `fade` (default 5 ms) is the fade
  given to the notes it cuts; each instrument applies it in its own way (the sampler: linear).
* **Ownership.** A cut note keeps its voice: it fades inside its own voice's strip and stem.
  Groups are not tied to voices.
* **Timing.** Only notes that started *before* the cutting note are cut; notes starting at the
  same instant both play. Notes that have already ended are untouched.
* **Live and offline.** The same `NotePlayer` code runs in both. Offline renders that hold
  only some stems still apply chokes from every voice (`chokeOnly`), so a stem rendered on its
  own is cut exactly as in the full render. Browser tests compare a live recording with the
  offline render of the same notes (`e2e/choke.spec.ts`).

## 6. Storage

```ts
interface SampleStore { put; get; has; delete; list }   // IndexedDbSampleStore, MemorySampleStore
sampleFromBytes(bytes, name)   // id = SHA-256 of the bytes: identical files are stored once
writeBundle(app, { name, text }, samples) ; readBundle(bytes, app)
```

Projects refer to samples by id; audio never goes into project JSON. Bundles are ZIPs of
`manifest.json`, the application's project file and each sample once; hashes are checked on
import and problems are reported without blocking the project.

**Kits** (`src/kits/`, [KITS.md](KITS.md)) build on the sample store: a `KitLibrary` keeps the
audio in the application's `SampleStore` and kits plus a sample index in an `IndexedDbKitStore`
(its own database per application; one transaction per change). Kits refer to samples by id and
to instruments by role; `mapKit` maps them onto an application's targets and reports what it
could not place. Portable `.kit.zip` files carry a kit with its audio between browsers and
between applications, which cannot share browser storage (it belongs to the page's origin).

## 7. Determinism

* Musical determinism belongs to the application: it freezes its performance into a Timeline
  (ANVIL's `freezePerformance` reproduces START exactly; DOWNBEAT's `renderCycles` does the same
  for its generated cycles).
* Core adds no randomness except the seeded noise of some output-stage modes (fixed seeds per
  strip) and seeded stretch engines (seed stored in the transformation).
* Offline renders of the same Timeline and settings are identical in every note, level and
  position. Chromium sums a node's several inputs in an order that can vary between renders,
  so floating-point rounding can move individual samples by up to one 16-bit step; the
  browser tests assert exactly that bound.


## 8. Licensing and provenance

Core is MIT, like ANVIL, DOWNBEAT and The Good Bits (same author). Vendored Good Bits files keep
their upstream bytes; `vendor.json` records the commit and per-file SHA-256, and
`test/vendor.test.ts` fails if a vendored file drifts. See `docs/GOOD-BITS-DSP.md`.

## 9. Known limitations

* No multi-sample zones (one sample per instrument), no sample-start modulation. Kits can hold
  several samples per instrument; choosing among them is the application's (KITS.md).
* Output processing is not oversampled; crunch aliasing is intentional, drive aliasing is not
  filtered.
* Output-stage modes allocate per sample (Good Bits' closure interface); many simultaneous
  character processors cost CPU.
* Sample-transformation output is capped at 24 s (Good Bits STRETCH FX limit).
* Renders longer than 20 minutes are refused; very long renders are split into several
  OfflineAudioContext renders of whole outputs.
* External MIDI instruments cannot be rendered by the browser.
