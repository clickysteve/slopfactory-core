/**
 * The instrument interface every sound source implements (the sampler, an application's own
 * synthesiser). An instrument starts one note at a time into a destination node of any
 * BaseAudioContext, so the same instrument code plays live and renders offline.
 */

export interface NoteRequest {
  /** context time in seconds */
  time: number;
  /** MIDI note number */
  pitch: number;
  /** 1..127 */
  velocity: number;
  /** MIDI channel, for instruments whose sound depends on it */
  channel?: number;
}

export interface NoteHandle {
  /** Begin the note's release at `time` (note-off). One-shot notes ignore it. */
  release(time: number): void;
  /**
   * Stop quickly at `time` (panic, voice stealing, choke groups). `fade` is the length of the
   * anti-click fade in seconds; instruments choose its shape and use a short default when it
   * is not given.
   */
  stop(time: number, fade?: number): void;
  /** Context time by which the note is certainly silent (Infinity while held with no end). */
  readonly end: number;
}

export interface Instrument {
  /** Start a note; null when the instrument has nothing to play (muted, no audio). */
  start(ctx: BaseAudioContext, out: AudioNode, note: NoteRequest): NoteHandle | null;
}

/**
 * A record of what was scheduled on a gain AudioParam (jumps and linear ramps), so the level at
 * any time can be computed. The browser cannot be asked for a future automation value, and
 * `cancelAndHoldAtTime` only inserts a hold point when a ramp is in progress, so a fade
 * scheduled ahead needs to know where to start from.
 */
export class GainEnvelope {
  private pts: { t: number; v: number; ramp: boolean }[] = [];

  /** As `setValueAtTime(v, t)`. */
  set(t: number, v: number): this {
    this.pts.push({ t, v, ramp: false });
    return this;
  }

  /** As `linearRampToValueAtTime(v, t)`. */
  ramp(t: number, v: number): this {
    this.pts.push({ t, v, ramp: true });
    return this;
  }

  /** As `cancelScheduledValues(t)`: forget everything at or after `t`. */
  cancel(t: number): this {
    this.pts = this.pts.filter((p) => p.t < t);
    return this;
  }

  /** The scheduled level at time `t` (0 before anything was scheduled). */
  at(t: number): number {
    let i = -1;
    for (let k = 0; k < this.pts.length && this.pts[k].t <= t; k++) i = k;
    const next = this.pts[i + 1];
    if (i < 0) return next?.ramp ? 0 : 0;
    const a = this.pts[i];
    if (next && next.ramp && next.t > a.t) return a.v + ((next.v - a.v) * (t - a.t)) / (next.t - a.t);
    return a.v;
  }
}

/**
 * Ramp a gain to zero, linearly over `seconds`, starting at `time` from the level it has then.
 * `level` is either that level or the note's GainEnvelope (which is updated to include the
 * fade). The fade is anchored with an explicit value at `time`, so it starts at `time` even when
 * it is scheduled long in advance.
 */
export function fadeOut(param: AudioParam, time: number, seconds: number, level: number | GainEnvelope): void {
  const v = typeof level === 'number' ? level : level.at(time);
  const end = time + Math.max(0.001, seconds);
  const p = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => void };
  if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(time);
  else param.cancelScheduledValues(time);
  param.setValueAtTime(v, time);
  param.linearRampToValueAtTime(0, end);
  if (typeof level !== 'number') level.cancel(time).set(time, v).ramp(end, 0);
}
