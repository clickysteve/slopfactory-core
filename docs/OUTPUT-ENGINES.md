# Output engines

`@slopfactory/core/engines` (Core 0.4.0) is the shared output-processing system: a small
plugin contract, registries, parameter descriptions, a serial output chain that runs the same
code live and offline, a headless controller for interfaces, and a note-safe MIDI engine
chain. The first engines are the output stages of **The Good Bits**.

## 1. What was found in The Good Bits

Read from The Good Bits `31a2c16` (version 2.0). Its output processing is one file,
`js/outputstage.js`, applied at export time over whole regions (it has no live audio path):

| Good Bits code | What it is | Category | Became |
|---|---|---|---|
| `applyOutputStage`, `MODE_FACTORIES` (10 modes) | Character stage: per-sample stereo closures (filters, wow/flutter delay, noise, AGC, compression), intensity then mix, seeded noise | A: generic engine (audio) | **Output stage** `goodbits.output-stage` |
| `applyDrive`, `driveShapeFor` | Memoryless saturation, 4 shapes | A: generic engine (audio) | **Drive** `goodbits.drive` |
| `applyCrunch` | Bit-depth quantiser and sample-and-hold rate reduction | A: generic engine (audio) | **Crunch** `goodbits.crunch` |
| `applyLofiChain` | Fixed order: output stage, drive, crunch | the chain | a three-stage output chain |
| `deriveRegionSeed`, CHOP/STRETCH eligibility (`output-scope.js`), export scopes, clean copies | When and to what the chain applies | B: Good Bits' own logic | stays in Good Bits |
| Settings rail (checkboxes, selects, sliders) | Controls | C: interface | stays in Good Bits (now filled from engine metadata) |
| Filters, envelope follower, RNG helpers | Private DSP primitives | D: infrastructure | already in Core (vendored file) |

Not output engines, and not extracted here: the time-stretch engines and STRETCH FX change
duration and need the whole buffer (Core already uses them as *sample transformations*,
`dsp/transform`); PLAY NICE, FLIP and LAB are whole-buffer rearrangement and exploration.
**The Good Bits has no MIDI processing at all**, so no MIDI engine was extracted; the MIDI
contract and chain below exist so future MIDI engines plug in without new plumbing.

Core's existing **Tone** (Good Bits' one-pole low-pass, part of Core's combined output
processor since 0.1.0) is registered too, as `core.tone`.

All four engines operate on **audio** only. None operates on MIDI events, patterns or control
data.

## 2. The built-in engines

| Id | Name | Parameters (id: range, default) | Seeded | Live | Offline |
|---|---|---|---|---|---|
| `goodbits.output-stage` | Output stage | `mode`: Cassette, Reel-to-Reel, Damaged, Vinyl, Boombox, AM Radio, VHS Hi-Fi, Bus Comp, Lathe, Phone Bus (cassette); `mixPct` 0-100 % (100); `intensityPct` 0-100 % (50) | yes | yes | yes |
| `goodbits.drive` | Drive | `type`: Tape, Tube, Diode, Fuzz (tape); `amountPct` 0-100 % (40) | no | yes | yes |
| `goodbits.crunch` | Crunch | `bits` 1-16 (8; 16 = off); `rateDivide` 1-32 (1 = off) | no | yes | yes |
| `core.tone` | Tone | `hz` 200-20000 Hz (8000; 20000 = off) | no | yes | yes |

Parameter ids are Good Bits' own settings fields, and defaults are Good Bits' interface
defaults, so a stored value means the same thing in every application.

With steady parameters, each engine's output is **bit-identical** to the Good Bits function
on the same input and seed, at any block size; a chain of output stage, drive and crunch is
bit-identical to `applyLofiChain` (`test/engines.test.ts`). In Chromium, the chain worklet in
an `OfflineAudioContext` matches `renderChain` to within 1e-6 (`e2e/engines.spec.ts`).

## 3. How it fits together

```
EngineRegistry  (the application's engines, its own object: no global list)
      |
OutputChain     (headless controller: add / remove / move / replace / enable / set / bypass all,
      |          presets, change notifications; holds a ChainConfig)
      |
ChainConfig     (plain JSON: { version, bypass, stages: [{ id, engine, enabled, params, v }] })
   |        \
   |         renderChain(buffers, sampleRate, config, seed)       offline, no Web Audio
   |
createChainNode(ctx, config, { available, seed })   one AudioWorkletNode, live or offline
Mixer({ masterChain })  /  renderTimeline({ masterChain, chainModuleUrl })
```

