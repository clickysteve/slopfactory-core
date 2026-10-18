/**
 * A serial chain of MIDI engines with note safety built in.
 *
 * Engines transform note-ons and channel messages; they never end notes. The chain records, for
 * every note-on it receives, the note-ons that left the chain because of it, and when that note
 * ends (note-off, or note-on with velocity 0) it sends the matching note-offs itself, no
 * earlier than the note-ons they end. So bypassing, removing, reordering or re-configuring an
 * engine while notes are held, or stopping the transport, can never leave a note stuck:
 * whatever an engine did to a note-on, its note-off follows the recorded result.
 *
 * Where two held notes produce the same output note (same channel and key), the output note-off
 * is sent when the last of them ends. System messages (clock, start, stop, song position) pass
 * through untouched, in order.
 *
 * No MIDI engine is built in yet (The Good Bits has no MIDI processing to extract); this is the
 * contract and plumbing that future MIDI engines plug into.
 */
import { repairChainWith, type ChainConfig, type StageConfig } from './chain';
import type { MidiEngineDef, MidiMessage, MidiProcessor } from './types';

export interface MidiEngineLookup {
  midi(id: string): MidiEngineDef | undefined;
}

const isNoteOn = (b: number[]) => (b[0] & 0xf0) === 0x90 && (b[2] ?? 0) > 0;
const isNoteOff = (b: number[]) => (b[0] & 0xf0) === 0x80 || ((b[0] & 0xf0) === 0x90 && (b[2] ?? 0) === 0);
const noteKey = (b: number[]) => (b[0] & 0x0f) * 128 + (b[1] & 0x7f);

interface Stage {
  cfg: StageConfig;
  proc: MidiProcessor | null;
}

export class MidiEngineChain {
  private cfg: ChainConfig;
  private stages: Stage[] = [];
  /** input note -> the output notes it produced, with their note-on times */
  private held = new Map<number, { key: number; time: number }[]>();
  /** output note -> number of input notes holding it */
  private holders = new Map<number, number>();

  constructor(private engines: MidiEngineLookup, config: ChainConfig, private out: (msg: MidiMessage) => void) {
    this.cfg = repairChainWith(config, (id) => this.engines.midi(id));
    this.build();
  }

  get config(): ChainConfig {
    return this.cfg;
  }

  /** Output notes currently sounding. */
  get sounding(): number {
    return this.holders.size;
  }

  private create(s: StageConfig): MidiProcessor | null {
    return this.engines.midi(s.engine)?.createProcessor(s.params) ?? null;
  }

  private build(): void {
    this.stages = this.cfg.stages.map((s) => ({ cfg: s, proc: this.create(s) }));
  }

  /** Change the chain. Held notes keep their recorded outputs and end correctly. */
  set(config: ChainConfig): void {
    const next = repairChainWith(config, (id) => this.engines.midi(id));
    const old = new Map(this.stages.map((s) => [s.cfg.id, s]));
    this.cfg = next;
    this.stages = next.stages.map((c) => {
      const prev = old.get(c.id);
      if (prev && prev.cfg.engine === c.engine && prev.proc) {
        if (JSON.stringify(prev.cfg.params) === JSON.stringify(c.params) || prev.proc.update?.(c.params)) return { cfg: c, proc: prev.proc };
      }
      return { cfg: c, proc: this.create(c) };
    });
  }

  private run(msg: MidiMessage): MidiMessage[] {
    let msgs = [msg];
    if (this.cfg.bypass) return msgs;
    for (const s of this.stages) {
      if (!s.cfg.enabled || !s.proc) continue;
      const next: MidiMessage[] = [];
      // engines may not end notes: the chain does that
      for (const m of msgs) s.proc.process(m, (o) => !isNoteOff(o.bytes) && next.push({ bytes: [...o.bytes], time: o.time }));
      msgs = next;
    }
    return msgs;
  }

  private release(input: number, time: number): void {
    const outs = this.held.get(input);
    if (!outs) return;
    this.held.delete(input);
    for (const o of outs) {
      const n = (this.holders.get(o.key) ?? 1) - 1;
      if (n > 0) {
        this.holders.set(o.key, n);
        continue;
      }
      this.holders.delete(o.key);
      this.out({ bytes: [0x80 | Math.floor(o.key / 128), o.key % 128, 0], time: Math.max(time, o.time) });
    }
  }

  /** Send one message into the chain. */
  send(msg: MidiMessage): void {
    const b = msg.bytes;
    if (!b.length) return;
    if (b[0] >= 0xf0) {
      this.out({ bytes: [...b], time: msg.time });
      return;
    }
    if (isNoteOff(b)) {
      this.release(noteKey(b), msg.time);
      return;
    }
    if (!isNoteOn(b)) {
      for (const m of this.run(msg)) this.out(m);
      return;
    }
    const input = noteKey(b);
    // a retrigger ends the sounding note first (MIDI pairing)
    this.release(input, msg.time);
    const outs: { key: number; time: number }[] = [];
    for (const m of this.run(msg)) {
      if (isNoteOn(m.bytes)) {
        const k = noteKey(m.bytes);
        outs.push({ key: k, time: m.time });
        this.holders.set(k, (this.holders.get(k) ?? 0) + 1);
      }
      this.out(m);
    }
    if (outs.length) this.held.set(input, outs);
  }

  /** End every note the chain started (no earlier than its note-on) and reset the engines. */
  panic(time: number): void {
    for (const input of [...this.held.keys()]) this.release(input, time);
    for (const s of this.stages) s.proc?.reset?.();
  }

  /** Transport stop: the same as panic. */
  stop(time: number): void {
    this.panic(time);
  }
}
