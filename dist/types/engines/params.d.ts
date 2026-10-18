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
export declare function defaultParams(defs: readonly ParamDef[]): ParamValues;
/** One value made valid for its parameter: clamped, rounded, or the default when unusable. */
export declare function repairParam(def: ParamDef, v: unknown): ParamValue;
/** Every parameter present and valid; unknown keys dropped. */
export declare function repairParams(defs: readonly ParamDef[], src: unknown): ParamValues;
/** Whether a value is already valid (repairParam would leave it unchanged). */
export declare function isValidParam(def: ParamDef, v: unknown): boolean;
/** A short display string, e.g. "40%", "8 bit", "OFF", "Cassette". Applications may format their own. */
export declare function formatParam(def: ParamDef, v: ParamValue): string;
export {};
