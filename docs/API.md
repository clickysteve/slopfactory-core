# API

The public interface of `@slopfactory/core`, by module. Each module is importable on its own
(`@slopfactory/core/<module>`) or from the root. Full types are in `dist/types/` (generated
from `src/`, which is the reference for every comment and default).

## Runtime files

| Export | What it is | How to load it |
|---|---|---|
| `@slopfactory/core/output-fx-worklet.js` | The output-processing AudioWorklet, self-contained | Pass its URL to `loadOutputFx(ctx, url)` or `renderTimeline({ fxModuleUrl })`. With Vite: `import url from '@slopfactory/core/output-fx-worklet.js?url'`. |
| `@slopfactory/core/transform-worker.js` | The sample-transformation Worker, self-contained | `new WorkerTransformRunner(() => new Worker(url, { type: 'module' }))`. With Vite: `?url` as above. |

Both are plain ES files with no imports, so any bundler that can emit a file and give its URL
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
| `class Mixer(ctx, MixerOptions)` | voice strips and master; `input(voice)`, `processedTap(voice)`, `dryTap(voice)`, `setStrip`, `setMasterFx`, `setMasterGain`, `resetFx(at)`, `processing`, `output`, `dispose()` |
| `interface MixerOptions { voices; strips?; masterFx?; masterGain?; fxAvailable; seed?; dryTaps? }` | |
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

## render

| Export | Summary |
|---|---|
| `renderTimeline(RenderRequest)` → `Promise<RenderResult>` | master and/or stems, aligned, one shared tail |
| `interface RenderRequest { timeline; sampleRate?; tailSeconds; master; stems: StemRequest[]; strips?; masterFx?; masterGain?; fxSeed?; resolve; choke?; masterInsert?; fxModuleUrl?; maxPerVoice?; onControl?; onProgress?; signal?; memoryBudget?; chunkSeconds? }` | |
| `interface StemRequest { voice; processed }` | |
| `interface RenderResult { sampleRate; frames; seconds; musicSeconds; outputs: RenderOutput[]; renders; processed }` | |
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
