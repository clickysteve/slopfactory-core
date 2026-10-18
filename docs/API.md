# API

The public interface of `@slopfactory/core`, by module. Each module is importable on its own
(`@slopfactory/core/<module>`) or from the root. Full types are in `dist/types/` (generated
from `src/`, which is the reference for every comment and default).

## Runtime files

| Export | What it is | How to load it |
|---|---|---|
| `@slopfactory/core/output-fx-worklet.js` | The output-processing AudioWorklet, self-contained | Pass its URL to `loadOutputFx(ctx, url)` or `renderTimeline({ fxModuleUrl })`. With Vite: `import url from '@slopfactory/core/output-fx-worklet.js?url'`. |
| `@slopfactory/core/chain-worklet.js` | The output-chain AudioWorklet (built-in engines), self-contained | Pass its URL to `loadOutputChain(ctx, url)` or `renderTimeline({ chainModuleUrl })`. With Vite: `?url` as above. |
| `@slopfactory/core/engines.standalone.js` | The engines module as one self-contained ES module | For applications with no bundler: copy it (pinned) and import it by relative path. |
| `@slopfactory/core/transform-worker.js` | The sample-transformation Worker, self-contained | `new WorkerTransformRunner(() => new Worker(url, { type: 'module' }))`. With Vite: `?url` as above. |

The worklets and the Worker are plain ES files with no imports, so any bundler that can emit a file and give its URL
works.

## `@slopfactory/core` (root)

Everything below, plus `CORE_VERSION` (the package version string).

## events

| Export | Summary |
|---|---|
| `type Tick` | integer position in ticks |
| `interface TempoMap { ppq; changes: TempoChange[] }`, `TempoChange { tick; bpm }` | tempo as segments |
| `interface NoteEvent { type: 'note'; tick; duration; voice; pitch; velocity; channel?; instrument? }` | a note with a known length; `voice` routes it to a mixer voice (its stem); `instrument` is an optional key the application's resolver uses to pick a different sound |
| `interface ControlEvent { type: 'control'; tick; voice; controller; value; channel? }` | controller data the application may give meaning to |
| `type MusicEvent`, `interface VoiceInfo { id; name }`, `interface Timeline { tempo; length; voices; events; meta? }` | |
| `constantTempo(bpm, ppq)`, `normaliseTempo(map)` | |
| `class TimeMap(map)`: `seconds(tick)`, `frame(tick, sampleRate)`, `tick(seconds)`, `bpmAt(tick)` | drift-free tick/time conversion |
| `sortEvents(events)` | canonical, stable order (tick, then type, voice, pitch) |
| `validateTimeline(t)` → `TimelineProblem[]` | |
| `lastTick(t)`, `eventsForVoices(t, voices)` | |
| `class NotePairer` | pairs MIDI-style note-on/off into notes with durations (a retrigger ends the sounding note) |

## audio

| Export | Summary |
|---|---|
| `interface Instrument { start(ctx, out, note: NoteRequest): NoteHandle \| null }` | any sound source |
| `interface NoteRequest { time; pitch; velocity; channel? }` | |
| `interface NoteHandle { release(time); stop(time, fade?); readonly end }` | `release` = note-off (one-shots ignore it); `stop` = quick fade (stealing, panic, chokes) |
| `fadeOut(param, time, seconds, level)` | linear fade to zero starting at `time` from `level` (a number, or a `GainEnvelope` that is updated) |
| `class GainEnvelope`: `set(t, v)`, `ramp(t, v)`, `cancel(t)`, `at(t)` | a record of a gain's scheduled automation, so fades scheduled ahead start from the true level |
| `class Mixer(ctx, MixerOptions)` | voice strips and master; `input(voice)`, `processedTap(voice)`, `dryTap(voice)`, `setStrip`, `setMasterFx`, `setMasterChain`, `masterChain`, `setMasterGain`, `resetFx(at)`, `processing`, `output`, `dispose()` |
| `interface MixerOptions { voices; strips?; masterFx?; masterGain?; fxAvailable; seed?; dryTaps?; resetAt?; masterChain?; chainAvailable? }` | |
| `interface StripSettings { gain; pan; mute; solo; fx }`, `defaultStrip()`, `stripSeed(seed, index)` | |
| `class NotePlayer(ctx, mixer, resolve, { maxPerVoice?, choke? })` | `noteOn(key, voice, note)`, `noteOff(key, time)`, `chokeOnly(voice, note)`, `releaseAll(time)`, `stopAll(time)`, `activeCount(voice, time)` |
| `interface NoteStart extends NoteRequest { instrument? }`, `type ResolveInstrument = (voice, note) => Instrument \| null` | |
| `interface ChokeSettings { group; cuts?; cutBy?; fade? }`, `type ResolveChoke = (voice, note) => ChokeSettings \| null`, `DEFAULT_CHOKE_FADE` (0.005 s) | choke groups (see `docs/ARCHITECTURE.md`, section 5) |