* **One implementation.** Engines provide block kernels (`createKernel`). `ChainStream` runs
  them; the chain AudioWorklet (`chain-worklet.js`) only moves blocks in and out of a
  `ChainStream`, and `renderChain` runs the same class over buffers. Core's older combined
  processor (`OutputFxSettings`, `createChain`) is built from the same kernels.
* **Changes without clicks.** Smooth parameters (mix, intensity, drive amount) ramp in place
  over 20 ms. Other parameter changes build a new kernel for that stage and crossfade to it
  (512 samples). Enabling or bypassing a stage or the whole chain crossfades between
  processed and dry; adding, removing, reordering or replacing stages crossfades from the old
  chain to the new one. With nothing changing, a disabled stage or a bypassed chain is exactly
  the input.
* **Where it sits.** `Mixer` places a master chain after master processing and before the
  master gain: `master bus -> master processing -> chain -> master gain -> output`. It is only
  built when `MixerOptions.masterChain` is given, so existing graphs are unchanged.
  `renderTimeline` builds it identically for the **master output only**: stems (dry or
  processed) never pass through it.
* **Seeds.** Each stage gets the chain seed (the Mixer uses `stripSeed(seed, 2000)`), or a
  derived seed for a second stage of the same engine, so moving other stages never changes a
  stage's noise. Reset the chain where playback starts (`mixer.resetFx(at)`) to make live
  noise start where an export's does.
* **Unavailable engines.** A configuration may name engines this application does not have.
  `repairChain` keeps such stages unchanged; they pass audio through, `unavailableStages`
  lists them for the interface, and saving keeps them.
* **Limits.** A straightforward serial chain of at most `MAX_STAGES` (8) stages. No sends,
  no parallel routing, no latency compensation (every built-in engine has zero latency).

### Persistence

Store `chain.config` (or any `ChainConfig`) as JSON wherever the application keeps settings;
restore with `repairChain(stored, registry)` or `new OutputChain(registry, stored)`. A
configuration contains engine ids, order, enabled state, parameter values and the engine
version (`v`) each stage was written for; never browser objects.

### Presets

`CHAIN_PRESETS` are Core's processing presets (CLEAN, 12-BIT, BITCRUSH, RATE REDUCE, DRIVE,
CASSETTE, VINYL, AM RADIO) as chains. `presetsFor(registry)` filters out presets that need an
engine the application does not offer. Engines may also carry their own `presets`.

## 4. Using it in an application

```ts
import { coreEngines, loadOutputChain, OutputChain, repairChain } from '@slopfactory/core/engines';
import { Mixer } from '@slopfactory/core/audio';
import chainWorkletUrl from '@slopfactory/core/chain-worklet.js?url';

const registry = coreEngines(['goodbits.output-stage', 'goodbits.drive', 'goodbits.crunch', 'core.tone']);
const chain = new OutputChain(registry, loadFromSettings());           // validated

const available = await loadOutputChain(ctx, chainWorkletUrl);
const mixer = new Mixer(ctx, { voices, fxAvailable, masterChain: chain.config, chainAvailable: available });
chain.subscribe((config) => {
  mixer.setMasterChain(config);   // live, crossfaded
  saveToSettings(config);         // plain JSON
});

// export: the same chain, the same place, master only
await renderTimeline({ ...request, masterChain: chain.config, chainModuleUrl: chainWorkletUrl, fxSeed });

// interface: built from metadata, never from a list of known engines
for (const stage of chain.stages) {
  const def = chain.engine(stage);           // undefined: unavailable here
  for (const p of def?.params ?? []) {
    // p.type: 'continuous' | 'integer' (min, max, step, unit, neutral) | 'boolean' | 'enum' (options)
    // formatParam(p, stage.params[p.id]) gives "40%", "8 bit", "OFF", "Cassette"
  }
}
```

Without a bundler (plain ES modules in the browser, as The Good Bits is), copy
`dist/engines.standalone.js` from a pinned Core commit into the application and import it by
relative path. It is the engines module as one self-contained file with no imports; record
the Core version, commit and file hash next to it and test the hash (as Core does for the
files it vendors).

## 5. Adding an engine

1. **Implement the contract** in `src/engines/` (or, for kernels of new DSP, a file in
   `src/dsp/output/`): metadata, parameter descriptions and `createKernel`.
2. **Register it in Core**: add it to `BUILTIN_AUDIO_ENGINES` (`src/engines/builtin.ts`).
   That also compiles it into `chain-worklet.js`, so it runs live and offline.
