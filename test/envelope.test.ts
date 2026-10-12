/**
 * Fades scheduled ahead start from the level the note really has at that time. (Before 0.2.0
 * a release or stop scheduled in advance ramped from the note's start, because
 * cancelAndHoldAtTime adds no hold point when no ramp is in progress.)
 */
import { describe, expect, it } from 'vitest';
import { fadeOut, GainEnvelope } from '../src/audio/instrument';
import { SampleInstrument } from '../src/sampler/instrument';
import { defaultZone } from '../src/sampler/zone';
import { asBuffer, asCtx, FakeBuffer, FakeContext, FakeParam, type FakeGain } from './fakeAudio';

describe('gain envelope', () => {
  it('follows jumps and linear ramps like an AudioParam', () => {
    const e = new GainEnvelope().set(1, 0).ramp(1.01, 0.8).set(2, 0.8).ramp(2.5, 0);
    expect(e.at(0.5)).toBe(0);
    expect(e.at(1.005)).toBeCloseTo(0.4, 12);
    expect(e.at(1.5)).toBeCloseTo(0.8, 12);
    expect(e.at(2.25)).toBeCloseTo(0.4, 12);
    expect(e.at(3)).toBe(0);
  });

  it('fadeOut anchors the fade at its own start and updates the envelope', () => {
    const p = new FakeParam(1);
    const e = new GainEnvelope().set(0, 0.6);
    fadeOut(p as unknown as AudioParam, 2, 0.1, e);
    expect(p.events).toEqual([['hold', 0, 2], ['set', 0.6, 2], ['linear', 0, 2.1]]);
    expect(e.at(2.05)).toBeCloseTo(0.3, 12);
    expect(e.at(5)).toBe(0);
  });
});

describe('sample instrument releases scheduled ahead', () => {
  it('a GATED note-off far in the future fades from the held level at the note-off', () => {
    const ctx = new FakeContext();
    const inst = new SampleInstrument(asBuffer(new FakeBuffer(1, 441000, 44100)), { ...defaultZone(), mode: 'gated', release: 0.2 });
    const h = inst.start(asCtx(ctx), ctx.destination as unknown as AudioNode, { time: 1, pitch: 60, velocity: 127 })!;
    h.release(3);
    const g = ctx.of<FakeGain>('gain')[0];
    const peak = g.gain.events[0][1];
    expect(g.gain.events.slice(-3)).toEqual([['hold', 0, 3], ['set', peak, 3], ['linear', 0, 3.2]]);
  });

  it('a stop during a release fades from the partly released level', () => {
    const ctx = new FakeContext();
    const inst = new SampleInstrument(asBuffer(new FakeBuffer(1, 441000, 44100)), { ...defaultZone(), mode: 'gated', release: 1 });
    const h = inst.start(asCtx(ctx), ctx.destination as unknown as AudioNode, { time: 0, pitch: 60, velocity: 127 })!;
    const g = ctx.of<FakeGain>('gain')[0];
    const peak = g.gain.events[0][1];
    h.release(1);
    h.stop(1.5, 0.01);
    expect(g.gain.events.at(-2)?.[0]).toBe('set');
    expect(g.gain.events.at(-2)?.[1]).toBeCloseTo(peak / 2, 12);
    expect(g.gain.events.at(-1)).toEqual(['linear', 0, 1.51]);
  });
});