## sampler

| Export | Summary |
|---|---|
| `interface SampleZone { root; tune; fine; volume; pan; mode; start; end; loopStart; loopEnd; release; velocitySens; mute }`, `type PlayMode = 'oneshot' \| 'gated' \| 'loop'` | how one sample plays |
| `defaultZone()`, `repairZone(json)`, `zoneProblems(zone, duration)` | |
| `playbackRate(zone, pitch)`, `velocityGain(zone, velocity)`, `region(zone, duration)`, `MIN_LOOP_SECONDS` | |
| `noteName(n)`, `parseNoteName(s)` | `60` ↔ `C4` |
| `class SampleInstrument(buffer, zone)`, `STOP_FADE_SECONDS` | polyphonic playback of one AudioBuffer (transposition by playback rate; mono samples panned with equal power) |
| `decodeSample(bytes, name, opts?)` → `DecodedSample`, `browserDecode(bytes)`, `toAudioBuffer(audio)` | WAV/AIFF by Good Bits' parsers at native rate; other formats by the browser; size and length limits (`MAX_SAMPLE_BYTES`, `MAX_SAMPLE_SECONDS`) |
| `class SampleError { code: SampleErrorCode }` | `empty`, `too-large`, `too-long`, `unsupported`, `corrupt`, `decode` |
| `snapToZeroCrossing(audio, seconds, window?)`, `waveformPeaks(audio, bins)`, `peakOf(channels)` | |

## dsp

**Output processing** (continuous; per voice and master):

| Export | Summary |
|---|---|
| `interface OutputFxSettings { bypass; inDb; outDb; outputStage; drive; crunch; tone }` | plain JSON; Good Bits' lo-fi chain order (output stage, drive, crunch) plus gain and tone |
| `cleanFx()`, `repairFx(json)`, `isClean(s)`, `FX_PRESETS`, `matchPreset(s)`, `fxLabel(s)`, `OUTPUT_STAGE_MODES`, `DRIVE_SHAPES` | presets: CLEAN, 12-BIT, BITCRUSH, RATE REDUCE, DRIVE, CASSETTE, VINYL, AM RADIO |
| `class OutputFxStream(settings, sampleRate, seed)`, `createChain(...)`, `processBuffers(channels, rate, settings, seed, block?)`, `SETTINGS_FADE` | the DSP itself, block by block (the worklet runs exactly this) |
| `loadOutputFx(ctx, url)` → `Promise<boolean>`, `outputFxAvailable(ctx)`, `createOutputFxNode(ctx, settings, seed, available)` → `OutputFxNode`, `OUTPUT_FX_PROCESSOR` | |

**Sample transformations** (whole sample, before playback):

| Export | Summary |
|---|---|
| `interface SampleTransform { enabled; reverse; pitch; character; ratio; macros; drive; crunch; seed }` | a STRETCH FX recipe |
| `identityTransform()`, `repairTransform(json)`, `isIdentity(t)`, `transformKey(t)`, `toRecipe(t)`, `stretchCharacters()`, `MACRO_INFO` | |
| `applyTransform(audio, t)` | synchronous |
| `class TransformCache(runner?, maxEntries?)`: `get(sampleId, audio, t)`, `has`, `drop` | one computation per (sample, settings) |
| `syncRunner`, `class WorkerTransformRunner(createWorker)`, `interface TransformRunner` | |

