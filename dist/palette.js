//#region src/palette/model.ts
/** The roles every Slop Factory application has. */
var SHARED_ROLES = [
	{
		id: "desktop",
		label: "Desktop",
		help: "background behind the windows",
		css: "--desktop"
	},
	{
		id: "paper",
		label: "Paper",
		help: "window and panel background",
		css: "--paper"
	},
	{
		id: "ink",
		label: "Ink",
		help: "frames, text and drawing",
		css: "--ink",
		contrast: 3
	},
	{
		id: "dim",
		label: "Dim",
		help: "guide lines, tiny labels, disabled items",
		css: "--dim",
		contrast: 1.6,
		from: "ink"
	},
	{
		id: "activity",
		label: "Activity",
		help: "playheads, now-playing marks",
		css: "--activity",
		contrast: 2,
		from: "ink"
	},
	{
		id: "selection",
		label: "Selection",
		help: "selected items, menu highlight",
		css: "--selection",
		contrast: 2,
		from: "ink"
	}
];
/** Lenient hex parsing (#rgb, #rrggbb, with or without #) → '#rrggbb' lowercase, or null. */
function normHex(v) {
	if (typeof v !== "string") return null;
	let s = v.trim().replace(/^#/, "");
	if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.replace(/./g, (c) => c + c);
	if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
	return "#" + s.toLowerCase();
}
function rgb(hex) {
	const v = parseInt(hex.slice(1), 16);
	return [
		v >> 16 & 255,
		v >> 8 & 255,
		v & 255
	];
}
/** WCAG relative luminance. */
function luminance(hex) {
	const lin = (c) => {
		const s = c / 255;
		return s <= .03928 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4);
	};
	const [r, g, b] = rgb(hex);
	return .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b);
}
/** WCAG contrast ratio between two colours (1 … 21). */
function contrast(a, b) {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05);
}
/** Roles that are hard to see against the paper. Never changes any colour. */
function contrastWarnings(config, c) {
	const out = [];
	for (const role of config.roles) {
		if (role.contrast === void 0 || !c[role.id] || !c.paper) continue;
		const ratio = contrast(c[role.id], c.paper);
		if (ratio < role.contrast) out.push({
			role: role.id,
			ratio,
			against: "paper"
		});
	}
	if (c.ink && c.paper && contrast(c.ink, c.paper) < 3) out.push({
		role: "paper",
		ratio: contrast(c.ink, c.paper),
		against: "ink"
	});
	return out;
}
/** A complete colour set for the config's roles from a partial one: missing roles follow their `from` role, else the default palette. */
function completeColors(config, partial) {
	const base = config.builtIns[0].colors;
	const out = {};
	const get = (id, depth = 0) => {
		const own = normHex(partial[id]);
		if (own) return own;
		const role = config.roles.find((r) => r.id === id);
		if (role?.from && depth < 8) return get(role.from, depth + 1);
		return base[id] ?? "#000000";
	};
	for (const r of config.roles) out[r.id] = get(r.id);
	return out;
}
var enc = (hex) => hex.replace("#", "%23");
/** 1-bit fills as SVG data URIs in a given colour (2×2 and 4×4 cells). */
function fills(ink, paper) {
	const svg = (w, body) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${w}' shape-rendering='crispEdges'%3E${body}%3C/svg%3E")`;
	const px = (x, y, c) => `%3Crect x='${x}' y='${y}' width='1' height='1' fill='${enc(c)}'/%3E`;
	return {
		"--grey": svg(2, px(0, 0, ink) + px(1, 1, ink)),
		"--lightgrey": svg(4, px(0, 0, ink) + px(2, 2, ink)),
		"--dots": svg(4, px(1, 1, ink)),
		"--hatch": svg(4, px(3, 0, ink) + px(2, 1, ink) + px(1, 2, ink) + px(0, 3, ink)),
		"--whitegrey": svg(2, px(0, 0, paper) + px(1, 1, paper))
	};
}
var decl = (o) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";");
/** Ink, paper and fills for one scope (the root, or one area), plus their swapped versions (--inv-*) for inverted controls. */
function scope(ink, paper) {
	const inv = Object.fromEntries(Object.entries(fills(paper, ink)).map(([k, v]) => ["--inv-" + k.slice(2), v]));
	return {
		"--ink": ink,
		...fills(ink, paper),
		"--inv-ink": paper,
		"--inv-paper": ink,
		...inv
	};
}
/** CSS declarations that swap ink and paper (an inverted control in a non-default palette). */
var SWAP_INK_PAPER = "--ink:var(--inv-ink);--paper:var(--inv-paper);" + [
	"grey",
	"lightgrey",
	"dots",
	"hatch",
	"whitegrey"
].map((f) => `--${f}:var(--inv-${f})`).join(";");
function isDefaultPalette(config, c) {
	const base = completeColors(config, config.builtIns[0].colors);
	return config.roles.every((r) => c[r.id] === base[r.id]);
}
/** The one style sheet that applies a palette. */
function paletteCss(config, colors) {
	const c = completeColors(config, colors);
	const root = {};
	for (const r of config.roles) if (!r.area && r.id !== "ink") root[r.css] = c[r.id];
	Object.assign(root, scope(c.ink, c.paper));
	let css = `:root{${decl(root)}}\n`;
	for (const r of config.roles) if (r.area) css += `[data-area="${r.id}"]{${decl(scope(c[r.id], c.paper))}}\n`;
	if (!isDefaultPalette(config, c)) {
		css += `:root{--mark-color:var(--activity);--mark-blend:normal}\n`;
		css += config.extraCss?.(c) ?? "";
	}
	return css;
}
/** Apply a palette to a document (one <style> element; nothing else is touched). */
function applyPalette(config, colors, doc = document) {
	const id = `${config.app}-palette`;
	let el = doc.getElementById(id);
	if (!el) {
		el = doc.createElement("style");
		el.id = id;
		doc.head.appendChild(el);
	}
	el.textContent = paletteCss(config, colors);
	doc.documentElement.dataset.palette = isDefaultPalette(config, completeColors(config, colors)) ? "default" : "custom";
}
var PALETTE_VERSION = 1;
var paletteFormat = (config) => `${config.app}-palette`;
function exportPalette(config, p) {
	const f = {
		format: paletteFormat(config),
		version: 1,
		name: p.name,
		colors: { ...p.colors }
	};
	return JSON.stringify(f, null, 2);
}
var PaletteError = class extends Error {};
/** Parse and validate a palette file (this application's, or an accepted one's). Throws PaletteError with a readable message. */
function importPalette(config, text) {
	let obj;
	try {
		obj = JSON.parse(text);
	} catch {
		throw new PaletteError("The file is not valid JSON.");
	}
	if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new PaletteError("The file is not a palette.");
	const o = obj;
	const own = paletteFormat(config);
	if (o.format !== void 0 && o.format !== own && !(config.accept ?? []).includes(String(o.format))) throw new PaletteError(`The file is not a palette this application reads (${String(o.format)}).`);
	const version = Number(o.version);
	if (!Number.isInteger(version) || version < 1) throw new PaletteError("The palette file has no valid version number.");
	if (version > 1) throw new PaletteError(`This palette was made by a newer version (format v${version}).`);
	if (!o.colors || typeof o.colors !== "object" || Array.isArray(o.colors)) throw new PaletteError("The palette file has no colours.");
	const src = o.colors;
	const read = {};
	const filled = [];
	for (const r of config.roles) {
		const h = normHex(src[r.id]);
		if (h) read[r.id] = h;
		else filled.push(r.id);
	}
	if (!Object.keys(read).length) throw new PaletteError("None of the palette colours could be read.");
	const ignored = Object.keys(src).filter((k) => !config.roles.some((r) => r.id === k));
	return {
		name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 40) : "Imported palette",
		colors: completeColors(config, read),
		filled,
		ignored
	};
}
function defaultStore() {
	try {
		return typeof localStorage === "undefined" ? null : localStorage;
	} catch {
		return null;
	}
}
/** Palette preferences: the custom palettes and which palette is selected. */
var PaletteLibrary = class {
	config;
	store;
	custom = [];
	selectedId;
	builtIns;
	constructor(config, store = defaultStore()) {
		this.config = config;
		this.store = store;
		this.builtIns = config.builtIns.map((p) => ({
			...p,
			builtIn: true,
			colors: completeColors(config, p.colors)
		}));
		this.selectedId = this.defaultId;
		this.load();
	}
	get defaultId() {
		return this.builtIns[0].id;
	}
	key(k) {
		return `${this.config.app}.palette.${k}`;
	}
	load() {
		try {
			const raw = this.store?.getItem(this.key("custom"));
			const list = raw ? JSON.parse(raw) : [];
			this.custom = [];
			for (const item of Array.isArray(list) ? list : []) try {
				const r = importPalette(this.config, JSON.stringify({
					format: paletteFormat(this.config),
					version: 1,
					...item
				}));
				const id = typeof item.id === "string" ? item.id : this.newId();
				this.custom.push({
					id,
					name: r.name,
					builtIn: false,
					colors: r.colors
				});
			} catch {}
			const sel = this.store?.getItem(this.key("selected"));
			this.selectedId = sel && this.find(sel) ? sel : this.defaultId;
		} catch {
			this.custom = [];
			this.selectedId = this.defaultId;
		}
	}
	save() {
		try {
			this.store?.setItem(this.key("custom"), JSON.stringify(this.custom.map((p) => ({
				id: p.id,
				name: p.name,
				colors: p.colors
			}))));
			this.store?.setItem(this.key("selected"), this.selectedId);
		} catch {}
	}
	newId() {
		let i = this.custom.length + 1;
		while (this.find("custom-" + i)) i++;
		return "custom-" + i;
	}
	all() {
		return [...this.builtIns, ...this.custom];
	}
	find(id) {
		return this.all().find((p) => p.id === id);
	}
	get selected() {
		return this.find(this.selectedId) ?? this.builtIns[0];
	}
	select(id) {
		if (this.find(id)) this.selectedId = id;
		this.save();
		return this.selected;
	}
	uniqueName(base) {
		const names = new Set(this.all().map((p) => p.name));
		if (!names.has(base)) return base;
		for (let i = 2;; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
	}
	/** A custom copy of any palette, selected. */
	duplicate(id, name) {
		const src = this.find(id) ?? this.builtIns[0];
		const p = {
			id: this.newId(),
			name: this.uniqueName(name ?? `${src.name} copy`),
			builtIn: false,
			colors: { ...src.colors }
		};
		this.custom.push(p);
		this.selectedId = p.id;
		this.save();
		return p;
	}
	/** Change one colour. Built-ins are never modified: editing one makes a custom copy first. */
	setColor(role, value) {
		const hex = normHex(value);
		let p = this.selected;
		if (!hex || !this.config.roles.some((r) => r.id === role)) return p;
		if (p.builtIn) p = this.duplicate(p.id);
		p.colors[role] = hex;
		this.save();
		return p;
	}
	rename(id, name) {
		const p = this.custom.find((x) => x.id === id);
		const n = name.trim().slice(0, 40);
		if (!p || !n) return false;
		p.name = n;
		this.save();
		return true;
	}
	remove(id) {
		const i = this.custom.findIndex((x) => x.id === id);
		if (i < 0) return false;
		this.custom.splice(i, 1);
		if (this.selectedId === id) this.selectedId = this.defaultId;
		this.save();
		return true;
	}
	/** Add an imported palette as a new custom palette, selected. */
	addImported(r) {
		const p = {
			id: this.newId(),
			name: this.uniqueName(r.name),
			builtIn: false,
			colors: { ...r.colors }
		};
		this.custom.push(p);
		this.selectedId = p.id;
		this.save();
		return p;
	}
	/** Back to the default palette (the original look). */
	resetToDefault() {
		return this.select(this.defaultId);
	}
};
//#endregion
//#region src/palette/presets.ts
var p = (id, name, colors) => ({
	id,
	name,
	builtIn: true,
	colors
});
/** The original black and white. */
var ATARI = p("classic", "Atari", {
	desktop: "#000000",
	paper: "#ffffff",
	ink: "#000000",
	dim: "#000000",
	activity: "#000000",
	selection: "#000000"
});
/** Light ink on near-black, warm highlights. */
var DARK = p("dark", "Dark", {
	desktop: "#000000",
	paper: "#17191c",
	ink: "#d9d4c7",
	dim: "#8a857a",
	activity: "#e3b65c",
	selection: "#7fa7d1"
});
/** An amber phosphor monitor. */
var AMBER = p("amber", "Amber", {
	desktop: "#0a0500",
	paper: "#170c00",
	ink: "#ffb000",
	dim: "#a86a00",
	activity: "#ffd884",
	selection: "#ffb000"
});
/** A green monochrome monitor. */
var GREEN_SCREEN = p("green-screen", "Green Screen", {
	desktop: "#000600",
	paper: "#031203",
	ink: "#41ff41",
	dim: "#1f8f2a",
	activity: "#c2ffc2",
	selection: "#41ff41"
});
/** Commodore blues: light blue on the screen blue, inside the border. */
var C64 = p("c64", "C64", {
	desktop: "#7869c4",
	paper: "#352879",
	ink: "#b0a8f5",
	dim: "#7869c4",
	activity: "#eeee77",
	selection: "#b0a8f5"
});
/** Muted green-grey, an old terminal's phosphor. */
var PHOSPHOR = p("phosphor", "Phosphor", {
	desktop: "#0c100d",
	paper: "#1b221d",
	ink: "#9fb8a4",
	dim: "#5f7465",
	activity: "#dbe8c4",
	selection: "#9fb8a4"
});
/** Dark, with pink. */
var PINK_NOISE = p("pink-noise", "Pink Noise", {
	desktop: "#0b0609",
	paper: "#170c12",
	ink: "#ff8cc6",
	dim: "#9b4f74",
	activity: "#ffd1e6",
	selection: "#ff3d9a"
});
/** Dark, with cyan and magenta. */
var RAVE = p("rave", "Rave", {
	desktop: "#05010a",
	paper: "#0d0716",
	ink: "#3ff3ff",
	dim: "#7a3f9e",
	activity: "#ff2bd6",
	selection: "#ff2bd6"
});
/** Cream paper, dark ink. */
var PAPER = p("paper", "Paper", {
	desktop: "#8c8170",
	paper: "#f4ecd8",
	ink: "#2b2622",
	dim: "#8f846f",
	activity: "#b8431f",
	selection: "#2b2622"
});
/** The shared presets, in menu order (ATARI first: the default). */
var SHARED_PRESETS = [
	ATARI,
	DARK,
	AMBER,
	GREEN_SCREEN,
	C64,
	PHOSPHOR,
	PINK_NOISE,
	RAVE,
	PAPER
];
//#endregion
//#region src/palette/editor.ts
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
var ROW_Y = 16;
var ROW_H = 17;
var PALETTE_EDITOR_WIDTH = 302;
function make(tag, cls, parent, rect, text) {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (rect) {
		e.style.position = "absolute";
		e.style.left = rect[0] + "px";
		e.style.top = rect[1] + "px";
		if (rect[2] !== void 0) e.style.width = rect[2] + "px";
		if (rect[3] !== void 0) e.style.height = rect[3] + "px";
	}
	if (text !== void 0) e.textContent = text;
	parent.appendChild(e);
	return e;
}
function download(fileName, text) {
	const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 5e3);
}
function chooseFile(accept) {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = accept;
		input.style.display = "none";
		input.addEventListener("change", () => {
			resolve(input.files?.[0] ?? null);
			input.remove();
		});
		input.addEventListener("cancel", () => {
			resolve(null);
			input.remove();
		});
		document.body.appendChild(input);
		input.click();
	});
}
function paletteEditor(host, lib, opts = {}) {
	const config = lib.config;
	const apply = opts.apply ?? ((c) => applyPalette(config, c));
	const b = make("div", "paletteeditor", host);
	Object.assign(b.style, {
		position: "relative",
		width: "302px"
	});
	b.addEventListener("keydown", (e) => e.stopPropagation());
	const defaultName = lib.builtIns[0].name;
	make("div", "label small", b, [6, 4], "Palettes");
	const list = make("div", "box", b, [
		6,
		16,
		112,
		112
	]);
	Object.assign(list.style, {
		overflowY: "auto",
		background: "var(--paper)"
	});
	list.setAttribute("role", "listbox");
	list.setAttribute("aria-label", "Palettes");
	make("div", "label tiny", b, [6, 133], "Name");
	const name = make("input", "mtext", b, [
		6,
		142,
		112,
		16
	]);
	name.setAttribute("aria-label", "Palette name");
	name.addEventListener("focus", () => name.select());
	const rename = () => {
		const p = lib.selected;
		if (!p.builtIn && lib.rename(p.id, name.value)) refresh();
		else name.value = p.name;
	};
	name.addEventListener("change", rename);
	name.addEventListener("keydown", (e) => e.key === "Enter" && (rename(), name.blur()));
	const btn = (x, y, w, t, title, f) => {
		const d = make("button", "mbutton", b, [
			x,
			y,
			w,
			17
		], t);
		d.style.padding = "0";
		d.title = title;
		d.addEventListener("click", f);
		return d;
	};
	let deleteArmed = 0;
	const btns = {
		duplicate: btn(6, 164, 54, "Duplicate", "Make an editable copy of this palette", () => say(`Made “${lib.duplicate(lib.selectedId).name}”.`, true)),
		delete: btn(64, 164, 54, "Delete", "Delete this custom palette (press twice)", () => remove()),
		import: btn(6, 185, 54, "Import…", `Load a palette file (.${paletteFormat(config)}.json, or another Slop Factory application's)`, () => void importFile()),
		export: btn(64, 185, 54, "Export…", "Save this palette as a file", () => exportFile()),
		reset: btn(6, 206, 112, `Back to ${defaultName}`, `Use the original look (${defaultName})`, () => say(`${defaultName} palette.`, lib.resetToDefault()))
	};
	make("div", "label small", b, [128, 4], "Colours");
	const rows = /* @__PURE__ */ new Map();
	config.roles.forEach((role, i) => {
		const y = ROW_Y + i * ROW_H;
		const l = make("div", "label small", b, [128, y + 3], role.label);
		l.title = role.help;
		const swatch = make("div", "box", b, [
			194,
			y,
			22,
			14
		]);
		swatch.title = `${role.label}: ${role.help}. Click to pick a colour.`;
		swatch.setAttribute("role", "button");
		swatch.tabIndex = 0;
		const picker = make("input", "", swatch);
		picker.type = "color";
		Object.assign(picker.style, {
			position: "absolute",
			inset: "0",
			width: "100%",
			height: "100%",
			opacity: "0",
			border: "0",
			padding: "0",
			cursor: "default"
		});
		picker.setAttribute("aria-label", `${role.label} colour`);
		picker.addEventListener("input", () => set(role.id, picker.value));
		swatch.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && picker.click());
		const hex = make("input", "mtext", b, [
			220,
			y,
			60,
			14
		]);
		hex.style.padding = "0 3px";
		hex.spellcheck = false;
		hex.maxLength = 7;
		hex.setAttribute("aria-label", `${role.label} hex colour`);
		hex.addEventListener("focus", () => hex.select());
		hex.addEventListener("input", () => /^#?[0-9a-f]{6}$/i.test(hex.value.trim()) && set(role.id, hex.value, false));
		const commit = () => {
			if (normHex(hex.value)) set(role.id, hex.value);
			else {
				say(`“${hex.value}” is not a colour. Use a hex value such as #1d6a86.`);
				hex.value = lib.selected.colors[role.id] ?? "";
			}
		};
		hex.addEventListener("change", commit);
		hex.addEventListener("keydown", (e) => e.key === "Enter" && (commit(), hex.blur()));
		const warn = make("div", "label", b, [
			284,
			y + 3,
			12,
			10
		], "!");
		warn.style.fontWeight = "600";
		rows.set(role.id, {
			swatch,
			picker,
			hex,
			warn
		});
	});
	const statusY = Math.max(228, ROW_Y + config.roles.length * ROW_H + 6);
	const status = make("div", "label tiny", b, [
		6,
		statusY,
		292,
		16
	]);
	Object.assign(status.style, {
		whiteSpace: "normal",
		lineHeight: "8px"
	});
	status.setAttribute("aria-live", "polite");
	const height = statusY + 18;
	b.style.height = height + "px";
	function set(role, value, rewriteHex = true) {
		const wasBuiltIn = lib.selected.builtIn;
		const p = lib.setColor(role, value);
		applySoon();
		if (wasBuiltIn && !p.builtIn) say(`Built-in palettes stay as they are: editing “${p.name}”.`);
		refresh(rewriteHex ? void 0 : role);
		opts.onChange?.();
	}
	/** Live edits (a colour picker drag fires many events) restyle at most once per frame. */
	let frame = 0;
	function applySoon() {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			apply(lib.selected.colors);
		});
	}
	function say(text, changed = false) {
		if (changed) {
			apply(lib.selected.colors);
			refresh();
			opts.onChange?.();
		}
		status.textContent = text;
	}
	function remove() {
		const p = lib.selected;
		if (p.builtIn) return;
		if (performance.now() - deleteArmed > 3e3) {
			deleteArmed = performance.now();
			btns.delete.textContent = "Sure?";
			setTimeout(() => btns.delete.textContent = "Delete", 3e3);
			return;
		}
		deleteArmed = 0;
		btns.delete.textContent = "Delete";
		lib.remove(p.id);
		say(`Deleted “${p.name}”.`, true);
	}
	function exportFile() {
		const p = lib.selected;
		const safe = p.name.replace(/[^\w\- ]+/g, "").trim() || "palette";
		(opts.save ?? download)(`${safe}.${paletteFormat(config)}.json`, exportPalette(config, p));
		say(`Exported “${p.name}”.`);
	}
	async function importFile() {
		const f = await (opts.open ?? chooseFile)(".json,application/json");
		if (!f) return;
		try {
			const r = importPalette(config, await f.text());
			const p = lib.addImported(r);
			const label = (id) => config.roles.find((x) => x.id === id)?.label ?? id;
			let msg = `Imported “${p.name}”.`;
			if (r.filled.length) msg += ` Not in the file: ${r.filled.map(label).join(", ")} (made from the other colours).`;
			say(msg, true);
		} catch (e) {
			say("Could not import: " + (e instanceof PaletteError ? e.message : "the file could not be read."));
		}
	}
	/** Redraw the list and the colour rows from the library. `editing` keeps that hex field as typed. */
	function refresh(editing) {
		const sel = lib.selected;
		list.replaceChildren();
		for (const p of lib.all()) {
			const d = make("div", "label", list, void 0, p.name + (p.builtIn ? "" : " *"));
			Object.assign(d.style, {
				position: "relative",
				padding: "2px 4px",
				overflow: "hidden",
				textOverflow: "ellipsis"
			});
			d.setAttribute("role", "option");
			d.setAttribute("aria-selected", String(p.id === sel.id));
			d.dataset.palette = p.id;
			d.title = p.builtIn ? `${p.name} (built in)` : `${p.name} (yours)`;
			if (p.id === sel.id) d.classList.add("inv");
			d.addEventListener("pointerdown", () => {
				lib.select(p.id);
				say("", true);
			});
		}
		name.value = sel.name;
		name.disabled = sel.builtIn;
		name.title = sel.builtIn ? "Built-in palettes cannot be renamed: Duplicate first" : "Rename this palette";
		btns.delete.disabled = sel.builtIn;
		btns.delete.style.opacity = sel.builtIn ? "0.4" : "1";
		name.style.opacity = sel.builtIn ? "0.6" : "1";
		const warnings = new Map(contrastWarnings(config, sel.colors).map((w) => [w.role, w]));
		for (const role of config.roles) {
			const r = rows.get(role.id);
			const c = sel.colors[role.id] ?? "#000000";
			r.swatch.style.background = c;
			r.picker.value = c;
			if (role.id !== editing) r.hex.value = c;
			const w = warnings.get(role.id);
			r.warn.style.visibility = w ? "visible" : "hidden";
			r.warn.title = w ? `Low contrast against ${config.roles.find((x) => x.id === w.against)?.label ?? w.against} (${w.ratio.toFixed(1)}:1): may be hard to see` : "";
		}
	}
	refresh();
	return {
		refresh: () => refresh(),
		reset: () => status.textContent = "",
		width: 302,
		height
	};
}
//#endregion
export { AMBER, ATARI, C64, DARK, GREEN_SCREEN, PALETTE_EDITOR_WIDTH, PALETTE_VERSION, PAPER, PHOSPHOR, PINK_NOISE, PaletteError, PaletteLibrary, RAVE, SHARED_PRESETS, SHARED_ROLES, SWAP_INK_PAPER, applyPalette, completeColors, contrast, contrastWarnings, exportPalette, importPalette, isDefaultPalette, luminance, normHex, paletteCss, paletteEditor, paletteFormat };
