/**
 * The MIDI engine chain. No MIDI engine is built in (The Good Bits has none), so these tests use
 * small fixture engines defined here only.
 */
import { describe, expect, it } from 'vitest';
import { EngineRegistry, MidiEngineChain, type ChainConfig, type MidiEngineDef, type MidiMessage } from '../src/engines';

const MIDI = { kind: 'midi', inputs: ['midi'], outputs: ['midi'], version: 1, description: 'test fixture' } as const;

const transpose: MidiEngineDef = {
  ...MIDI,
  id: 'test.transpose',
  name: 'Transpose',
  params: [{ id: 'semis', type: 'integer', label: 'Semitones', min: -24, max: 24, default: 0 }],
  createProcessor(p) {
    let semis = Number(p.semis);
    return {
      process: (m, emit) => emit((m.bytes[0] & 0xf0) === 0x90 ? { ...m, bytes: [m.bytes[0], m.bytes[1] + semis, m.bytes[2]] } : m),
      update: (q) => ((semis = Number(q.semis)), true),
    };
  },
};

/** Sends each note-on twice: once as is, once an octave up 10 ms later. */
const octaver: MidiEngineDef = {
  ...MIDI,
  id: 'test.octaver',
  name: 'Octaver',
  params: [],
  createProcessor: () => ({
    process(m, emit) {
      emit(m);
      if ((m.bytes[0] & 0xf0) === 0x90) emit({ bytes: [m.bytes[0], m.bytes[1] + 12, m.bytes[2]], time: m.time + 10 });
    },
  }),
};

/** A broken engine that tries to end notes itself (the chain ignores that). */
const rogue: MidiEngineDef = {
  ...MIDI,
  id: 'test.rogue',
  name: 'Rogue',
  params: [],
  createProcessor: () => ({ process: (m, emit) => (emit(m), emit({ bytes: [0x80, 60, 0], time: m.time })) }),
};

const registry = new EngineRegistry([transpose, octaver, rogue]);
const cfg = (...stages: [string, string, Record<string, number>, boolean?][]): ChainConfig => ({ version: 1, bypass: false, stages: stages.map(([id, engine, params, enabled = true]) => ({ id, engine, params, enabled })) });

function setup(c: ChainConfig) {
  const sent: MidiMessage[] = [];
  const chain = new MidiEngineChain(registry, c, (m) => sent.push(m));
  return { chain, sent, bytes: () => sent.map((m) => [...m.bytes, m.time]) };
}

describe('MidiEngineChain', () => {
  it('transforms note-ons and keeps channel, velocity and timing', () => {
    const { chain, bytes } = setup(cfg(['s1', 'test.transpose', { semis: 5 }]));
    chain.send({ bytes: [0x93, 60, 101], time: 1000 });
    chain.send({ bytes: [0x83, 60, 0], time: 1500 });
    expect(bytes()).toEqual([
      [0x93, 65, 101, 1000],
      [0x83, 65, 0, 1500],
    ]);
  });

  it('ends exactly the notes a note-on produced, never before their note-on', () => {
    const { chain, bytes } = setup(cfg(['s1', 'test.octaver', {}]));
    chain.send({ bytes: [0x90, 48, 90], time: 0 });
    chain.send({ bytes: [0x90, 48, 0], time: 5 }); // velocity-0 note-off, before the delayed octave
    expect(bytes()).toEqual([
      [0x90, 48, 90, 0],
      [0x90, 60, 90, 10],
      [0x80, 48, 0, 5],
      [0x80, 60, 0, 10],
    ]);
  });

  it('changing or bypassing engines while notes are held leaves no note stuck', () => {
    const { chain, sent } = setup(cfg(['s1', 'test.transpose', { semis: 7 }]));
    chain.send({ bytes: [0x90, 60, 100], time: 0 });
    chain.set(cfg(['s1', 'test.transpose', { semis: -3 }]));
    chain.send({ bytes: [0x90, 62, 100], time: 1 });
    chain.set({ ...cfg(['s1', 'test.transpose', { semis: 12 }]), bypass: true });
    chain.send({ bytes: [0x90, 64, 100], time: 2 });
    chain.set(cfg()); // engine removed
    chain.send({ bytes: [0x80, 60, 0], time: 3 });
    chain.send({ bytes: [0x80, 62, 0], time: 3 });
    chain.send({ bytes: [0x80, 64, 0], time: 3 });
    const on = sent.filter((m) => m.bytes[0] === 0x90).map((m) => m.bytes[1]);
    const off = sent.filter((m) => m.bytes[0] === 0x80).map((m) => m.bytes[1]);
    expect(on).toEqual([67, 59, 64]);
    expect(off.sort()).toEqual([59, 64, 67]);
    expect(chain.sounding).toBe(0);
  });

  it('panic and transport stop end every held note; engines cannot end notes themselves', () => {
    const { chain, sent } = setup(cfg(['s1', 'test.rogue', {}], ['s2', 'test.octaver', {}]));
    chain.send({ bytes: [0x91, 50, 80], time: 0 });
    chain.send({ bytes: [0x91, 52, 80], time: 0 });
    expect(sent.filter((m) => (m.bytes[0] & 0xf0) === 0x80)).toEqual([]);
    expect(chain.sounding).toBe(4);
    chain.stop(20);
    expect(chain.sounding).toBe(0);
    expect(sent.filter((m) => (m.bytes[0] & 0xf0) === 0x80).map((m) => [m.bytes[1], m.time]).sort()).toEqual([[50, 20], [52, 20], [62, 20], [64, 20]]);
  });

  it('a retrigger ends the sounding note first; shared output notes end with their last holder', () => {
    const { chain, bytes } = setup(cfg(['s1', 'test.octaver', {}]));
    chain.send({ bytes: [0x90, 48, 90], time: 0 }); // 48, 60
    chain.send({ bytes: [0x90, 60, 90], time: 20 }); // 60 (shared), 72
    chain.send({ bytes: [0x80, 48, 0], time: 40 }); // 60 still held by the second note
    expect(bytes().filter((b) => b[0] === 0x80)).toEqual([[0x80, 48, 0, 40]]);
    chain.send({ bytes: [0x90, 60, 70], time: 50 }); // retrigger of input 60
    expect(bytes().filter((b) => b[0] === 0x80).slice(1)).toEqual([
      [0x80, 60, 0, 50],
      [0x80, 72, 0, 50],
    ]);
  });

  it('passes controllers through engines and system messages straight through', () => {
    const { chain, bytes } = setup(cfg(['s1', 'test.transpose', { semis: 2 }]));
    chain.send({ bytes: [0xb0, 64, 127], time: 0 });
    chain.send({ bytes: [0xf8], time: 1 });
    chain.send({ bytes: [0xfc], time: 2 });
    expect(bytes()).toEqual([
      [0xb0, 64, 127, 0],
      [0xf8, 1],
      [0xfc, 2],
    ]);
  });

  it('unknown engines pass messages through', () => {
    const { chain, bytes } = setup(cfg(['s1', 'other.arp', {}]));
    chain.send({ bytes: [0x90, 60, 1], time: 0 });
    chain.send({ bytes: [0x80, 60, 0], time: 1 });
    expect(bytes()).toEqual([
      [0x90, 60, 1, 0],
      [0x80, 60, 0, 1],
    ]);
  });
});
