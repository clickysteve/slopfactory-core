/** Instruments, audio routing (the mixer) and note playback, for any BaseAudioContext. */
export { fadeOut, GainEnvelope } from './instrument';
export type { Instrument, NoteHandle, NoteRequest } from './instrument';
export { defaultStrip, Mixer, stripSeed } from './mixer';
export type { MixerOptions, StripSettings } from './mixer';
export { DEFAULT_CHOKE_FADE, NotePlayer } from './player';
export type { ChokeSettings, NotePlayerOptions, NoteStart, ResolveChoke, ResolveInstrument } from './player';
