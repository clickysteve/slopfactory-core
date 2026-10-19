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
export declare class Auditioner {
    private opts;
    private playing;
    private buffers;
    constructor(opts: AuditionerOptions);
    private ctx;
    private buffer;
    /** Play audio now (stopping any preview still sounding). False if audio is unavailable. */
    play(audio: AudioData | AudioBuffer, opts?: {
        key?: string;
        gain?: number;
    }): Promise<boolean>;
    /** Play a library sample (decoded once and cached by the library). */
    playSample(library: KitLibrary, id: string, opts?: {
        name?: string;
        gain?: number;
    }): Promise<boolean>;
    /** Stop the preview that is sounding, if any. */
    stop(): void;
    get active(): boolean;
    /** Forget cached buffers (after samples are deleted). */
    forget(id?: string): void;
}
