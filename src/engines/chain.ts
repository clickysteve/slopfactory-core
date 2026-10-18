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
import { FX_PRESETS, cleanFx, type OutputFxSettings } from '../dsp/output/settings';
import { CRUNCH_ENGINE, DRIVE_ENGINE, OUTPUT_STAGE_ENGINE, TONE_ENGINE } from './builtin';
import { defaultParams, repairParam, repairParams, type ParamDef, type ParamValue, type ParamValues } from './params';
import type { EngineRegistry } from './registry';
import type { AudioEngineDef } from './types';

export const CHAIN_VERSION = 1;
/** Stages a chain may hold. */
export const MAX_STAGES = 8;

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

export const emptyChain = (): ChainConfig => ({ version: CHAIN_VERSION, bypass: false, stages: [] });

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isPrimitive = (v: unknown): v is ParamValue => typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

/** Engine lookup the chain needs (an EngineRegistry, or anything with the same method). */
export interface AudioEngineLookup {
  audio(id: string): AudioEngineDef | undefined;
}

function nextStageId(stages: readonly { id: string }[]): string {
  let n = 0;
  for (const s of stages) {
    const m = /^s(\d+)$/.exec(s.id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `s${n + 1}`;
}

/**
 * A valid configuration from stored data: missing or broken fields filled, parameters of known
 * engines validated, stages of unknown engines kept as they are, duplicate ids renumbered,
 * at most MAX_STAGES stages. Never throws.
 */
export function repairChain(src: unknown, engines?: AudioEngineLookup): ChainConfig {
  return repairChainWith(src, (id) => engines?.audio(id));
}

/** repairChain with any engine lookup (MIDI chains use their MIDI engines). */
export function repairChainWith(src: unknown, find: (id: string) => { params: readonly ParamDef[]; version: number } | undefined): ChainConfig {
  const o = isObj(src) ? src : {};
  const stages: StageConfig[] = [];
  const ids = new Set<string>();
  for (const raw of Array.isArray(o.stages) ? o.stages : []) {
    if (stages.length >= MAX_STAGES) break;
    if (!isObj(raw) || typeof raw.engine !== 'string' || !raw.engine) continue;
    const def = find(raw.engine);
    let params: ParamValues;
    if (def) params = repairParams(def.params, raw.params);
    else {
      params = {};
      if (isObj(raw.params)) for (const [k, v] of Object.entries(raw.params)) if (isPrimitive(v)) params[k] = v;
    }
    let id = typeof raw.id === 'string' && raw.id && !ids.has(raw.id) ? raw.id : '';
    if (!id) id = nextStageId([...stages, ...[...ids].map((i) => ({ id: i }))]);
    ids.add(id);
    const st: StageConfig = { id, engine: raw.engine, enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true, params };
    const v = def ? def.version : typeof raw.v === 'number' ? raw.v : undefined;
    if (v !== undefined) st.v = v;
    stages.push(st);
  }
  return { version: CHAIN_VERSION, bypass: typeof o.bypass === 'boolean' ? o.bypass : false, stages };
}

/** Does the chain change audio at all? (False: nothing enabled, or bypassed.) */
export function chainActive(c: ChainConfig, engines?: AudioEngineLookup): boolean {
  return !c.bypass && c.stages.some((s) => s.enabled && (!engines || !!engines.audio(s.engine)));
}

/** Stages whose engine is not in `engines` (shown as unavailable). */
export function unavailableStages(c: ChainConfig, engines: AudioEngineLookup): StageConfig[] {
  return c.stages.filter((s) => !engines.audio(s.engine));
}

/**
 * The seed each stage's kernel gets: the chain seed for the first stage of each engine, a
 * derived one for further stages of the same engine. A stage's seed therefore does not change
 * when stages of other engines are added, removed or moved.
 */
export function stageSeeds(c: ChainConfig, seed: number): number[] {
  const count = new Map<string, number>();
  return c.stages.map((s) => {
    const k = count.get(s.engine) ?? 0;
    count.set(s.engine, k + 1);
    return k === 0 ? seed >>> 0 : (Math.imul((seed ^ (k * 0x9e3779b1)) >>> 0, 0x85ebca6b) ^ k) >>> 0;
  });
}

// ------------------------------------------------------------------------------------ presets

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
export function chainFromFx(fx: OutputFxSettings): ChainConfig {
  const c = emptyChain();
  c.bypass = fx.bypass;
  const add = (engine: AudioEngineDef, params: ParamValues) => c.stages.push({ id: nextStageId(c.stages), engine: engine.id, enabled: true, params: repairParams(engine.params, params), v: engine.version });
  if (fx.outputStage.enabled) add(OUTPUT_STAGE_ENGINE, { ...fx.outputStage });
  if (fx.drive.enabled) add(DRIVE_ENGINE, { ...fx.drive });
  if (fx.crunch.enabled) add(CRUNCH_ENGINE, { ...fx.crunch });
  if (fx.tone.enabled) add(TONE_ENGINE, { ...fx.tone });
  return c;
}

/** Core's processing presets (CLEAN, 12-BIT, BITCRUSH, ...) as chains. */
export const CHAIN_PRESETS: readonly ChainPreset[] = Object.freeze(FX_PRESETS.map((p) => ({ key: p.key, label: p.label, description: p.description, config: chainFromFx(p.apply(cleanFx())) })));

/** Presets whose every engine is available. */
export function presetsFor(engines: AudioEngineLookup, presets: readonly ChainPreset[] = CHAIN_PRESETS): ChainPreset[] {
  return presets.filter((p) => p.config.stages.every((s) => !!engines.audio(s.engine)));
}

/** Which preset (if any) a configuration currently equals (stage ids ignored). */
export function matchChainPreset(c: ChainConfig, presets: readonly ChainPreset[] = CHAIN_PRESETS): string | null {
  const key = (x: ChainConfig) => JSON.stringify(x.stages.map((s) => [s.engine, s.enabled, s.params]));
  const k = key(c);
  return presets.find((p) => key(p.config) === k)?.key ?? null;
}

// ---------------------------------------------------------------------------- the controller

export type ChainListener = (config: ChainConfig) => void;

/**
 * A headless controller for one chain: the operations an interface needs, validated against
 * the application's registry, with change notifications. It holds no audio; applications pass
 * `config` to a chain node (live), to the renderer (export) and to their settings storage.
 * Every change produces a new configuration object (the old one is never mutated).
 */
export class OutputChain {
  private cfg: ChainConfig;
  private listeners = new Set<ChainListener>();

  constructor(readonly registry: EngineRegistry, config?: unknown, readonly maxStages = MAX_STAGES) {
    this.cfg = repairChain(config, registry);
  }

  get config(): ChainConfig {
    return this.cfg;
  }

  get stages(): readonly StageConfig[] {
    return this.cfg.stages;
  }

  /** The audio engines the application offers, in its order. */
  available(): AudioEngineDef[] {
    return this.registry.list({ kind: 'audio' }) as AudioEngineDef[];
  }

  stage(id: string): StageConfig | undefined {
    return this.cfg.stages.find((s) => s.id === id);
  }

  /** The stage's engine, or undefined when it is unavailable in this application. */
  engine(stage: StageConfig | string): AudioEngineDef | undefined {
    const s = typeof stage === 'string' ? this.stage(stage) : stage;
    return s ? this.registry.audio(s.engine) : undefined;
  }

  get canAdd(): boolean {
    return this.cfg.stages.length < Math.min(this.maxStages, MAX_STAGES);
  }

  subscribe(fn: ChainListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private commit(next: ChainConfig): void {
    this.cfg = next;
    for (const fn of [...this.listeners]) fn(next);
  }

  private mapStage(id: string, fn: (s: StageConfig) => StageConfig | null): boolean {
    const i = this.cfg.stages.findIndex((s) => s.id === id);
    if (i < 0) return false;
    const next = fn(this.cfg.stages[i]);
    if (!next) return false;
    const stages = [...this.cfg.stages];
    stages[i] = next;
    this.commit({ ...this.cfg, stages });
    return true;
  }

  /** Add a stage with the engine's defaults (at the end, or at `index`). Returns its id. */
  add(engineId: string, index = this.cfg.stages.length): string | null {
    const def = this.registry.audio(engineId);
    if (!def || !this.canAdd) return null;
    const st: StageConfig = { id: nextStageId(this.cfg.stages), engine: def.id, enabled: true, params: defaultParams(def.params), v: def.version };
    const stages = [...this.cfg.stages];
    stages.splice(Math.max(0, Math.min(stages.length, index)), 0, st);
    this.commit({ ...this.cfg, stages });
    return st.id;
  }

  remove(id: string): boolean {
    if (!this.stage(id)) return false;
    this.commit({ ...this.cfg, stages: this.cfg.stages.filter((s) => s.id !== id) });
    return true;
  }

  /** Move a stage to a new position (clamped). */
  moveTo(id: string, index: number): boolean {
    const from = this.cfg.stages.findIndex((s) => s.id === id);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(this.cfg.stages.length - 1, index));
    if (to === from) return false;
    const stages = [...this.cfg.stages];
    const [s] = stages.splice(from, 1);
    stages.splice(to, 0, s);
    this.commit({ ...this.cfg, stages });
    return true;
  }

  /** Move a stage up (-1) or down (+1). */
  move(id: string, delta: number): boolean {
    const i = this.cfg.stages.findIndex((s) => s.id === id);
    return i >= 0 && this.moveTo(id, i + delta);
  }

  /** Swap a stage's engine for another (same position and enabled state, the new engine's defaults). */
  replace(id: string, engineId: string): boolean {
    const def = this.registry.audio(engineId);
    if (!def) return false;
    return this.mapStage(id, (s) => (s.engine === engineId ? null : { ...s, engine: def.id, params: defaultParams(def.params), v: def.version }));
  }

  setEnabled(id: string, enabled: boolean): boolean {
    return this.mapStage(id, (s) => (s.enabled === enabled ? null : { ...s, enabled }));
  }

  /** Set one parameter (validated: clamped, rounded, or refused for unknown parameters). */
  setParam(id: string, param: string, value: ParamValue): boolean {
    return this.setParams(id, { [param]: value });
  }

  setParams(id: string, patch: Partial<ParamValues>): boolean {
    return this.mapStage(id, (s) => {
      const def = this.registry.audio(s.engine);
      if (!def) return null;
      const params = { ...s.params };
      let changed = false;
      for (const [k, v] of Object.entries(patch)) {
        const p = def.params.find((x) => x.id === k);
        if (!p || v === undefined) continue;
        const r = repairParam(p, v);
        if (params[k] !== r) {
          params[k] = r;
          changed = true;
        }
      }
      return changed ? { ...s, params } : null;
    });
  }

  /** Back to the engine's defaults. */
  resetParams(id: string): boolean {
    return this.mapStage(id, (s) => {
      const def = this.registry.audio(s.engine);
      return def ? { ...s, params: defaultParams(def.params) } : null;
    });
  }

  /** Apply one of the stage's engine presets. */
  applyEnginePreset(id: string, key: string): boolean {
    const def = this.engine(id);
    const pr = def?.presets?.find((p) => p.key === key);
    return !!pr && this.setParams(id, pr.params);
  }

  /** Bypass (or restore) the whole chain. */
  setBypass(bypass: boolean): void {
    if (this.cfg.bypass !== bypass) this.commit({ ...this.cfg, bypass });
  }

  /** Replace the configuration (validated). */
  load(config: unknown): void {
    this.commit(repairChain(config, this.registry));
  }

  /** Replace the stages with a preset's (only if every engine it uses is available). */
  applyPreset(preset: ChainPreset): boolean {
    if (!preset.config.stages.every((s) => this.registry.audio(s.engine))) return false;
    this.commit(repairChain({ ...preset.config, bypass: false }, this.registry));
    return true;
  }

  clear(): void {
    this.commit({ ...this.cfg, stages: [] });
  }
}
