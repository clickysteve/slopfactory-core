# Kits and sample libraries

`@slopfactory/core/kits`: one sample and kit management system for every Slop Factory
instrument. Each instrument keeps its own tracks, sequencing, generation, mixing and MIDI;
Core provides the sample library, kits, their storage, a portable kit file, the mapping of a
kit onto an instrument, audition, migration helpers and bundled kits.

```
              application                                   Core (kits)
 ┌───────────────────────────────────┐         ┌──────────────────────────────────────┐
 │ tracks, patterns, generation,     │         │ KitSession   NEW SAVE LOAD … EXPORT  │
 │ playback, mixer, MIDI             │         │      │                               │
 │                                   │  host   │ KitLibrary   samples · kits · prefs  │
 │ view (its own UI) ──────────────▶ │ ◀─────▶ │      │            │                  │
 │ KitHost: targets / capture /      │         │ SampleStore  KitStore   (IndexedDB)  │
 │          apply / signature        │         │ mapKit · archive · Auditioner        │
 └───────────────────────────────────┘         └──────────────────────────────────────┘
```

## 1. What is shared, and what is not

| Core | Each application |
|---|---|
| Sample import (decode to validate, store the original bytes, index), metadata, duplicates (by SHA-256), deletion that never removes a sample still in use | What its tracks are, and which roles they play |
| Kits: create, save, save as, load, rename, duplicate, delete, default, UNSAVED tracking (`KitSession`) | Turning its state into kit instruments and back (`KitHost`) |
| The portable kit file (`.kit.zip`) and its validation | Its own UI (views call the session) |
| Mapping a kit onto an application's targets (`mapKit`) | Policies: what happens to sounds a kit does not cover |
| Storage, schema versioning, migration helpers, bundled kits | Migrating its own older formats (with `migrateOnce`) |
| Audition on the application's AudioContext | Playback, scheduling, voices |

**Why no shared DOM component.** The applications draw incompatible interfaces: The Breakery
draws a fixed-pixel 1-bit screen of absolutely positioned widgets; DOWNBEAT builds flow-layout
dialogs from its own element helpers. (The palette editor, Core's one DOM component, is drawn
in the first style and DOWNBEAT does not use it.) A universal kit component would fit neither,
so Core shares everything except the drawing: the workflow (`KitSession`), its errors and
confirmations (`KitError` codes), mapping reports (`describeMapping`) and audition. Each
application's view is thin (The Breakery's KITS and LIBRARY tabs are 100 to 150 lines each).

## 2. Browser storage belongs to the origin

Two applications served from two addresses (`breakery.…`, `downbeat.…`) cannot read each
other's IndexedDB or localStorage, whatever code they share. So:

* **Shared code, shared format, separate storage.** Each application has its own library in
  its own databases. Nothing is synchronised and there is no server or account.
* **Kits move as files.** EXPORT writes a self-contained `.kit.zip` with the audio; IMPORT reads
  one. A kit exported by one application imports into the other, in any browser.
* Samples are identified by content (SHA-256 of the original bytes), so the same file imported
  into two applications, or twice into one, is the same sample everywhere.

## 3. API

```ts
import { KitLibrary, KitSession, IndexedDbKitStore, mapKit, Auditioner, migrateOnce, installBundledKits } from '@slopfactory/core/kits';
import { IndexedDbSampleStore } from '@slopfactory/core/storage';

const library = new KitLibrary({
  app: 'my-app',                                   // written into exported kits
  audio: new IndexedDbSampleStore('my-app'),       // the application's existing sample store
  store: new IndexedDbKitStore('my-app-kit-library'),
  inUse: () => currentSampleIds(),                 // never deleted while the application uses them
});
const session = new KitSession(library, myHost);   // the kit workflow on the application's state
await session.restore();                           // open the default (or last) kit; or resume()
```

### KitLibrary: samples

| Method | |
|---|---|
| `addSample(bytes, name, type?)` → `{ sample, decoded, duplicate, stored }` | Decodes first (an unsupported or damaged file throws `SampleError`; nothing is stored), stores the original bytes, indexes it. The same audio again is `duplicate`. Without storage: `stored: false`, usable for the visit. |
| `importFiles(files, onProgress?)` → `{ added, duplicates, errors }` | One file at a time, yielding to the browser between files. A full disk stops the rest (reported). |
| `listSamples()`, `getSample(id)`, `readSample(id)` | Metadata without audio; `readSample` returns the bytes. |
| `decoded(id, name?)` | Decoded audio, cached (least recently used, 160 MB by default): switching kits does not decode again. `KitError('missing-audio')` if not in this browser. |
| `updateSample(id, { name, description, tags })` | Descriptive metadata. |
| `usage(id)`, `removeSample(id)`, `removeUnused()` | Deleting is refused (`KitError('in-use')`) while a saved kit or the application uses the sample. |
| `indexSample(id, info)` | Index audio already in the store (migration: no decode, no copy). |
| `missing(kit)` | Samples a kit uses that are not in this browser. |

