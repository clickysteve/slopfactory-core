/**
 * The palette editor: choose, edit, save and exchange colour palettes. The same controls in
 * every Slop Factory application: the list of palettes (built-in and yours), the name, Duplicate,
 * Delete (press twice), Import…, Export…, Back to the default, and one row per colour role with a
 * swatch (the browser's colour picker), a hex field and a low-contrast warning.
 *
 * Mounted into an element the application provides (the body of one of its windows) and drawn
 * with the shared class names of the Slop Factory style sheets (`label`, `box`, `mtext`,
 * `mbutton`, `inv`), in fixed logical pixels like the rest of the 1-bit screen. Purely cosmetic:
 * nothing here touches the music. Keys typed in it never reach the application's shortcuts.
 */
import { type Colors, type PaletteLibrary } from './model';
export interface PaletteEditorOptions {
    /** restyle the page (default: apply the palette to this document) */
    apply?: (colors: Colors) => void;
    /** save a palette file (default: a download) */
    save?: (fileName: string, text: string) => void;
    /** choose a palette file (default: the browser's file chooser) */
    open?: (accept: string) => Promise<File | null>;
    /** after any change of palette (selection, colour, import, delete) */
    onChange?: () => void;
}
export interface PaletteEditor {
    /** redraw from the library (after it changed elsewhere) */
    refresh(): void;
    /** clear the status line */
    reset(): void;
    /** the editor's size in logical pixels */
    width: number;
    height: number;
}
export declare const PALETTE_EDITOR_WIDTH = 302;
export declare function paletteEditor(host: HTMLElement, lib: PaletteLibrary, opts?: PaletteEditorOptions): PaletteEditor;
