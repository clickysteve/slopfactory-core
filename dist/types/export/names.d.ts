/** File-name helpers: short, predictable, safe on every operating system. */
/** Lower-case letters, digits and single hyphens, at most `max` characters ('' if nothing is left). */
export declare function slug(s: string, max?: number): string;
/** Join name parts with underscores, dropping empty ones. */
export declare function fileName(parts: string[], ext: string): string;
/** Make names unique by appending -2, -3... before the extension. */
export declare function uniqueNames(names: string[]): string[];
