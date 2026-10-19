/**
 * Sample audition: hear a sample before assigning it. One preview at a time, on the
 * application's own AudioContext (never a new context per click), straight to its output: it
 * is not an event of the sequencer, so it never touches the transport, scheduling, playing
 * voices, MIDI clock or exports. Each preview's nodes are disconnected when it ends or is
 * replaced.
 */
import type { AudioData } from '../dsp/transform/transform';
import type { KitLibrary } from './library';

export interface AuditionerOptions {
  /** the application's AudioContext, created or resumed on demand (in the click's handler) */
  context: () => AudioContext | null | Promise<AudioContext | null>;
  /** where previews play (default: the context's destination) */
  output?: () => AudioNode | null;
  /** level of previews (default 0.8) */
  gain?: number;
  /** AudioBuffers kept for repeated previews (default 8) */
  keep?: number;
}

export class Auditioner {
  private playing: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private buffers = new Map<string, AudioBuffer>();
  constructor(private opts: AuditionerOptions) {}

  private async ctx(): Promise<AudioContext | null> {
    const ctx = await this.opts.context();
    if (!ctx) return null;
    // a browser starts audio only after a click or key on the page: resume within that gesture
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    return ctx.state === 'closed' ? null : ctx;
  }

  private buffer(ctx: AudioContext, key: string | undefined, audio: AudioData | AudioBuffer): AudioBuffer {
    if (!('channels' in audio)) return audio;
    const hit = key ? this.buffers.get(key) : undefined;
    if (hit && hit.sampleRate === audio.sampleRate) return hit;
    const len = audio.channels[0]?.length ?? 0;
    const buf = ctx.createBuffer(Math.max(1, audio.channels.length), Math.max(1, len), audio.sampleRate);
    audio.channels.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    if (key) {
      this.buffers.delete(key);
      this.buffers.set(key, buf);
      while (this.buffers.size > (this.opts.keep ?? 8)) this.buffers.delete(this.buffers.keys().next().value!);
    }
    return buf;
  }

  /** Play audio now (stopping any preview still sounding). False if audio is unavailable. */
  async play(audio: AudioData | AudioBuffer, opts: { key?: string; gain?: number } = {}): Promise<boolean> {
    const ctx = await this.ctx();
    if (!ctx) return false;
    this.stop();
    const out = this.opts.output?.() ?? ctx.destination;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer(ctx, opts.key, audio);
    const gain = ctx.createGain();
    gain.gain.value = opts.gain ?? this.opts.gain ?? 0.8;
    src.connect(gain);
    gain.connect(out);
    const voice = { src, gain };
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
      if (this.playing === voice) this.playing = null;
    };
    this.playing = voice;
    src.start();
    return true;
  }

  /** Play a library sample (decoded once and cached by the library). */
  async playSample(library: KitLibrary, id: string, opts: { name?: string; gain?: number } = {}): Promise<boolean> {
    const cached = this.buffers.get(id);
    return this.play(cached ?? (await library.decoded(id, opts.name)), { key: id, gain: opts.gain });
  }

  /** Stop the preview that is sounding, if any. */
  stop(): void {
    const p = this.playing;
    if (!p) return;
    this.playing = null;
    try {
      p.src.stop();
    } catch {
      /* not started or already ended */
    }
    p.src.disconnect();
    p.gain.disconnect();
  }

  get active(): boolean {
    return !!this.playing;
  }

  /** Forget cached buffers (after samples are deleted). */
  forget(id?: string): void {
    if (id) this.buffers.delete(id);
    else this.buffers.clear();
  }
}
