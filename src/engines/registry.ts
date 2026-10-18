/**
 * Engine registries. A registry is an ordinary object an application creates and owns (there is
 * no global list): it holds the engines that application supports, in the order its menus show
 * them. `coreEngines()` gives a fresh registry of the built-in engines, optionally restricted to
 * the ones the application can use.
 */
import { BUILTIN_AUDIO_ENGINES } from './builtin';
import { repairParam, type ParamDef } from './params';
import type { AudioEngineDef, EngineDef, MidiEngineDef } from './types';

const ID = /^[a-z0-9][a-z0-9._-]*$/;

/** Problems with an engine definition (empty when it is usable). */
export function checkEngine(def: EngineDef): string[] {
  const errs: string[] = [];
  if (!ID.test(def.id ?? '')) errs.push(`invalid id "${def.id}"`);
  if (!def.name) errs.push('missing name');
  if (!Number.isInteger(def.version) || def.version < 1) errs.push('version must be a positive integer');
  if (def.kind !== 'audio' && def.kind !== 'midi') errs.push(`unknown kind "${(def as { kind: string }).kind}"`);
  if (def.kind === 'audio' && typeof def.createKernel !== 'function') errs.push('audio engines need createKernel');
  if (def.kind === 'midi' && typeof def.createProcessor !== 'function') errs.push('MIDI engines need createProcessor');
  const seen = new Set<string>();
  for (const p of def.params ?? []) {
    if (seen.has(p.id)) errs.push(`duplicate parameter "${p.id}"`);
    seen.add(p.id);
    errs.push(...checkParam(p));
  }
  for (const pr of def.presets ?? []) {
    for (const k of Object.keys(pr.params)) if (!seen.has(k)) errs.push(`preset "${pr.key}" sets unknown parameter "${k}"`);
  }
  return errs;
}

function checkParam(p: ParamDef): string[] {
  const errs: string[] = [];
  if ((p.type === 'continuous' || p.type === 'integer') && !(p.min < p.max)) errs.push(`parameter "${p.id}": min must be below max`);
  if (p.type === 'enum' && !p.options.length) errs.push(`parameter "${p.id}": no options`);
  if (repairParam(p, p.default) !== p.default) errs.push(`parameter "${p.id}": default out of range`);
  return errs;
}

export interface EngineFilter {
  kind?: 'audio' | 'midi';
}

export class EngineRegistry {
  private defs = new Map<string, EngineDef>();

  constructor(defs: Iterable<EngineDef> = []) {
    for (const d of defs) this.register(d);
  }

  /** Add an engine. Throws on an invalid definition or a duplicate id. */
  register(def: EngineDef): this {
    const errs = checkEngine(def);
    if (errs.length) throw new Error(`engine "${def.id}": ${errs.join('; ')}`);
    if (this.defs.has(def.id)) throw new Error(`engine "${def.id}" is already registered`);
    this.defs.set(def.id, def);
    return this;
  }

  /** Remove an engine (configurations that use it keep it as unavailable). */
  unregister(id: string): boolean {
    return this.defs.delete(id);
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  get(id: string): EngineDef | undefined {
    return this.defs.get(id);
  }

  audio(id: string): AudioEngineDef | undefined {
    const d = this.defs.get(id);
    return d?.kind === 'audio' ? d : undefined;
  }

  midi(id: string): MidiEngineDef | undefined {
    const d = this.defs.get(id);
    return d?.kind === 'midi' ? d : undefined;
  }

  /** Engines in registration order. */
  list(filter: EngineFilter = {}): EngineDef[] {
    return [...this.defs.values()].filter((d) => !filter.kind || d.kind === filter.kind);
  }

  /** A new registry with only these engines (in this registry's order); unknown ids are ignored. */
  only(ids: Iterable<string>): EngineRegistry {
    const want = new Set(ids);
    return new EngineRegistry(this.list().filter((d) => want.has(d.id)));
  }
}

/** A fresh registry of the built-in engines (all of them, or only `ids`). */
export function coreEngines(ids?: Iterable<string>): EngineRegistry {
  const r = new EngineRegistry(BUILTIN_AUDIO_ENGINES);
  return ids ? r.only(ids) : r;
}
