/**
 * The shared palette presets: ordinary built-in palettes in the shared roles only, so every
 * Slop Factory application can offer them (its own roles follow the shared ones they name in
 * `from`). ATARI is the original 1-bit look, under the id the first application's "Classic"
 * already had, so a saved choice of it still matches; put it first to keep it the default.
 *
 * Every preset keeps ink at least 4.5:1 against the paper (WCAG AA for text), dim at least 1.6:1
 * and the activity and selection colours at least 2:1 (a test checks).
 */
import type { Palette } from './model';
/** The original black and white. */
export declare const ATARI: Palette;
/** Light ink on near-black, warm highlights. */
export declare const DARK: Palette;
/** An amber phosphor monitor. */
export declare const AMBER: Palette;
/** A green monochrome monitor. */
export declare const GREEN_SCREEN: Palette;
/** Commodore blues: light blue on the screen blue, inside the border. */
export declare const C64: Palette;
/** Muted green-grey, an old terminal's phosphor. */
export declare const PHOSPHOR: Palette;
/** Dark, with pink. */
export declare const PINK_NOISE: Palette;
/** Dark, with cyan and magenta. */
export declare const RAVE: Palette;
/** Cream paper, dark ink. */
export declare const PAPER: Palette;
/** The shared presets, in menu order (ATARI first: the default). */
export declare const SHARED_PRESETS: Palette[];