## engines

See `docs/OUTPUT-ENGINES.md` for the design and the guide to adding an engine.

| Export | Summary |
|---|---|
| `interface AudioEngineDef { kind: 'audio'; id; name; version; description; origin?; category?; inputs; outputs; realtime; offline; latency; seeded?; params; presets?; createKernel(sampleRate, params, seed) }` | an audio engine: metadata plus a block kernel `{ process(L, R, n); update?(params) }` |
| `interface MidiEngineDef { kind: 'midi'; ...; createProcessor(params) }`, `MidiProcessor`, `MidiMessage` | a MIDI engine (not an AudioNode) |
| `type ParamDef = ContinuousParam \| IntegerParam \| BooleanParam \| EnumParam`, `defaultParams`, `repairParam(s)`, `isValidParam`, `formatParam` | parameter descriptions: range, step, unit, neutral (OFF) value, control scale (linear/log), smoothing, options |
| `BUILTIN_AUDIO_ENGINES`, `OUTPUT_STAGE_ENGINE`, `DRIVE_ENGINE`, `CRUNCH_ENGINE`, `TONE_ENGINE`, `GOOD_BITS_ENGINE_IDS` | the built-in engines |
| `class EngineRegistry(defs?)`: `register`, `unregister`, `has`, `get`, `audio`, `midi`, `list({ kind? })`, `only(ids)`; `coreEngines(ids?)`, `checkEngine(def)` | an application's own registry (no global state) |
| `interface ChainConfig { version; bypass; stages: StageConfig[] }`, `StageConfig { id; engine; enabled; params; v? }`, `emptyChain()`, `repairChain(json, engines?)`, `repairChainWith`, `chainActive`, `unavailableStages`, `stageSeeds`, `MAX_STAGES`, `CHAIN_VERSION` | plain-JSON configuration |
| `CHAIN_PRESETS`, `presetsFor(engines)`, `matchChainPreset(config)`, `chainFromFx(OutputFxSettings)` | presets |
| `class OutputChain(registry, config?, maxStages?)`: `config`, `stages`, `available()`, `engine(stage)`, `canAdd`, `add`, `remove`, `move`, `moveTo`, `replace`, `setEnabled`, `setParam(s)`, `resetParams`, `applyEnginePreset`, `setBypass`, `applyPreset`, `load`, `clear`, `subscribe` | headless controller |
| `class ChainStream(engines, config, sampleRate, seed)`: `set`, `reset`, `process(L, R, n)`; `renderChain(channels, sampleRate, config, seed, { engines?, blockSize? })`, `CHAIN_FADE` | the chain DSP (the worklet runs exactly this) |
| `loadOutputChain(ctx, url)`, `createChainNode(ctx, config, { available, seed?, resetAt?, processor? })` → `ChainNode { node; processing; config; set; reset; dispose }`, `registerChainProcessor(engines, name?)`, `OUTPUT_CHAIN_PROCESSOR` | Web Audio (AudioContext or OfflineAudioContext) |
| `class MidiEngineChain(engines, config, out)`: `send(msg)`, `set(config)`, `panic(time)`, `stop(time)`, `sounding` | note-safe MIDI engine chain |

## render

| Export | Summary |
|---|---|
| `renderTimeline(RenderRequest)` → `Promise<RenderResult>` | master and/or stems, aligned, one shared tail |
| `interface RenderRequest { timeline; sampleRate?; tailSeconds; master; stems: StemRequest[]; strips?; masterFx?; masterGain?; fxSeed?; resolve; choke?; masterInsert?; masterLatencyFrames?; preRollSeconds?; fxModuleUrl?; masterChain?; chainModuleUrl?; maxPerVoice?; onControl?; onProgress?; signal?; memoryBudget?; chunkSeconds? }` | |
| `interface StemRequest { voice; processed }` | |
| `interface RenderResult { sampleRate; frames; seconds; musicSeconds; outputs: RenderOutput[]; renders; processed; chainProcessed }` | |
| `renderLength(timeline, tail, rate)`, `planRenders(...)`, `EXPORT_SAMPLE_RATE` (44100), `MAX_RENDER_SECONDS` (20 min), `class RenderCancelled` | |

