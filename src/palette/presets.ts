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

const p = (id: string, name: string, colors: Record<string, string>): Palette => ({ id, name, builtIn: true, colors });

/** The original black and white. */
export const ATARI = p('classic', 'Atari', { desktop: '#000000', paper: '#ffffff', ink: '#000000', dim: '#000000', activity: '#000000', selection: '#000000' });
/** Light ink on near-black, warm highlights. */
export const DARK = p('dark', 'Dark', { desktop: '#000000', paper: '#17191c', ink: '#d9d4c7', dim: '#8a857a', activity: '#e3b65c', selection: '#7fa7d1' });
/** An amber phosphor monitor. */
export const AMBER = p('amber', 'Amber', { desktop: '#0a0500', paper: '#170c00', ink: '#ffb000', dim: '#a86a00', activity: '#ffd884', selection: '#ffb000' });
/** A green monochrome monitor. */
export const GREEN_SCREEN = p('green-screen', 'Green Screen', { desktop: '#000600', paper: '#031203', ink: '#41ff41', dim: '#1f8f2a', activity: '#c2ffc2', selection: '#41ff41' });
/** Commodore blues: light blue on the screen blue, inside the border. */
export const C64 = p('c64', 'C64', { desktop: '#7869c4', paper: '#352879', ink: '#b0a8f5', dim: '#7869c4', activity: '#eeee77', selection: '#b0a8f5' });
/** Muted green-grey, an old terminal's phosphor. */
export const PHOSPHOR = p('phosphor', 'Phosphor', { desktop: '#0c100d', paper: '#1b221d', ink: '#9fb8a4', dim: '#5f7465', activity: '#dbe8c4', selection: '#9fb8a4' });
/** Dark, with pink. */
export const PINK_NOISE = p('pink-noise', 'Pink Noise', { desktop: '#0b0609', paper: '#170c12', ink: '#ff8cc6', dim: '#9b4f74', activity: '#ffd1e6', selection: '#ff3d9a' });
/** Dark, with cyan and magenta. */
export const RAVE = p('rave', 'Rave', { desktop: '#05010a', paper: '#0d0716', ink: '#3ff3ff', dim: '#7a3f9e', activity: '#ff2bd6', selection: '#ff2bd6' });
/** Cream paper, dark ink. */
export const PAPER = p('paper', 'Paper', { desktop: '#8c8170', paper: '#f4ecd8', ink: '#2b2622', dim: '#8f846f', activity: '#b8431f', selection: '#2b2622' });

/** The shared presets, in menu order (ATARI first: the default). */
export const SHARED_PRESETS: Palette[] = [ATARI, DARK, AMBER, GREEN_SCREEN, C64, PHOSPHOR, PINK_NOISE, RAVE, PAPER];
