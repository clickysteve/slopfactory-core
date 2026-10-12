/** Instruments, audio routing (the mixer) and note playback, for any BaseAudioContext. */
export { fadeOut } from './instrument';
export type { Instrument, NoteHandle, NoteRequest } from './instrument';
export { defaultStrip, Mixer, stripSeed } from './mixer';
export type { MixerOptions, StripSettings } from './mixer';
export { NotePlayer } from './player';
export type { NoteStart, ResolveInstrument } from './player';