## export

| Export | Summary |
|---|---|
| `encodeWav16(channels, sampleRate)` → `Promise<Uint8Array>` | 16-bit PCM WAV (Good Bits' encoder: clamp, scale, round; no dither, no normalisation) |
| `levelStats(channels)` → `{ peak; peakDb; clipped; rms; silent }` | |
| `wavInfo(bytes)` → `WavInfo` | header reader for checks |
| `createZip(entries)`, `readZip(bytes)`, `crc32(...)`, `interface ZipEntry { name; data }` | stored (uncompressed) ZIP, fixed timestamps: the same files give the same archive |
| `fileName(parts, ext)`, `slug(s, max?)`, `uniqueNames(names)` | |

## storage

| Export | Summary |
|---|---|
| `interface SampleStore { put; get; has; delete; list }` | |
| `class IndexedDbSampleStore(dbName)`, `class MemorySampleStore` | |
| `sampleFromBytes(bytes, name, type?)` → `StoredSample`, `sha256Hex(bytes)` | id = SHA-256 of the bytes |
| `class StorageError { code: 'quota' \| 'unavailable' \| 'failed' }` | |
| `writeBundle(app, projectFile, samples)`, `readBundle(bytes, app)` → `BundleContents { manifest; projectText; samples; problems }`, `BUNDLE_FORMAT`, `BUNDLE_VERSION` | portable project bundles |

## midi

Types only: `MidiPortInfo`, `MidiOutputPort`, `MidiInputPort`, `ClockSource`,
`ClockFollower`, `LearnableParameter`, `ParameterRegistry`, `LearnMapping`. No implementation
(see `docs/MIDI-ROADMAP.md`).

## palette

Colour palettes: a cosmetic layer over CSS custom properties. An application declares its roles;
everything else is shared, so palettes behave, persist and exchange alike in every application.

| Export | Summary |
|---|---|
| `interface PaletteRole { id; label; help; css; contrast?; from?; area? }` | one colour role = one CSS custom property; `from`: the role it follows when a palette leaves it out; `area`: redefines `--ink` and the 1-bit fills inside `[data-area="<id>"]` |
| `interface PaletteConfig { app; roles; builtIns; accept?; extraCss? }` | `app` names the storage keys (`<app>.palette.*`) and the file format (`<app>-palette`); the first built-in is the default; `accept`: other applications' formats to import |
| `SHARED_ROLES` | `desktop`, `paper`, `ink`, `dim`, `activity`, `selection` |
| `SHARED_PRESETS`, `ATARI`, `DARK`, `AMBER`, `GREEN_SCREEN`, `C64`, `PHOSPHOR`, `PINK_NOISE`, `RAVE`, `PAPER` | built-in palettes in the shared roles (`ATARI`, id `classic`, is the original black and white) |
| `paletteCss(config, colors)`, `applyPalette(config, colors, doc?)`, `isDefaultPalette(config, colors)`, `completeColors(config, partial)`, `SWAP_INK_PAPER` | the style sheet (one `<style id="<app>-palette">`); other than the default palette, marks use `--mark-color` / `--mark-blend` |
| `normHex(v)`, `luminance(hex)`, `contrast(a, b)`, `contrastWarnings(config, colors)` | WCAG contrast; warnings never change a colour |
| `exportPalette(config, p)`, `importPalette(config, text)` → `ImportResult { name; colors; filled; ignored }`, `class PaletteError`, `PALETTE_VERSION`, `paletteFormat(config)` | palette files: `{ format, version, name, colors }` |
| `class PaletteLibrary(config, store?)`: `all()`, `find`, `selected`, `select`, `duplicate`, `setColor`, `rename`, `remove`, `addImported`, `resetToDefault()`, `builtIns`, `custom` | preferences; built-ins are never edited (editing makes a copy) |
| `paletteEditor(host, lib, { apply?, save?, open?, onChange? })` → `{ refresh(); reset(); width; height }`, `PALETTE_EDITOR_WIDTH` | the palette editor, mounted into an element the application provides (drawn with the shared class names `label`, `box`, `mtext`, `mbutton`, `inv`) |
