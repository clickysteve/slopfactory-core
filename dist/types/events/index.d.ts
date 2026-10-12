/** The common musical event representation: ticks, tempo maps, notes, voices. */
export { constantTempo, eventsForVoices, lastTick, normaliseTempo, NotePairer, sortEvents, TimeMap, validateTimeline } from './timeline';
export type { ControlEvent, MusicEvent, NoteEvent, TempoChange, TempoMap, Tick, Timeline, TimelineProblem, VoiceInfo } from './timeline';
