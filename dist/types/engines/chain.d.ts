/**
 * Output-chain configuration and its headless controller.
 *
 * A chain is a straightforward serial list of stages: SOURCE -> stage 1 -> stage 2 -> ... ->
 * OUTPUT. A configuration is plain JSON (engine ids, order, enabled state, parameter values),
 * safe to store in any application's settings or project file; it never contains AudioNodes or
 * other browser objects.
 *
 * A stage whose engine the application does not have (a project from another application, or
 * an engine removed since) is kept, unchanged, as an unavailable stage: it passes audio through,
 * the interface can show and remove it, and saving the configuration does not lose it.
 */
import { type OutputFxSettings } from '../dsp/output/settings';
import { type ParamDef, type ParamValue, type ParamValues } from './params';
import type { EngineRegistry } from './registry';
import type { AudioEngineDef } from './types';
export declare const CHAIN_VERSION = 1;
/** Stages a chain may hold. */
export declare const MAX_STAGES = 8;
export interface StageConfig {
    /** stable within its chain ("s1", "s2", ...): survives reordering */
    id: string;
    /** engine id */
    engine: string;
    /** false = bypassed (settings kept) */
    enabled: boolean;
    params: ParamValues;
    /** the engine version the parameters were written for */
    v?: number;
}
export interface ChainConfig {
    version: number;
    /** bypass the whole chain (settings kept) */
    bypass: boolean;
    stages: StageConfig[];
}
export declare const emptyChain: () => ChainConfig;
/** Engine lookup the chain needs (an EngineRegistry, or anything with the same method). */
export interface AudioEngineLookup {
    audio(id: string): AudioEngineDef | undefined;
}
/**
 * A valid configuration from stored data: missing or broken fields filled, parameters of known
 * engines validated, stages of unknown engines kept as they are, duplicate ids renumbered,
 * at most MAX_STAGES stages. Never throws.
 */
export declare function repairChain(src: unknown, engines?: AudioEngineLookup): ChainConfig;
/** repairChain with any engine lookup (MIDI chains use their MIDI engines). */
export declare function repairChainWith(src: unknown, find: (id: string) => {
    params: readonly ParamDef[];
    version: number;
} | undefined): ChainConfig;
/** Does the chain change audio at all? (False: nothing enabled, or bypassed.) */
export declare function chainActive(c: ChainConfig, engines?: AudioEngineLookup): boolean;
/** Stages whose engine is not in `engines` (shown as unavailable). */
export declare function unavailableStages(c: ChainConfig, engines: AudioEngineLookup): StageConfig[];
/**
 * The seed each stage's kernel gets: the chain seed for the first stage of each engine, a
 * derived one for further stages of the same engine. A stage's seed therefore does not change
 * when stages of other engines are added, removed or moved.
 */
export declare function stageSeeds(c: ChainConfig, seed: number): number[];
/** A named starting point for a whole chain. */
export interface ChainPreset {
    key: string;
    label: string;
    description: string;
    config: ChainConfig;
}
/**
 * The stages of a combined output-processor setting (Core's OutputFxSettings), in its order:
 * output stage, drive, crunch, tone. Its input and output gain are not stages and are not
 * carried over.
 */
export declare function chainFromFx(fx: OutputFxSettings): ChainConfig;
/** Core's processing presets (CLEAN, 12-BIT, BITCRUSH, ...) as chains. */
export declare const CHAIN_PRESETS: readonly ChainPreset[];
/** Presets whose every engine is available. */
export declare function presetsFor(engines: AudioEngineLookup, presets?: readonly ChainPreset[]): ChainPreset[];
/** Which preset (if any) a configuration currently equals (stage ids ignored). */
export declare function matchChainPreset(c: ChainConfig, presets?: readonly ChainPreset[]): string | null;
export type ChainListener = (config: ChainConfig) => void;
/**
 * A headless controller for one chain: the operations an interface needs, validated against
 * the application's registry, with change notifications. It holds no audio; applications pass
 * `config` to a chain node (live), to the renderer (export) and to their settings storage.
 * Every change produces a new configuration object (the old one is never mutated).
 */
export declare class OutputChain {
    readonly registry: EngineRegistry;
    readonly maxStages: number;
    private cfg;
    private listeners;
    constructor(registry: EngineRegistry, config?: unknown, maxStages?: number);
    get config(): ChainConfig;
    get stages(): readonly StageConfig[];
    /** The audio engines the application offers, in its order. */
    available(): AudioEngineDef[];
    stage(id: string): StageConfig | undefined;
    /** The stage's engine, or undefined when it is unavailable in this application. */
    engine(stage: StageConfig | string): AudioEngineDef | undefined;
    get canAdd(): boolean;
    subscribe(fn: ChainListener): () => void;
    private commit;
    private mapStage;
    /** Add a stage with the engine's defaults (at the end, or at `index`). Returns its id. */
    add(engineId: string, index?: number): string | null;
    remove(id: string): boolean;
    /** Move a stage to a new position (clamped). */
    moveTo(id: string, index: number): boolean;
    /** Move a stage up (-1) or down (+1). */
    move(id: string, delta: number): boolean;
    /** Swap a stage's engine for another (same position and enabled state, the new engine's defaults). */
    replace(id: string, engineId: string): boolean;
    setEnabled(id: string, enabled: boolean): boolean;
    /** Set one parameter (validated: clamped, rounded, or refused for unknown parameters). */
    setParam(id: string, param: string, value: ParamValue): boolean;
    setParams(id: string, patch: Partial<ParamValues>): boolean;
    /** Back to the engine's defaults. */
    resetParams(id: string): boolean;
    /** Apply one of the stage's engine presets. */
    applyEnginePreset(id: string, key: string): boolean;
    /** Bypass (or restore) the whole chain. */
    setBypass(bypass: boolean): void;
    /** Replace the configuration (validated). */
    load(config: unknown): void;
    /** Replace the stages with a preset's (only if every engine it uses is available). */
    applyPreset(preset: ChainPreset): boolean;
    clear(): void;
}
