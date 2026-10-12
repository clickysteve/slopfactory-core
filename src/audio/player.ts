/**
 * The note player: starts and releases notes on voices, live or offline, with one set of
 * rules.
 *
 * - The application resolves which instrument plays a note (`resolve`), so Core never knows
 *   what a voice means.
 * - Notes are addressed by a key. A note-on for a key that is still held first releases it
 *   (MIDI retrigger semantics when the key is "channel:pitch"); a note-off releases the key.
 *   Offline rendering gives every note its own key.
 * - Each voice keeps at most `maxPerVoice` sounding notes; the oldest is stopped to make room.
 * - Optional **choke groups** (`choke`): a note that belongs to a group can cut the sounding
 *   notes of that group, across voices (a closed hat stopping an open hat). Notes without a
 *   group are never cut, so nothing changes unless the application assigns groups.
 */
import type { Instrument, NoteHandle, NoteRequest } from './instrument';
import type { Mixer } from './mixer';

export interface NoteStart extends NoteRequest {
  /** the application's instrument assignment key, if the note has one */
  instrument?: string;
}

export type ResolveInstrument = (voice: string, note: NoteStart) => Instrument | null;

/**
 * Choke-group membership of one note. Notes of the same `group` interact; a group is not tied
 * to a voice, so sounds on different voices (or the same voice) can choke each other.
 */
export interface ChokeSettings {
  /** group name; notes interact only within a group */
  group: string;
  /** starting this note cuts the group's sounding notes (default true) */
  cuts?: boolean;
  /** this note can be cut by later notes of its group (default true) */
  cutBy?: boolean;
  /** anti-click fade, seconds, given to the notes this one cuts (default 0.005) */
  fade?: number;
}

/** Which choke group a note belongs to, if any (null: none, the default behaviour). */
export type ResolveChoke = (voice: string, note: NoteStart) => ChokeSettings | null | undefined;

export const DEFAULT_CHOKE_FADE = 0.005;

interface Active {
  handle: NoteHandle;
  start: number;
}

export interface NotePlayerOptions {
  maxPerVoice?: number;
  choke?: ResolveChoke;
}

export class NotePlayer {
  private held = new Map<string, NoteHandle>();
  private sounding = new Map<string, Active[]>();
  /** notes that can be cut, per choke group */
  private chokable = new Map<string, Active[]>();
  private chokeOf: ResolveChoke | undefined;
  maxPerVoice: number;

  constructor(readonly ctx: BaseAudioContext, readonly mixer: Mixer, private resolve: ResolveInstrument, opts: NotePlayerOptions = {}) {
    this.maxPerVoice = opts.maxPerVoice ?? 32;
    this.chokeOf = opts.choke;
  }

  noteOn(key: string, voice: string, note: NoteStart): boolean {
    this.noteOff(key, note.time);
    const inst = this.resolve(voice, note);
    if (!inst) return false;
    const choke = this.chokeOf?.(voice, note) ?? null;
    if (choke) this.cut(choke, note.time);
    const list = (this.sounding.get(voice) ?? []).filter((a) => a.handle.end > note.time);
    while (list.length >= this.maxPerVoice) list.shift()!.handle.stop(note.time);
    const handle = inst.start(this.ctx, this.mixer.input(voice), note);
    if (!handle) {
      this.sounding.set(voice, list);
      return false;
    }
    const active = { handle, start: note.time };
    list.push(active);
    this.sounding.set(voice, list);
    this.held.set(key, handle);
    if (choke && choke.cutBy !== false && choke.group) {
      const group = (this.chokable.get(choke.group) ?? []).filter((a) => a.handle.end > note.time);
      group.push(active);
      this.chokable.set(choke.group, group);
    }
    return true;
  }

  /**
   * Apply a note's choke without playing it. Offline rendering uses this for notes of voices
   * that are not part of the current render pass, so a stem rendered on its own is cut
   * exactly as it is in the full mix.
   */
  chokeOnly(voice: string, note: NoteStart): void {
    if (!this.chokeOf || !this.resolve(voice, note)) return;
    const choke = this.chokeOf(voice, note);
    if (choke) this.cut(choke, note.time);
  }

  /** Cut the sounding notes of the group that started before `time`. Notes starting at the same time are kept. */
  private cut(choke: ChokeSettings, time: number): void {
    if (choke.cuts === false || !choke.group) return;
    const list = this.chokable.get(choke.group);
    if (!list) return;
    const fade = choke.fade ?? DEFAULT_CHOKE_FADE;
    const keep: Active[] = [];
    for (const a of list) {
      if (a.handle.end <= time) continue;
      if (a.start < time) a.handle.stop(time, fade);
      else keep.push(a);
    }
    this.chokable.set(choke.group, keep);
  }

  noteOff(key: string, time: number): void {
    const h = this.held.get(key);
    if (!h) return;
    this.held.delete(key);
    h.release(time);
  }

  /** Release every held note (one-shots ring on). */
  releaseAll(time: number): void {
    for (const h of this.held.values()) h.release(time);
    this.held.clear();
  }

  /** Stop everything quickly, one-shots included (panic). */
  stopAll(time: number): void {
    for (const list of this.sounding.values()) for (const a of list) a.handle.stop(time);
    this.sounding.clear();
    this.held.clear();
    this.chokable.clear();
  }

  /** Notes still sounding at `time`, per voice. */
  activeCount(voice: string, time: number): number {
    return (this.sounding.get(voice) ?? []).filter((a) => a.handle.end > time).length;
  }
}
