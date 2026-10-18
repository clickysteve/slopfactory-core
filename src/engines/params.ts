/**
 * Parameter descriptions for output engines: enough for an application to build its own
 * controls (a slider, a number box, a switch, a menu) without hard-coding any parameter's name
 * or range, and to validate stored values.
 */

export type ParamValue = number | boolean | string;
export type ParamValues = Record<string, ParamValue>;

interface ParamBase {
  /** stable id, stored in configurations (never renamed) */
  id: string;
  label: string;
  description?: string;
}

/** A continuous value. `smooth`: changes ramp in place while audio plays (no rebuild). */
export interface ContinuousParam extends ParamBase {
  type: 'continuous';
  min: number;
  max: number;
  default: number;
  /** suggested control step */
  step?: number;
  unit?: string;
  /** the value at which the parameter has no effect, if there is one (show it as OFF) */
  neutral?: number;
  /** how a control should map its travel to the value: 'log' for frequencies (default 'linear') */
  scale?: 'linear' | 'log';
  smooth?: boolean;
}

/** A whole number. */
export interface IntegerParam extends ParamBase {
  type: 'integer';
  min: number;
  max: number;
  default: number;
  unit?: string;
  /** the value at which the parameter has no effect, if there is one (show it as OFF) */
  neutral?: number;
}

export interface BooleanParam extends ParamBase {
  type: 'boolean';
  default: boolean;
}

export interface EnumOption {
  value: string;
  label: string;
  description?: string;
}

export interface EnumParam extends ParamBase {
  type: 'enum';
  default: string;
  options: readonly EnumOption[];
}

export type ParamDef = ContinuousParam | IntegerParam | BooleanParam | EnumParam;

/** The default value of every parameter. */
export function defaultParams(defs: readonly ParamDef[]): ParamValues {
  const out: ParamValues = {};
  for (const d of defs) out[d.id] = d.default;
  return out;
}

/** One value made valid for its parameter: clamped, rounded, or the default when unusable. */
export function repairParam(def: ParamDef, v: unknown): ParamValue {
  switch (def.type) {
    case 'continuous':
    case 'integer': {
      let x = typeof v === 'number' && Number.isFinite(v) ? v : def.default;
      if (def.type === 'integer') x = Math.round(x);
      return Math.max(def.min, Math.min(def.max, x));
    }
    case 'boolean':
      return typeof v === 'boolean' ? v : def.default;
    case 'enum':
      return typeof v === 'string' && def.options.some((o) => o.value === v) ? v : def.default;
  }
}

/** Every parameter present and valid; unknown keys dropped. */
export function repairParams(defs: readonly ParamDef[], src: unknown): ParamValues {
  const o = src && typeof src === 'object' && !Array.isArray(src) ? (src as Record<string, unknown>) : {};
  const out: ParamValues = {};
  for (const d of defs) out[d.id] = repairParam(d, o[d.id]);
  return out;
}

/** Whether a value is already valid (repairParam would leave it unchanged). */
export function isValidParam(def: ParamDef, v: unknown): boolean {
  return repairParam(def, v) === v;
}

const trim = (x: number, step?: number) => {
  const d = step && step < 1 ? Math.min(4, Math.ceil(-Math.log10(step))) : 0;
  return x.toFixed(d);
};

/** A short display string, e.g. "40%", "8 bit", "OFF", "Cassette". Applications may format their own. */
export function formatParam(def: ParamDef, v: ParamValue): string {
  switch (def.type) {
    case 'continuous':
    case 'integer': {
      const x = Number(v);
      if (def.neutral !== undefined && x === def.neutral) return 'OFF';
      const s = def.type === 'integer' ? String(Math.round(x)) : trim(x, def.step);
      if (!def.unit) return s;
      return /^[%x]/.test(def.unit) ? `${s}${def.unit}` : `${s} ${def.unit}`;
    }
    case 'boolean':
      return v ? 'ON' : 'OFF';
    case 'enum':
      return def.options.find((o) => o.value === v)?.label ?? String(v);
  }
}
