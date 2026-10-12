/**
 * Choke groups in the note player: who cuts whom, when, with which fade, and that nothing
 * changes for notes that have no group (the default, so existing projects are unaffected).
 */
import { describe, expect, it } from 'vitest';
import { cleanFx } from '../src/dsp/output/settings';
import { Mixer } from '../src/audio/mixer';
import { NotePlayer, type ChokeSettings } from '../src/audio/player';
import { SampleInstrument } from '../src/sampler/instrument';
import { defaultZone } from '../src/sampler/zone';
import { asBuffer, asCtx, FakeBuffer, FakeContext, type FakeBufferSource, type FakeGain } from './fakeAudio';

function setup(chokes: Record<string, ChokeSettings | null>, opts: { stereo?: boolean } = {}) {
  const ctx = new FakeContext();
  const mixer = new Mixer(asCtx(ctx), { voices: ['v1', 'v2', 'v3'], fxAvailable: false, strips: { v1: { fx: cleanFx() } } });
  // 2 s one-shot samples (long enough to still be ringing when choked)
  const buf = asBuffer(new FakeBuffer(opts.stereo ? 2 : 1, 88200, 44100));
  const inst = new SampleInstrument(buf, { ...defaultZone(), mode: 'oneshot' });
  const player = new NotePlayer(asCtx(ctx), mixer, () => inst, { choke: (_v, n) => chokes[n.instrument ?? ''] ?? null });
  const srcs = () => ctx.of<FakeBufferSource>('buffer');
  const gains = () => ctx.of<FakeGain>('gain');
  return { ctx, player, srcs, gains };
}

const on = (p: NotePlayer, key: string, voice: string, time: number, instrument: string) => p.noteOn(key, voice, { time, pitch: 60, velocity: 100, instrument });

