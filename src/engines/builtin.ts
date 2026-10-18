/**
 * The built-in audio engines: The Good Bits' three output stages (its lo-fi chain: OUTPUT
 * STAGE, DRIVE, CRUNCH), with Good Bits' own parameter names, ranges, defaults and labels, and
 * Core's TONE (Good Bits' one-pole low-pass, already part of Core's combined processor).
 *
 * Parameter ids are Good Bits' settings field names, so a value means the same thing in every
 * application and in Good Bits' own settings.
 */
import { crunchKernel, driveKernel, outputStageKernel, toneKernel } from '../dsp/output/kernels';
import { DRIVE_TYPES, OUTPUT_STAGES } from '../dsp/vendor/goodbits/js/outputstage.js';
import type { AudioEngineDef } from './types';

const AUDIO = { kind: 'audio', inputs: ['audio'], outputs: ['audio'], realtime: true, offline: true, latency: 0 } as const;
const GOOD_BITS = 'The Good Bits (lo-fi chain, js/outputstage.js)';

export const OUTPUT_STAGE_ENGINE: AudioEngineDef = {
  ...AUDIO,
  id: 'goodbits.output-stage',
  name: 'Output stage',
  version: 1,
  description: 'A character mode (filters, wow and flutter, noise, compression) blended by intensity and mix.',
  origin: GOOD_BITS,
  category: 'character',
  seeded: true,
  params: [
    {
      id: 'mode',
      type: 'enum',
      label: 'Character',
      default: 'cassette',
      options: OUTPUT_STAGES.filter((s) => s.key !== 'clean').map((s) => ({ value: s.key, label: s.label, description: s.description })),
    },
    { id: 'mixPct', type: 'continuous', label: 'Mix', min: 0, max: 100, step: 1, default: 100, unit: '%', smooth: true, description: 'Final wet/dry blend' },
    { id: 'intensityPct', type: 'continuous', label: 'Intensity', min: 0, max: 100, step: 1, default: 50, unit: '%', smooth: true, description: 'How strongly the mode differs from the dry signal' },
  ],
  createKernel: (sr, p, seed) => outputStageKernel(sr, { mode: String(p.mode), mixPct: Number(p.mixPct), intensityPct: Number(p.intensityPct) }, seed),
};

export const DRIVE_ENGINE: AudioEngineDef = {
  ...AUDIO,
  id: 'goodbits.drive',
  name: 'Drive',
  version: 1,
  description: 'Memoryless saturation: tape (soft), tube (asymmetric), diode (hard clip) or fuzz.',
  origin: GOOD_BITS,
  category: 'saturation',
  params: [
    { id: 'type', type: 'enum', label: 'Type', default: 'tape', options: DRIVE_TYPES.map((d) => ({ value: d.key, label: d.label, description: d.description })) },
    { id: 'amountPct', type: 'continuous', label: 'Amount', min: 0, max: 100, step: 1, default: 40, unit: '%', neutral: 0, smooth: true },
  ],
  createKernel: (sr, p) => driveKernel(sr, { type: String(p.type), amountPct: Number(p.amountPct) }),
};

export const CRUNCH_ENGINE: AudioEngineDef = {
  ...AUDIO,
  id: 'goodbits.crunch',
  name: 'Crunch',
  version: 1,
  description: 'Bit-depth reduction and sample-and-hold rate reduction, with no anti-alias filter (the aliasing is the sound).',
  origin: GOOD_BITS,
  category: 'lo-fi',
  params: [
    { id: 'bits', type: 'integer', label: 'Bit depth', min: 1, max: 16, default: 8, unit: 'bit', neutral: 16 },
    { id: 'rateDivide', type: 'integer', label: 'Rate divide', min: 1, max: 32, default: 1, unit: 'x', neutral: 1, description: 'Every n-th sample is held for n samples' },
  ],
  createKernel: (_sr, p) => crunchKernel({ bits: Number(p.bits), rateDivide: Number(p.rateDivide) }),
};

export const TONE_ENGINE: AudioEngineDef = {
  ...AUDIO,
  id: 'core.tone',
  name: 'Tone',
  version: 1,
  description: 'A gentle one-pole low-pass (6 dB per octave).',
  origin: 'Slop Factory Core (The Good Bits one-pole low-pass)',
  category: 'filter',
  params: [{ id: 'hz', type: 'continuous', label: 'Cutoff', min: 200, max: 20000, step: 100, default: 8000, unit: 'Hz', neutral: 20000, scale: 'log' }],
  createKernel: (sr, p) => toneKernel(sr, { hz: Number(p.hz) }),
};

/** Every built-in audio engine, in Good Bits' chain order. Immutable. */
export const BUILTIN_AUDIO_ENGINES: readonly AudioEngineDef[] = Object.freeze([OUTPUT_STAGE_ENGINE, DRIVE_ENGINE, CRUNCH_ENGINE, TONE_ENGINE]);

/** The Good Bits' own selection (its original three stages). */
export const GOOD_BITS_ENGINE_IDS: readonly string[] = Object.freeze([OUTPUT_STAGE_ENGINE.id, DRIVE_ENGINE.id, CRUNCH_ENGINE.id]);
