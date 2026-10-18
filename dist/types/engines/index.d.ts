/**
 * Output engines: a plugin contract, registries, parameter descriptions, a serial output chain
 * (configuration, headless controller, block processor, AudioWorklet node) and a note-safe MIDI
 * engine chain. The built-in engines are The Good Bits' output stages and Core's Tone.
 * See docs/OUTPUT-ENGINES.md.
 */
export { defaultParams, formatParam, isValidParam, repairParam, repairParams } from './params';
export type { BooleanParam, ContinuousParam, EnumOption, EnumParam, IntegerParam, ParamDef, ParamValue, ParamValues } from './params';
export type { AudioEngineDef, EngineDef, EnginePreset, Kernel, MidiEngineDef, MidiMessage, MidiProcessor, SignalType } from './types';
export { BUILTIN_AUDIO_ENGINES, CRUNCH_ENGINE, DRIVE_ENGINE, GOOD_BITS_ENGINE_IDS, OUTPUT_STAGE_ENGINE, TONE_ENGINE } from './builtin';
export { checkEngine, coreEngines, EngineRegistry } from './registry';
export type { EngineFilter } from './registry';
export { CHAIN_PRESETS, CHAIN_VERSION, chainActive, chainFromFx, emptyChain, matchChainPreset, MAX_STAGES, OutputChain, presetsFor, repairChain, repairChainWith, stageSeeds, unavailableStages, } from './chain';
export type { AudioEngineLookup, ChainConfig, ChainListener, ChainPreset, StageConfig } from './chain';
export { CHAIN_FADE, ChainStream, renderChain } from './stream';
export type { RenderChainOptions } from './stream';
export { createChainNode, loadOutputChain } from './node';
export type { ChainNode, ChainNodeOptions } from './node';
export { OUTPUT_CHAIN_PROCESSOR } from './constants';
export { registerChainProcessor } from './processor';
export { MidiEngineChain } from './midi';
export type { MidiEngineLookup } from './midi';
