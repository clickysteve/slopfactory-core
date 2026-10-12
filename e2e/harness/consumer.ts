/**
 * Type-level consumer test: compiled by test/package.test.ts against dist/types through the
 * package's "exports", with skipLibCheck off, as an application's TypeScript would see it.
 */
import { CORE_VERSION, renderTimeline, type RenderRequest, type Timeline } from '@slopfactory/core';
import { constantTempo, sortEvents, type NoteEvent } from '@slopfactory/core/events';
import { Mixer, NotePlayer, type Instrument, type NoteHandle } from '@slopfactory/core/audio';
import { defaultZone, SampleInstrument, type SampleZone } from '@slopfactory/core/sampler';
import { cleanFx, FX_PRESETS, identityTransform, type OutputFxSettings, type SampleTransform } from '@slopfactory/core/dsp';
import { EXPORT_SAMPLE_RATE } from '@slopfactory/core/render';
import { createZip, encodeWav16 } from '@slopfactory/core/export';
import { IndexedDbSampleStore, writeBundle, type SampleStore } from '@slopfactory/core/storage';
import type { ClockSource, MidiOutputPort } from '@slopfactory/core/midi';

const version: string = CORE_VERSION;
const zone: SampleZone = defaultZone();
const fx: OutputFxSettings = FX_PRESETS[0].apply(cleanFx());
const t: SampleTransform = identityTransform();
const note: NoteEvent = { type: 'note', tick: 0, duration: 24, voice: 'a', pitch: 60, velocity: 100 };
const timeline: Timeline = { tempo: constantTempo(120, 24), length: 96, voices: [{ id: 'a', name: 'A' }], events: sortEvents([note]) };
const silent: Instrument = { start: (): NoteHandle | null => null };
const request: RenderRequest = { timeline, tailSeconds: 1, master: true, stems: [], resolve: () => silent };
const store: SampleStore = new IndexedDbSampleStore('x');
type Unused = [typeof Mixer, typeof NotePlayer, typeof SampleInstrument, typeof renderTimeline, typeof createZip, typeof encodeWav16, typeof writeBundle, ClockSource, MidiOutputPort];
export const consumer = { version, zone, fx, t, request, store, rate: EXPORT_SAMPLE_RATE } as { version: string } & Record<string, unknown> & { unused?: Unused };