### KitLibrary: kits

| Method | |
|---|---|
| `listKits()` → `KitSummary[]`, `getKit(id)` | |
| `saveKit(data, { audio?, replace? })` | New without `id`, else replaces that kit. A different kit with the same name (case-insensitive) is `KitError('exists')` unless `replace`, after asking the user. `audio` supplies bytes the library may not have (sounds the application synthesised). |
| `createKit(name)`, `renameKit(id, name)`, `duplicateKit(id, name?)` | Duplicates share samples: no audio is copied. |
| `deleteKit(id, { removeUnusedSamples? })` | Samples stay unless asked, and those another kit or the application uses always stay. |
| `replaceSample(kitId, from, to)` | Resolve a missing sample with another. |
| `exportKit(kit, extra?)` → `{ bytes, fileName }` | `KitError('missing-audio')` rather than an incomplete file. |
| `importKit(bytes, { save?, legacy? })` → `{ kit, saved, renamed, added }` | Checks everything first (archive, manifest, fingerprints, that every sample decodes). Then samples join the library (existing ones reused) and, with `save`, the kit is saved (a taken name gets a number). On any failure nothing is kept. |
| `getDefault()`, `setDefault(id)`, `getCurrent()`, `setCurrent(id)`, `getMeta(key)`, `setMeta(key, v)` | Preferences, kept with the library. |

### KitSession and KitHost

```ts
interface KitHost {
  targets(): KitTarget[];                              // what the application can play
  capture(base: KitData | null): Promise<{ instruments; ext?; audio? }>;  // its state as a kit
  apply(kit: KitData, mapping: KitMapping): Promise<void>;                // a kit into its state
  clear(): void | Promise<void>;                       // NEW
  signature(): string;                                 // fingerprint of the sounds, for UNSAVED
}
```

`capture` receives the kit last loaded or saved (`base`): keep its instruments and `ext` data
that this application does not use, so nothing a kit carried is lost by saving it here.
`apply` must prepare everything first (decode with `library.decoded`) and throw before changing
anything.

`KitSession` methods: `newKit`, `save(name?, { replace? })`, `saveAs(name, { replace? })`,
`load(id)` → mapping, `preview(id | kit)` → `{ mapping, missing }`, `importFile(bytes, { open?,
save?, legacy? })`, `exportCurrent(name?)`, `exportSaved(id)`, `rename`, `duplicate`, `delete`,
`setDefault`, `restore()` (open the default or last kit at startup), `resume()` (for an
application whose own saved state already holds the current sounds, such as a project
autosave: take the last kit as current without applying it; UNSAVED compares with the
fingerprint recorded when it was last saved or loaded), `markSaved()`, `onChange(f)`. Read
synchronously: `kits`, `defaultId`, `currentId`, `name`, `dirty`.

Views ask before anything is lost: `dirty` before NEW, LOAD or IMPORT; `KitError('exists')`
before replacing a kit; confirmation before DELETE.

### Errors

`KitError.code`: `invalid`, `not-a-kit`, `version`, `too-large`, `missing-audio`, `damaged`,
`name`, `exists`, `not-found`, `in-use`, `unavailable`. Storage failures are `StorageError`
(`quota`, `unavailable`, `failed`); audio failures `SampleError`. Messages are for the user and
always mean nothing was changed.

### Audition

```ts
const audition = new Auditioner({ context: async () => (await ensureAudio()) ? ctx : null });
await audition.playSample(library, sampleId);
```

One preview at a time, on the application's AudioContext (never a new context per click),
straight to its output: not a note of the sequencer, so the transport, scheduling, playing
voices, MIDI clock and exports are untouched. Resumes a suspended context within the click.
Nodes are disconnected when a preview ends or is replaced; a few AudioBuffers are kept for
repeated previews.

## 4. The model

```ts
interface Kit {                 // in a library (KitData is the portable part)
  id: string;                   // local: not portable
  name: string;                 // 1-64 characters
  description?: string;
  instruments: KitInstrument[];
  ext?: Record<string, unknown>;        // application data, by application id
  created: number; modified: number;
  origin?: { app?: string; bundled?: string };
}
interface KitInstrument {
  role: string;                 // 'kick', 'snare-ghost', … or an application's own 'app:role'
  index?: number;               // which of several of one role (default: their order)
  label?: string;               // "CL HAT 2"
  samples: KitSampleRef[];      // alternates; order matters
  selection?: string;           // how one is chosen: 'auto', 'fixed', 'roundrobin', 'weighted', 'velocity' …
  choke?: { group: string; cuts?: boolean; cutBy?: boolean };   // reserved
  ext?: Record<string, unknown>;
}
interface KitSampleRef {
  sample: string;               // SHA-256 of the original file bytes
  name?: string;
  primary?: boolean;            // the main sample (a FIXED pick)
  weight?: number;              // weighted selection
  velocity?: [number, number];  // reserved: velocity layers
  articulation?: string;        // reserved: articulations
  ext?: Record<string, unknown>;
}
interface LibrarySample { id; name; type; size; added; format; duration?; sampleRate?; channels?; description?; tags? }
```