3. **Enable it in compatible applications**: add its id to the ids the application passes to
   `coreEngines([...])`. Interfaces built from metadata show it with no other change.

Then add tests (parity with any reference implementation, block-size independence, and the
real-time checks in `test/engines.test.ts`), run `npm run verify`, and release (see
`RELEASING.md`).

A minimal example: **Crunch**, exactly as it is implemented.

```ts
// src/dsp/output/kernels.ts: the DSP, a block kernel (stereo, in place)
export function crunchKernel(p: CrunchParams): Kernel {
  const bits = Math.max(1, Math.min(16, Math.round(p.bits)));
  const rate = Math.max(1, Math.min(32, Math.round(p.rateDivide)));
  const hasBits = bits < 16;
  const hasRate = rate > 1;
  const same = (q) => q.bits === p.bits && q.rateDivide === p.rateDivide;
  if (!hasBits && !hasRate) return { process() {}, update: same };
  const step = 2 / Math.pow(2, bits);
  let index = 0, heldL = 0, heldR = 0;
  return {
    process(L, R, n) {
      for (let k = 0; k < n; k++) {
        if (!hasRate || index % rate === 0) { heldL = L[k]; heldR = R[k]; }
        index++;
        L[k] = hasBits ? Math.fround(Math.round(heldL / step) * step) : heldL;
        R[k] = hasBits ? Math.fround(Math.round(heldR / step) * step) : heldR;
      }
    },
    // false for a real change: the chain builds a new kernel and crossfades to it
    update: same,
  };
}

// src/engines/builtin.ts: the plugin
export const CRUNCH_ENGINE: AudioEngineDef = {
  kind: 'audio', inputs: ['audio'], outputs: ['audio'], realtime: true, offline: true, latency: 0,
  id: 'goodbits.crunch',
  name: 'Crunch',
  version: 1,
  description: 'Bit-depth reduction and sample-and-hold rate reduction, with no anti-alias filter.',
  origin: 'The Good Bits (lo-fi chain, js/outputstage.js)',
  category: 'lo-fi',
  params: [
    { id: 'bits', type: 'integer', label: 'Bit depth', min: 1, max: 16, default: 8, unit: 'bit', neutral: 16 },
    { id: 'rateDivide', type: 'integer', label: 'Rate divide', min: 1, max: 32, default: 1, unit: 'x', neutral: 1 },
  ],
  createKernel: (_sr, p) => crunchKernel({ bits: Number(p.bits), rateDivide: Number(p.rateDivide) }),
};
```

Rules for kernels: causal and bounded (no look-ahead, no whole-buffer reads; those are sample
transformations, not output engines); state from the seed only (never `Math.random()`); no
allocation per sample if you can avoid it; output written as 32-bit floats. Return `true`
from `update()` only for changes the kernel can make smoothly in place.

An application with engines of its own can register them in its registry and render them
offline with `renderChain(..., { engines })`; to run them live it builds its own worklet entry
that calls `registerChainProcessor([...BUILTIN_AUDIO_ENGINES, ...its own])`.

## 6. MIDI engines

A MIDI engine (`kind: 'midi'`) provides `createProcessor(params)` returning
`{ process(msg, emit), update?, reset? }`. `MidiEngineChain` runs MIDI engines in series:

* Engines see note-ons and channel messages; **they never end notes**. The chain records the
  note-ons each input note produced and sends their note-offs itself when the note ends, no
  earlier than the note-ons. Note-offs an engine emits are discarded.
* So bypassing, removing, reordering or re-configuring an engine while notes are held, or
  `stop()` / `panic()`, cannot leave a note stuck. Two held notes mapped to the same output
  note release it with the last of them; a retrigger ends the sounding note first.
* System messages (clock, start, stop, continue, song position) pass straight through.
* Channels, note numbers, velocities and timestamps are whatever the engines emit; with no
  engine (or an unknown one) messages pass unchanged.

There are **no built-in MIDI engines** (none exist in The Good Bits), and no application
routes MIDI through the chain yet. `test/engines-midi.test.ts` exercises it with fixture
engines defined in the test.

## 7. Limitations

* No tempo-synchronised parameter type: no engine has a tempo-dependent parameter yet. Add one
  (with the tempo passed to kernels) when the first such engine arrives.
* Engines registered only by an application need the application's own worklet entry to run
  live (see section 5).
* The chain adds no oversampling or anti-aliasing (neither did Good Bits; crunch aliasing is
  intended).
* A chain is serial; no parallel routing or sends.
