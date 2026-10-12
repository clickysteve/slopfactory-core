import { a as lastTick, c as validateTimeline, i as eventsForVoices, n as TimeMap, o as normaliseTempo, r as constantTempo, s as sortEvents, t as NotePairer } from "./chunks/timeline-CjtGBLYv.js";
import "./events.js";
import { n as fadeOut, t as GainEnvelope } from "./chunks/instrument-DxW7d1F9.js";
import { a as FX_PRESETS, c as fxLabel, d as repairFx, i as DRIVE_SHAPES, l as isClean, n as loadOutputFx, o as OUTPUT_STAGE_MODES, r as outputFxAvailable, s as cleanFx, t as createOutputFxNode, u as matchPreset, v as OUTPUT_FX_PROCESSOR } from "./chunks/node-zW3tNMzU.js";
import { a as stripSeed, i as defaultStrip, n as NotePlayer, r as Mixer, t as DEFAULT_CHOKE_FADE } from "./chunks/player-CF_RFAFw.js";
import "./audio.js";
import { _ as region, a as MAX_SAMPLE_SECONDS, b as zoneProblems, c as decodeSample, d as SampleInstrument, f as MIN_LOOP_SECONDS, g as playbackRate, h as parseNoteName, i as MAX_SAMPLE_BYTES, l as toAudioBuffer, m as noteName, n as snapToZeroCrossing, o as SampleError, p as defaultZone, r as waveformPeaks, s as browserDecode, t as peakOf, u as STOP_FADE_SECONDS, v as repairZone, y as velocityGain } from "./chunks/sampler-DUA4hguf.js";
import { a as MACRO_INFO, c as repairTransform, d as transformKey, f as OutputFxStream, h as processBuffers, i as applyTransform, l as stretchCharacters, m as createChain, n as WorkerTransformRunner, o as identityTransform, p as SETTINGS_FADE, r as syncRunner, s as isIdentity, t as TransformCache, u as toRecipe } from "./chunks/dsp-Da2HJtmE.js";
import { a as renderLength, i as planRenders, n as MAX_RENDER_SECONDS, o as renderTimeline, r as RenderCancelled, t as EXPORT_SAMPLE_RATE } from "./chunks/render-DoZvXNHM.js";
import { a as levelStats, i as encodeWav16, n as slug, o as wavInfo, r as uniqueNames, t as fileName } from "./chunks/export-DVd1_hi8.js";
import { n as createZip, r as readZip, t as crc32 } from "./chunks/zip-BmWC-HOl.js";
import { a as IndexedDbSampleStore, c as sampleFromBytes, i as writeBundle, l as sha256Hex, n as BUNDLE_VERSION, o as MemorySampleStore, r as readBundle, s as StorageError, t as BUNDLE_FORMAT } from "./chunks/storage-D13ONg_0.js";
import "./midi.js";
//#region src/version.ts
/** The package version, kept equal to package.json by a test (see docs/RELEASING.md). */
var CORE_VERSION = "0.2.0";
//#endregion
export { BUNDLE_FORMAT, BUNDLE_VERSION, CORE_VERSION, DEFAULT_CHOKE_FADE, DRIVE_SHAPES, EXPORT_SAMPLE_RATE, FX_PRESETS, GainEnvelope, IndexedDbSampleStore, MACRO_INFO, MAX_RENDER_SECONDS, MAX_SAMPLE_BYTES, MAX_SAMPLE_SECONDS, MIN_LOOP_SECONDS, MemorySampleStore, Mixer, NotePairer, NotePlayer, OUTPUT_FX_PROCESSOR, OUTPUT_STAGE_MODES, OutputFxStream, RenderCancelled, SETTINGS_FADE, STOP_FADE_SECONDS, SampleError, SampleInstrument, StorageError, TimeMap, TransformCache, WorkerTransformRunner, applyTransform, browserDecode, cleanFx, constantTempo, crc32, createChain, createOutputFxNode, createZip, decodeSample, defaultStrip, defaultZone, encodeWav16, eventsForVoices, fadeOut, fileName, fxLabel, identityTransform, isClean, isIdentity, lastTick, levelStats, loadOutputFx, matchPreset, normaliseTempo, noteName, outputFxAvailable, parseNoteName, peakOf, planRenders, playbackRate, processBuffers, readBundle, readZip, region, renderLength, renderTimeline, repairFx, repairTransform, repairZone, sampleFromBytes, sha256Hex, slug, snapToZeroCrossing, sortEvents, stretchCharacters, stripSeed, syncRunner, toAudioBuffer, toRecipe, transformKey, uniqueNames, validateTimeline, velocityGain, wavInfo, waveformPeaks, writeBundle, zoneProblems };