**Several samples per instrument.** The Breakery already plays several samples per category
(PICK: AUTO, FIXED, RANDOM, ROUND ROBIN, WEIGHTED, VELOCITY, ALTERNATE, PER BAR); DOWNBEAT plays
one per drum sound. The format carries both: `samples` are alternates, `selection` says how one
is chosen, `primary` and `weight` carry the settings, and `velocity`, `articulation` and `choke`
are reserved, so velocity layers, round robin, articulations and choke groups can be added
without a new format version. Core does not play kits: applications do.

**Application data** under `ext[<app id>]` is kept by every other application. DOWNBEAT keeps
each drum sound's zone, transformation and choke there; The Breakery keeps its own sample ids
(for hand-picked hits) there.

## 5. Roles and mapping

`DRUM_ROLES` is a common vocabulary (not a closed list): `kick`, `snare`, `snare-ghost`, `rim`,
`clap`, `tom-high`, `tom-mid`, `tom-low`, `hat-closed`, `hat-pedal`, `hat-open`, `ride`,
`crash`, `cowbell`, `shaker`, `clave`, `conga`, `perc`, `fx`, `unassigned`. An application may
use its own roles (`app:role`).

An application declares **targets**: `{ id, role, index?, label?, capacity?, accepts? }`.
`mapKit(kit, targets)`:

1. **Same role.** A target that holds one sample takes the instrument of its role with the same
   index (SNARE step 2 takes the second snare). A target with `capacity: Infinity` takes every
   instrument of its role.
