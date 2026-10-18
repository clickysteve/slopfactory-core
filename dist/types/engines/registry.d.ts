import type { AudioEngineDef, EngineDef, MidiEngineDef } from './types';
/** Problems with an engine definition (empty when it is usable). */
export declare function checkEngine(def: EngineDef): string[];
export interface EngineFilter {
    kind?: 'audio' | 'midi';
}
export declare class EngineRegistry {
    private defs;
    constructor(defs?: Iterable<EngineDef>);
    /** Add an engine. Throws on an invalid definition or a duplicate id. */
    register(def: EngineDef): this;
    /** Remove an engine (configurations that use it keep it as unavailable). */
    unregister(id: string): boolean;
    has(id: string): boolean;
    get(id: string): EngineDef | undefined;
    audio(id: string): AudioEngineDef | undefined;
    midi(id: string): MidiEngineDef | undefined;
    /** Engines in registration order. */
    list(filter?: EngineFilter): EngineDef[];
    /** A new registry with only these engines (in this registry's order); unknown ids are ignored. */
    only(ids: Iterable<string>): EngineRegistry;
}
/** A fresh registry of the built-in engines (all of them, or only `ids`). */
export declare function coreEngines(ids?: Iterable<string>): EngineRegistry;