describe('choke groups', () => {
  it('a closed hat cuts a ringing open hat on another voice, with a short fade', () => {
    const { player, srcs } = setup({ open: { group: 'hh' }, closed: { group: 'hh' } });
    on(player, 'a', 'v1', 0, 'open');
    on(player, 'b', 'v2', 0.5, 'closed');
    const [open, closed] = srcs();
    expect(open.stops.at(-1)).toBeCloseTo(0.5 + 0.005 + 0.001, 9);
    expect(closed.stops).toEqual([]);
  });

  it('nothing is cut without a group (default behaviour unchanged)', () => {
    const { player, srcs } = setup({});
    on(player, 'a', 'v1', 0, 'open');
    on(player, 'b', 'v2', 0.5, 'closed');
    on(player, 'c', 'v1', 0.6, 'open');
    expect(srcs().map((s) => s.stops)).toEqual([[], [], []]);
  });

  it('groups are independent', () => {
    const { player, srcs } = setup({ open: { group: 'hh' }, crash: { group: 'cy' } });
    on(player, 'a', 'v1', 0, 'open');
    on(player, 'b', 'v2', 0.5, 'crash');
    expect(srcs()[0].stops).toEqual([]);
  });

  it('cuts and cut-by are configurable: closed cuts open, open never cuts closed', () => {
    const { player, srcs } = setup({ open: { group: 'hh', cuts: false }, closed: { group: 'hh', cutBy: false } });
    on(player, 'a', 'v1', 0, 'closed');
    on(player, 'b', 'v2', 0.1, 'open');
    on(player, 'c', 'v1', 0.2, 'open'); // open does not cut the earlier open (it never cuts)
    const [closed, open1, open2] = srcs();
    expect(closed.stops).toEqual([]);
    expect(open1.stops).toEqual([]);
    on(player, 'd', 'v3', 0.3, 'closed');
    expect(open1.stops.at(-1)).toBeCloseTo(0.306, 9);
    expect(open2.stops.at(-1)).toBeCloseTo(0.306, 9);
    expect(closed.stops).toEqual([]); // not cut-by
  });

  it('rapid retriggering of one sound in a group cuts the previous hit (one-shot overlap otherwise)', () => {
    const { player, srcs } = setup({ open: { group: 'hh', fade: 0.01 } });
    for (let i = 0; i < 5; i++) on(player, `k${i}`, 'v1', i * 0.02, 'open');
    const s = srcs();
    for (let i = 0; i < 4; i++) expect(s[i].stops.at(-1)).toBeCloseTo((i + 1) * 0.02 + 0.01 + 0.001, 9);
    expect(s[4].stops).toEqual([]);
  });

  it('notes starting at the same instant do not cut each other', () => {
    const { player, srcs } = setup({ open: { group: 'hh' }, closed: { group: 'hh' } });
    on(player, 'a', 'v1', 1, 'open');
    on(player, 'b', 'v2', 1, 'closed');
    expect(srcs().map((s) => s.stops)).toEqual([[], []]);
  });

  it('notes that have already ended are not touched; the fade starts from the current level', () => {
    const { player, srcs, gains } = setup({ open: { group: 'hh' }, closed: { group: 'hh', cutBy: false } });
    on(player, 'a', 'v1', 0, 'open'); // ends at 2 s
    on(player, 'b', 'v2', 3, 'closed');
    expect(srcs()[0].stops).toEqual([]);
    on(player, 'c', 'v1', 4, 'open');
    on(player, 'd', 'v2', 4.25, 'closed');
    const g = gains().filter((x) => x.gain.events.some((e) => e[0] === 'hold' || e[0] === 'cancel'));
    expect(g.length).toBe(1);
    // hold, then an explicit value at the cut time (the fade starts there, not at the note-on)
    expect(g[0].gain.events.slice(-3).map((e) => [e[0], e[2]])).toEqual([['hold', 4.25], ['set', 4.25], ['linear', 4.25 + 0.005]]);
    expect(g[0].gain.events.at(-2)?.[1]).toBeCloseTo(g[0].gain.events[0][1], 12);
  });

  it('works with stereo samples (the fade is on the note gain, before the panner)', () => {
    const { player, srcs, ctx } = setup({ open: { group: 'hh' }, closed: { group: 'hh' } }, { stereo: true });
    on(player, 'a', 'v1', 0, 'open');
    on(player, 'b', 'v1', 0.25, 'closed');
    expect(srcs()[0].stops.at(-1)).toBeCloseTo(0.256, 9);
    expect(ctx.of('panner').length).toBe(3 + 2); // three voice strips, one panner per note
  });

  it('chokeOnly applies a note\'s cut without playing it (stems rendered alone)', () => {
    const { player, srcs } = setup({ open: { group: 'hh' }, closed: { group: 'hh' } });
    on(player, 'a', 'v1', 0, 'open');
    player.chokeOnly('v2', { time: 0.5, pitch: 60, velocity: 100, instrument: 'closed' });
    expect(srcs().length).toBe(1);
    expect(srcs()[0].stops.at(-1)).toBeCloseTo(0.506, 9);
  });

  it('a voice\'s polyphony limit and a choke on another voice are independent', () => {
    const ctx = new FakeContext();
    const mixer = new Mixer(asCtx(ctx), { voices: ['v1', 'v2'], fxAvailable: false });
    const inst = new SampleInstrument(asBuffer(new FakeBuffer(1, 88200, 44100)), { ...defaultZone(), mode: 'oneshot' });
    const player = new NotePlayer(asCtx(ctx), mixer, () => inst, { maxPerVoice: 2, choke: (v) => (v === 'v2' ? { group: 'g' } : null) });
    player.noteOn('a', 'v1', { time: 0, pitch: 60, velocity: 100 });
    player.noteOn('b', 'v1', { time: 0.1, pitch: 60, velocity: 100 });
    player.noteOn('c', 'v2', { time: 0.2, pitch: 60, velocity: 100 }); // v1 has no group: untouched
    expect(ctx.of<FakeBufferSource>('buffer').map((s) => s.stops)).toEqual([[], [], []]);
    player.noteOn('d', 'v1', { time: 0.3, pitch: 60, velocity: 100 }); // steals the oldest v1 note
    expect(ctx.of<FakeBufferSource>('buffer')[0].stops.at(-1)).toBeCloseTo(0.306, 9);
  });
});