2. **Alternates.** A target still without a sound takes the first unused instrument of the roles
   it `accepts`, in order (DOWNBEAT's CLAP accepts PERC); an unlimited target takes all of them.
3. **Capacity.** A target plays at most `capacity` samples (primary first).

What could not be placed is reported, never dropped: `unmapped` lists instruments with no
target (`no-target`) and samples beyond a target's capacity (`capacity`); `empty` lists targets
the kit had nothing for. `describeMapping` turns it into lines for the user. Applications keep
unmapped instruments in the kit (and their samples are in the library), so a kit passed through
an application with fewer roles comes back whole.

| A kit from The Breakery in DOWNBEAT | |
|---|---|
| KICK, SNARE, LOW / MID / HIGH TOM, CLOSED HAT, OPEN HAT, CRASH, RIDE | the drum sounds of those roles |
| PERC | the first drum sound accepting it (CLAP in the default kit) |
| HAT with several samples | the first plays on CL HAT 1; the others stay in the kit |
| GHOST SNARE | no drum sound: kept in the kit and the library |

| A kit from DOWNBEAT in The Breakery | |
|---|---|
| each drum sound | the category of its role (both SNAREs into SNARE, as alternates) |
| CLAP, RIM, COWBELL, SHAKER, CLAVE, CONGA | PERC (keeping their role in the kit) |
| PEDAL HAT | HAT |
| a role with no category (FX) | UNSORTED (kept, not played) |

## 6. The portable kit file

A ZIP (stored, readable by any unzip tool), named `<kit name>.kit.zip`:

```
manifest.json
samples/01-kick.wav
samples/02-snare.wav
samples/03-hat.wav
```

```json
{
 "format": "slopfactory-kit",
 "version": 1,
 "generator": { "app": "the-breakery", "core": "0.5.0" },
 "kit": {
  "name": "Jungle Kit",
  "description": "Chopped from my own recordings",
  "instruments": [
   { "role": "kick", "label": "KICK", "samples": [{ "sample": "9f2c…e1", "name": "kick.wav" }] },
   { "role": "snare", "label": "SNARE", "selection": "roundrobin", "samples": [
     { "sample": "41aa…07", "name": "snare 1.wav" },
     { "sample": "c3d0…9b", "name": "snare 2.wav", "weight": 2 } ] },
   { "role": "hat-closed", "label": "HAT", "samples": [{ "sample": "07be…52", "name": "hat.wav" }],
     "ext": { "downbeat": { "voice": "CL HAT", "step": 0, "zone": { "volume": 0.8 } } } }
  ]
 },
 "samples": [
  { "id": "9f2c…e1", "file": "samples/01-kick.wav", "name": "kick.wav", "type": "audio/wav", "size": 30914, "format": "wav", "duration": 0.35, "sampleRate": 44100, "channels": 1 },
  { "id": "41aa…07", "file": "samples/02-snare-1.wav", "name": "snare 1.wav", "type": "audio/wav", "size": 22094, "format": "wav", "duration": 0.25, "sampleRate": 44100, "channels": 1 }
 ]
}
```

(Ids are shortened here; they are 64 hex characters.) Every sample is the **original file's
bytes**, once, however many instruments use it. Browser-local ids (kit ids, database keys)
never appear: a kit file depends on nothing in the browser that wrote it.

**Reading is strict** (archives are untrusted): at most 512 MB, 2048 files, 64 MB per file and
768 MB expanded (a small archive that expands enormously is stopped while expanding); safe
paths only (no `..`, absolute paths, drive letters or backslashes); a valid manifest of a known
format and version (a newer version is refused with a message to update); every sample present
and matching its SHA-256; every sample decodable in this browser. Text is cleaned of control
characters and is only ever displayed as text, never as HTML. Nothing in a kit is executed.

**Versioning.** `version` is 1. A reader refuses newer versions. Additions that older readers
can ignore (new optional fields) do not change the version.

**Legacy files.** `readKitArchive(bytes, { legacy })` passes a Core project bundle
(`slopfactory-bundle`) to the application's converter: The Breakery reads its first release's
`.breakery-kit` files this way.

## 7. Storage

| Where | What |
|---|---|
| The application's `SampleStore` (IndexedDB, existing) | original sample bytes, by SHA-256 |
| `IndexedDbKitStore` (`<app>-kit-library`, schema 1): `kits`, `samples`, `meta` | kits, the sample index (so listing samples never loads audio), preferences, migration records |

* Audio stays where applications already keep it, so existing samples need no copying.
* `KitStore.commit` applies several changes in one IndexedDB transaction: all or none.
* Operations that write audio and then the index undo the audio if the index write fails, so a
  failed or interrupted import leaves nothing half-stored. A full disk is `StorageError('quota')`
  and changes nothing.
* Large audio never goes into localStorage.
* Schema upgrades only add object stores. A database written by a newer schema is refused with a
  message, not changed.

## 8. Migration

`migrateOnce(library, id, run)` runs a migration until it completes:

* It reads the old data and **adds** to the library; the old data is never changed or deleted,
  so a failed migration loses nothing and the previous version of the application still works.
* `step(item, fn)` records each item as it is migrated; a migration interrupted or partly failed
  runs again at the next start without repeating finished items. It is recorded as complete only
  when nothing failed.
* Failures are returned, not thrown: the application starts and says what happened.

The Breakery moves its first release's saved kits (whole bundles in `the-breakery-kits`, a
catalog in localStorage) into its library with the same ids, names, PICK settings, default and
current kit. DOWNBEAT indexes the samples its projects already use. See each application's
`docs/KITS.md`.

## 9. Bundled kits (Keith's kit)

An application can ship kits that are installed on first launch:

```ts
await installBundledKits(library, [{ id: 'keith-acoustic', version: 1, load: () => fetch('kits/keith-acoustic.kit.zip').then(r => r.arrayBuffer()).then(b => new Uint8Array(b)) }]);
```

* Installed once per `id` and `version`. Deleting or renaming it is the user's choice and is
  respected (it is not reinstalled). A new `version` installs alongside, never over, the old one.
* Never over a user's kit: a taken name gets a number.
* It becomes the default kit only if the user has none (`makeDefault: false` to never).
* Core ships no audio. The kit file is an asset of each application (or of a shared kit
  repository the applications copy from), fetched only when it is first installed.

**To add Keith's kit later:** record and edit the one-shots; build the kit in either application
(import the files, assign them, name the kit "Keith", EXPORT) or write the manifest by hand;
put `keith.kit.zip` in each application's `public/kits/`; add
`servedKit('keith', 1, 'keith.kit.zip')` to its `BUNDLED_KITS` list; release. Each application
maps the same file onto its own instruments; nothing in Core changes. See the applications'
`docs/KITS.md` for the exact file.

## 10. Known limitations

* No velocity-layer or round-robin playback in Core (the format reserves the fields; The
  Breakery plays its own PICK modes).
* Kits do not synchronise between applications or browsers: export and import.
* A sample stays in the library until deleted (DELETE UNUSED, or removing it where it is used
  removes it once nothing uses it).
* Decoding happens on the main thread (the browser's `decodeAudioData` is asynchronous;
  Core's WAV/AIFF parser is synchronous per file, and imports yield between files).
* Compressed formats (MP3, OGG, FLAC, M4A) play only where the receiving browser can decode
  them; kits keep the original files.
