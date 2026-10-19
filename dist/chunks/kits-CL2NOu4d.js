import { a as decodeSample, r as SampleError } from "./decode-Cy34mjTM.js";
import { i as readZip, r as createZip, t as ZipLimitError } from "./zip-CbX6Dxg3.js";
import { n as slug } from "./names-CMJ8ziJe.js";
import { c as sampleFromBytes, l as sha256Hex, r as readBundle, s as StorageError } from "./bundle-DvwLXzGy.js";
//#region src/version.ts
/** The package version, kept equal to package.json by a test (see docs/RELEASING.md). */
var CORE_VERSION = "0.5.0";
//#endregion
//#region src/kits/sampleInfo.ts
/** A sample id: SHA-256 of the original file bytes, lower-case hex. */
var SAMPLE_ID = /^[0-9a-f]{64}$/;
var fourcc = (b, at) => at + 4 <= b.length ? String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]) : "";
/** The audio container format, from the file's first bytes, else its extension ('' if unknown). */
function sniffFormat(bytes, name = "") {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength));
	if (fourcc(b, 0) === "RIFF" && fourcc(b, 8) === "WAVE") return "wav";
	if (fourcc(b, 0) === "FORM" && (fourcc(b, 8) === "AIFF" || fourcc(b, 8) === "AIFC")) return "aiff";
	if (fourcc(b, 0) === "fLaC") return "flac";
	if (fourcc(b, 0) === "OggS") return "ogg";
	if (fourcc(b, 4) === "ftyp") return "m4a";
	if (b.length >= 3 && b[0] === 73 && b[1] === 68 && b[2] === 51) return "mp3";
	if (b.length >= 2 && b[0] === 255 && (b[1] & 224) === 224) return "mp3";
	const m = /\.([a-z0-9]{2,5})$/i.exec(name);
	return m ? m[1].toLowerCase().replace(/^(wave)$/, "wav").replace(/^(aif|aifc)$/, "aiff") : "";
}
var EXT = {
	wav: "wav",
	aiff: "aif",
	flac: "flac",
	ogg: "ogg",
	m4a: "m4a",
	mp3: "mp3"
};
/** A file extension for a sample of this format ('bin' if unknown). */
var formatExtension = (format) => EXT[format] ?? "bin";
var MIME = {
	wav: "audio/wav",
	aiff: "audio/aiff",
	flac: "audio/flac",
	ogg: "audio/ogg",
	m4a: "audio/mp4",
	mp3: "audio/mpeg"
};
/** A MIME type for a sample of this format ('' if unknown). */
var formatMime = (format) => MIME[format] ?? "";
//#endregion
//#region src/kits/model.ts
/**
* Kits: named sets of samples assigned to instrument roles. A kit says which sounds play which
* drum, never what is played: tracks, patterns, sequencing, mixing and MIDI belong to the
* application. Kits refer to samples by content (the SHA-256 of the original file bytes), so the
* same sample in several kits is stored once and a kit can be copied or renamed without copying
* audio.
*
* The model is plain JSON. Applications may keep their own data on a kit, an instrument or a
* sample reference under `ext[<application id>]`; other applications keep it untouched, so a kit
* that passes through an application that does not read it loses nothing.
*/
/** A kit operation failed; `message` is meant for the user. Nothing was changed. */
var KitError = class extends Error {
	code;
	details;
	constructor(code, message, details = []) {
		super(message);
		this.code = code;
		this.details = details;
		this.name = "KitError";
	}
};
var MAX_KIT_NAME = 64;
var MAX_INSTRUMENTS = 512;
var MAX_SAMPLES_PER_INSTRUMENT = 256;
/** most sample references in one kit (all instruments) */
var MAX_KIT_REFS = 2e3;
var MAX_TEXT = 255;
var MAX_DESCRIPTION = 2e3;
var MAX_EXT_CHARS = 262144;
var ROLE_ID = /^[a-z0-9][a-z0-9:._-]{0,63}$/;
var CONTROL = /[\u0000-\u001f\u007f]/g;
var HAS_CONTROL = /[\u0000-\u001f\u007f]/;
/** A kit name, trimmed: 1-64 characters, no control characters. Throws KitError('name'). */
function kitName(value) {
	const name = typeof value === "string" ? value.trim() : "";
	if (!name || name.length > 64 || HAS_CONTROL.test(name)) throw new KitError("name", `Use a kit name of 1-64 characters without control characters.`);
	return name;
}
/** Display text from untrusted input: control characters removed, length capped. Never HTML. */
function cleanText(value, max = MAX_TEXT) {
	return typeof value === "string" ? value.replace(CONTROL, " ").trim().slice(0, max) : "";
}
/** `name` or, if taken (case-insensitively), "name 2", "name 3" ... within 64 characters. */
function uniqueKitName(name, taken) {
	const used = new Set([...taken].map((n) => n.toLocaleLowerCase()));
	if (!used.has(name.toLocaleLowerCase())) return name;
	for (let n = 2;; n++) {
		const suffix = ` ${n}`;
		const candidate = name.slice(0, 64 - suffix.length).trimEnd() + suffix;
		if (!used.has(candidate.toLocaleLowerCase())) return candidate;
	}
}
/** "Name Copy" (within 64 characters), the default name of a duplicate. */
var copyName = (name) => name.slice(0, 59).trimEnd() + " Copy";
var isObj$1 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function ext(v, where) {
	if (v === void 0) return void 0;
	if (!isObj$1(v)) throw new KitError("invalid", `${where}: application data must be an object.`);
	if (JSON.stringify(v).length > MAX_EXT_CHARS) throw new KitError("too-large", `${where}: application data is too large.`);
	return JSON.parse(JSON.stringify(v));
}
function sampleRef(v, where) {
	if (!isObj$1(v) || typeof v.sample !== "string" || !SAMPLE_ID.test(v.sample)) throw new KitError("invalid", `${where}: a sample reference is not a sample id.`);
	const r = { sample: v.sample };
	const name = cleanText(v.name);
	if (name) r.name = name;
	if (v.primary === true) r.primary = true;
	if (v.weight !== void 0) {
		if (typeof v.weight !== "number" || !Number.isFinite(v.weight) || v.weight < 0 || v.weight > 1e3) throw new KitError("invalid", `${where}: a sample weight is not a number from 0 to 1000.`);
		r.weight = v.weight;
	}
	if (v.velocity !== void 0) {
		const vel = v.velocity;
		if (!Array.isArray(vel) || vel.length !== 2 || !vel.every((x) => Number.isInteger(x) && x >= 0 && x <= 127) || vel[0] > vel[1]) throw new KitError("invalid", `${where}: a velocity range is not [low, high] in 0-127.`);
		r.velocity = [vel[0], vel[1]];
	}
	const art = cleanText(v.articulation, 64);
	if (art) r.articulation = art;
	const e = ext(v.ext, where);
	if (e) r.ext = e;
	return r;
}
function instrument(v, n) {
	const where = `Instrument ${n + 1}`;
	if (!isObj$1(v)) throw new KitError("invalid", `${where} is not an object.`);
	if (typeof v.role !== "string" || !ROLE_ID.test(v.role)) throw new KitError("invalid", `${where} has no valid role.`);
	if (!Array.isArray(v.samples) || v.samples.length > 256) throw new KitError("invalid", `${where} has no valid sample list.`);
	const ins = {
		role: v.role,
		samples: v.samples.map((s) => sampleRef(s, where))
	};
	if (v.index !== void 0) {
		if (!Number.isInteger(v.index) || v.index < 0 || v.index > 255) throw new KitError("invalid", `${where} has an invalid index.`);
		ins.index = v.index;
	}
	const label = cleanText(v.label, 64);
	if (label) ins.label = label;
	const sel = cleanText(v.selection, 32);
	if (sel) ins.selection = sel;
	if (v.choke !== void 0) {
		const c = v.choke;
		if (!isObj$1(c) || typeof c.group !== "string" || !c.group || c.group.length > 64) throw new KitError("invalid", `${where} has an invalid choke group.`);
		ins.choke = {
			group: cleanText(c.group, 64),
			...typeof c.cuts === "boolean" ? { cuts: c.cuts } : {},
			...typeof c.cutBy === "boolean" ? { cutBy: c.cutBy } : {}
		};
	}
	const e = ext(v.ext, where);
	if (e) ins.ext = e;
	return ins;
}
/**
* Check and normalise untrusted kit data (from a file or storage): every field is validated,
* text is cleaned, unknown top-level fields are dropped, application data (`ext`) is kept.
* Throws KitError('invalid' | 'too-large' | 'name').
*/
function validateKitData(v) {
	if (!isObj$1(v)) throw new KitError("invalid", "The kit is not an object.");
	const name = kitName(v.name);
	if (!Array.isArray(v.instruments)) throw new KitError("invalid", "The kit has no instrument list.");
	if (v.instruments.length > 512) throw new KitError("too-large", `The kit has more than 512 instruments.`);
	const instruments = v.instruments.map(instrument);
	if (instruments.reduce((a, i) => a + i.samples.length, 0) > 2e3) throw new KitError("too-large", `The kit has more than ${MAX_KIT_REFS} sample assignments.`);
	const kit = {
		name,
		instruments
	};
	const description = cleanText(v.description, MAX_DESCRIPTION);
	if (description) kit.description = description;
	const e = ext(v.ext, "The kit");
	if (e) kit.ext = e;
	return kit;
}
/** Validate a stored kit (KitData plus id and dates). */
function validateKit(v) {
	const data = validateKitData(v);
	const o = v;
	if (typeof o.id !== "string" || !o.id || o.id.length > 128) throw new KitError("invalid", "The kit has no id.");
	const num = (x) => typeof x === "number" && Number.isFinite(x) ? x : 0;
	const kit = {
		...data,
		id: o.id,
		created: num(o.created),
		modified: num(o.modified)
	};
	if (isObj$1(o.origin)) {
		const app = cleanText(o.origin.app, 64);
		const bundled = cleanText(o.origin.bundled, 64);
		if (app || bundled) kit.origin = {
			...app ? { app } : {},
			...bundled ? { bundled } : {}
		};
	}
	return kit;
}
/** Every sample a kit refers to, each once, in order of first use. */
function kitSamples(kit) {
	const ids = /* @__PURE__ */ new Set();
	for (const i of kit.instruments) for (const s of i.samples) ids.add(s.sample);
	return [...ids];
}
/** The kit's data that an application may change, with application data (ext) of others kept. */
function portable(kit) {
	const out = {
		name: kit.name,
		instruments: kit.instruments
	};
	if (kit.description) out.description = kit.description;
	if (kit.ext) out.ext = kit.ext;
	return JSON.parse(JSON.stringify(out));
}
//#endregion
//#region src/kits/roles.ts
/** The common drum vocabulary. Not exhaustive: applications may add roles of their own. */
var DRUM_ROLES = [
	{
		id: "kick",
		label: "KICK",
		family: "kick"
	},
	{
		id: "snare",
		label: "SNARE",
		family: "snare"
	},
	{
		id: "snare-ghost",
		label: "GHOST SNARE",
		family: "snare"
	},
	{
		id: "rim",
		label: "RIM",
		family: "snare"
	},
	{
		id: "clap",
		label: "CLAP",
		family: "perc"
	},
	{
		id: "tom-high",
		label: "HIGH TOM",
		family: "tom"
	},
	{
		id: "tom-mid",
		label: "MID TOM",
		family: "tom"
	},
	{
		id: "tom-low",
		label: "LOW TOM",
		family: "tom"
	},
	{
		id: "hat-closed",
		label: "CLOSED HAT",
		family: "hat"
	},
	{
		id: "hat-pedal",
		label: "PEDAL HAT",
		family: "hat"
	},
	{
		id: "hat-open",
		label: "OPEN HAT",
		family: "hat"
	},
	{
		id: "ride",
		label: "RIDE",
		family: "cymbal"
	},
	{
		id: "crash",
		label: "CRASH",
		family: "cymbal"
	},
	{
		id: "cowbell",
		label: "COWBELL",
		family: "perc"
	},
	{
		id: "shaker",
		label: "SHAKER",
		family: "perc"
	},
	{
		id: "clave",
		label: "CLAVE",
		family: "perc"
	},
	{
		id: "conga",
		label: "CONGA",
		family: "perc"
	},
	{
		id: "perc",
		label: "PERCUSSION",
		family: "perc"
	},
	{
		id: "fx",
		label: "FX",
		family: "other"
	},
	{
		id: "unassigned",
		label: "UNASSIGNED",
		family: "other"
	}
];
var BY_ID = new Map(DRUM_ROLES.map((r) => [r.id, r]));
/** Information about a role (an application role gets a label from its id). */
function roleInfo(id) {
	return BY_ID.get(id) ?? {
		id,
		label: id.replace(/^[^:]*:/, "").replace(/[-_.]+/g, " ").toUpperCase(),
		family: "other"
	};
}
/** The common roles of a family. */
var rolesOf = (family) => DRUM_ROLES.filter((r) => r.family === family).map((r) => r.id);
/** The instrument's samples in pick order: the primary sample first, then the kit's order. */
function pickOrder(ins) {
	const p = ins.samples.findIndex((s) => s.primary);
	return p <= 0 ? [...ins.samples] : [
		ins.samples[p],
		...ins.samples.slice(0, p),
		...ins.samples.slice(p + 1)
	];
}
function withIndexes(xs) {
	const seen = /* @__PURE__ */ new Map();
	return xs.map((x) => {
		const n = seen.get(x.role) ?? 0;
		seen.set(x.role, n + 1);
		return {
			x,
			index: x.index ?? n
		};
	});
}
/**
* Map a kit onto targets.
*
* 1. Same role: a target with room for one sample takes the instrument of its role with the
*    same index (the second SNARE target the second SNARE instrument); a target with unlimited
*    room takes every instrument of its role.
* 2. Alternates: a target still without a sound takes the first unused instrument of the roles
*    it accepts, in order; a target with unlimited room takes every unused instrument of them.
* 3. A target plays at most `capacity` samples of an instrument (primary first); the rest, and
*    every instrument no target took, are reported in `unmapped`.
*
* Instruments without samples are ignored. Deterministic: the same kit and targets always give
* the same mapping.
*/
function mapKit(kit, targets) {
	const ins = withIndexes(kit.instruments.filter((i) => i.samples.length));
	const tgs = withIndexes(targets);
	const used = /* @__PURE__ */ new Set();
	const taken = /* @__PURE__ */ new Map();
	const give = (t, i, match) => {
		used.add(i);
		taken.set(t, [...taken.get(t) ?? [], {
			instrument: i,
			match
		}]);
	};
	const unlimited = (t) => (t.capacity ?? 1) === Infinity;
	for (const { x: t, index } of tgs) {
		const same = ins.filter((i) => i.x.role === t.role && !used.has(i.x));
		if (unlimited(t)) for (const i of same) give(t, i.x, "exact");
		else {
			const hit = same.find((i) => i.index === index);
			if (hit) give(t, hit.x, "exact");
		}
	}
	for (const { x: t } of tgs) {
		if (!unlimited(t) && taken.has(t)) continue;
		for (const role of t.accepts ?? []) {
			const alt = ins.filter((i) => i.x.role === role && !used.has(i.x));
			if (!alt.length) continue;
			if (unlimited(t)) for (const i of alt) give(t, i.x, "alternate");
			else {
				give(t, alt[0].x, "alternate");
				break;
			}
		}
	}
	const mapped = [];
	const unmapped = [];
	for (const { x: t } of tgs) for (const { instrument, match } of taken.get(t) ?? []) {
		const order = pickOrder(instrument);
		const cap = Math.max(0, t.capacity ?? 1);
		mapped.push({
			target: t,
			instrument,
			samples: order.slice(0, cap),
			match
		});
		if (order.length > cap) unmapped.push({
			instrument,
			samples: order.slice(cap),
			reason: "capacity",
			target: t
		});
	}
	for (const { x: i } of ins) if (!used.has(i)) unmapped.push({
		instrument: i,
		samples: [...i.samples],
		reason: "no-target"
	});
	return {
		mapped,
		unmapped,
		empty: targets.filter((t) => !taken.has(t))
	};
}
/** A short, human-readable account of a mapping (plain text, one line per item). */
function describeMapping(m, opts = {}) {
	const name = (r) => opts.sampleName?.(r) ?? r.name ?? r.sample.slice(0, 8);
	const label = (i) => i.label ?? roleInfo(i.role).label;
	const lines = [];
	for (const x of m.mapped) lines.push(`${x.target.label ?? x.target.id} ← ${label(x.instrument)}${x.match === "alternate" ? " (closest match)" : ""}: ${x.samples.map(name).join(", ")}`);
	for (const u of m.unmapped) {
		const n = u.samples.length;
		lines.push(u.reason === "capacity" ? `${label(u.instrument)}: ${n} more sample${n === 1 ? "" : "s"} kept in the kit (${u.target?.label ?? u.target?.id} plays one)` : `${label(u.instrument)}: not played here; ${n} sample${n === 1 ? "" : "s"} kept in the kit and the library`);
	}
	return lines;
}
//#endregion
//#region src/kits/archive.ts
/**
* Portable kits: one ZIP that holds a kit and the original bytes of every sample it uses, so a
* kit moves between browsers and between applications with its audio. Nothing in it depends on
* the browser storage it came from.
*
*   manifest.json            { format: 'slopfactory-kit', version: 1, generator, kit, samples }
*   samples/01-kick.wav      original sample bytes, named for people (the manifest is the index)
*
* Archives are untrusted input: their size, number of files, expansion, paths, manifest and
* every sample's fingerprint are checked before anything is used. Nothing in an archive is
* executed or rendered as HTML.
*/
var KIT_FORMAT = "slopfactory-kit";
var KIT_VERSION = 1;
/** The file extension of portable kits (a plain ZIP: any unzip tool can open it). */
var KIT_EXTENSION = ".kit.zip";
/** What a file chooser should accept for portable kits (applications add their legacy extensions). */
var KIT_ACCEPT = ".zip,application/zip";
var KIT_LIMITS = {
	maxArchiveBytes: 536870912,
	maxEntries: 2048,
	maxEntryBytes: 67108864,
	maxTotalBytes: 805306368,
	maxManifestBytes: 4194304
};
var pad = (n, w) => String(n).padStart(w, "0");
/** Write a portable kit. Every sample the kit uses must be given (KitError('missing-audio') otherwise). */
function writeKitArchive(kit, samples, generator) {
	const data = validateKitData(kit);
	const byId = new Map(samples.map((s) => [s.id, s]));
	const ids = kitSamples(data);
	const missing = ids.filter((id) => !byId.has(id));
	if (missing.length) throw new KitError("missing-audio", `The kit cannot be exported: ${missing.length} sample${missing.length === 1 ? " is" : "s are"} not in this browser.`, missing);
	const w = Math.max(2, String(ids.length).length);
	const list = ids.map((id, n) => {
		const s = byId.get(id);
		const format = s.format || sniffFormat(s.bytes, s.name);
		const stem = slug(s.name.replace(/\.[A-Za-z0-9]{1,5}$/, ""), 40) || "sample";
		const m = {
			id,
			file: `samples/${pad(n + 1, w)}-${stem}.${formatExtension(format)}`,
			name: cleanText(s.name) || `sample ${n + 1}`,
			type: s.type || formatMime(format),
			size: s.bytes.byteLength,
			format
		};
		if (s.duration) m.duration = s.duration;
		if (s.sampleRate) m.sampleRate = s.sampleRate;
		if (s.channels) m.channels = s.channels;
		return m;
	});
	const manifest = {
		format: KIT_FORMAT,
		version: 1,
		generator,
		kit: data,
		samples: list
	};
	const entries = [{
		name: "manifest.json",
		data: new TextEncoder().encode(JSON.stringify(manifest, null, 1))
	}];
	for (const m of list) entries.push({
		name: m.file,
		data: new Uint8Array(byId.get(m.id).bytes)
	});
	return createZip(entries);
}
/** A path inside an archive that names a file and cannot escape it. */
function safeArchivePath(p) {
	return typeof p === "string" && p.length > 0 && p.length <= 240 && !p.startsWith("/") && !p.includes("\\") && !p.includes("\0") && !/^[a-z]:/i.test(p) && p.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var num = (v, max) => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? v : void 0;
/**
* Read a portable kit (or, with `legacy`, an older format). Strict: the whole archive is checked
* and every sample the kit uses must be present and intact, or it throws KitError with the
* problems in `details`. Nothing is stored; the caller decides what to keep.
*/
async function readKitArchive(bytes, opts = {}) {
	const lim = {
		...KIT_LIMITS,
		...opts.limits
	};
	if (bytes.byteLength > lim.maxArchiveBytes) throw new KitError("too-large", `The kit file is larger than ${Math.round(lim.maxArchiveBytes / 1048576)} MB.`);
	let files;
	try {
		files = await readZip(bytes, {
			maxEntries: lim.maxEntries,
			maxEntryBytes: lim.maxEntryBytes,
			maxTotalBytes: lim.maxTotalBytes
		});
	} catch (e) {
		if (e instanceof ZipLimitError) throw new KitError("too-large", `The kit file is too large or has too many files (${e.message}).`);
		throw new KitError("not-a-kit", `This is not a readable kit file (${e.message}).`);
	}
	const byName = /* @__PURE__ */ new Map();
	for (const f of files) {
		if (!safeArchivePath(f.name)) throw new KitError("damaged", `The kit file contains an unsafe path ("${cleanText(f.name, 80)}").`);
		byName.set(f.name, f.data);
	}
	const mf = byName.get("manifest.json");
	if (!mf) throw new KitError("not-a-kit", "This ZIP is not a kit (no manifest.json).");
	if (mf.length > lim.maxManifestBytes) throw new KitError("too-large", "The kit manifest is too large.");
	let manifest;
	try {
		manifest = JSON.parse(new TextDecoder().decode(mf));
	} catch {
		throw new KitError("damaged", "The kit manifest is damaged (not JSON).");
	}
	if (!isObj(manifest)) throw new KitError("damaged", "The kit manifest is damaged.");
	if (manifest.format === "slopfactory-bundle" && opts.legacy) {
		let bundle;
		try {
			bundle = await readBundle(bytes, String(manifest.app));
		} catch (e) {
			throw new KitError("damaged", e.message);
		}
		if (bundle.problems.length) throw new KitError("missing-audio", `The kit file is incomplete: ${bundle.problems.join(" ")}`, bundle.problems);
		const r = await opts.legacy(bundle);
		if (!r) throw new KitError("not-a-kit", "This file is a project bundle, not a kit.");
		const kit = validateKitData(r.kit);
		const have = new Set(r.samples.map((s) => s.id));
		const missing = kitSamples(kit).filter((id) => !have.has(id));
		if (missing.length) throw new KitError("missing-audio", "The kit file is missing audio for some samples.", missing);
		return {
			kit,
			samples: r.samples,
			generator: { app: cleanText(manifest.app, 64) },
			legacy: cleanText(manifest.app, 64)
		};
	}
	if (manifest.format !== "slopfactory-kit") throw new KitError("not-a-kit", "This ZIP is not a kit.");
	if (!(typeof manifest.version === "number" && manifest.version >= 1)) throw new KitError("damaged", "The kit manifest has no format version.");
	if (manifest.version > 1) throw new KitError("version", `This kit was written by a newer version (kit format ${manifest.version}; this application reads up to 1). Update the application to open it.`);
	const kit = validateKitData(manifest.kit);
	const gen = isObj(manifest.generator) ? manifest.generator : {};
	const generator = {
		app: cleanText(gen.app, 64) || "unknown",
		...cleanText(gen.core, 32) ? { core: cleanText(gen.core, 32) } : {}
	};
	if (!Array.isArray(manifest.samples) || manifest.samples.length > lim.maxEntries) throw new KitError("damaged", "The kit manifest has no valid sample list.");
	const problems = [];
	const samples = [];
	const seen = /* @__PURE__ */ new Set();
	for (const m of manifest.samples) {
		if (!isObj(m) || typeof m.id !== "string" || !SAMPLE_ID.test(m.id) || !safeArchivePath(m.file) || !m.file.startsWith("samples/")) {
			problems.push("A sample entry in the manifest is invalid.");
			continue;
		}
		if (seen.has(m.id)) continue;
		const name = cleanText(m.name) || m.file.split("/").pop();
		const data = byName.get(m.file);
		if (!data) {
			problems.push(`Sample "${name}" is missing from the kit file.`);
			continue;
		}
		if (await sha256Hex(data) !== m.id) {
			problems.push(`Sample "${name}" is damaged (its contents do not match its fingerprint).`);
			continue;
		}
		seen.add(m.id);
		const format = sniffFormat(data, name) || cleanText(m.format, 8);
		const s = {
			id: m.id,
			name,
			type: cleanText(m.type, 64),
			size: data.length,
			added: Date.now(),
			bytes: data.slice().buffer,
			format
		};
		const duration = num(m.duration, 36e3);
		const sampleRate = num(m.sampleRate, 768e3);
		const channels = num(m.channels, 64);
		if (duration) s.duration = duration;
		if (sampleRate) s.sampleRate = sampleRate;
		if (channels) s.channels = Math.round(channels);
		samples.push(s);
	}
	const missing = kitSamples(kit).filter((id) => !seen.has(id));
	if (missing.length && !problems.length) problems.push(`${missing.length} sample${missing.length === 1 ? " the kit uses is" : "s the kit uses are"} not in the kit file.`);
	if (problems.length) throw new KitError("missing-audio", `The kit file is incomplete or damaged: ${problems.join(" ")}`, problems);
	return {
		kit,
		samples,
		generator
	};
}
/** A file name for an exported kit: "<name>.kit.zip", safe on every system. */
function kitFileName(name) {
	return (name.replace(/[^\w .()-]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 64) || "kit") + KIT_EXTENSION;
}
//#endregion
//#region src/kits/store.ts
/**
* Where a kit library keeps its kits and its sample index (names, formats, durations). Audio
* bytes are not here: they stay in the application's SampleStore (content-addressed), which
* applications already have, so existing samples need no migration.
*
* Each application has its own library, because browser storage belongs to the page's origin:
* two applications on two addresses cannot read each other's IndexedDB, whatever code they
* share. Kits move between applications as portable files (archive.ts).
*
* Writes are committed together: one `commit` either applies every change or none.
*/
/** The schema of IndexedDbKitStore databases. Upgrades only ever add. */
var KIT_STORE_SCHEMA = 1;
var clone = (v) => v === void 0 ? v : JSON.parse(JSON.stringify(v));
/** In memory (tests, or browsers without IndexedDB: nothing outlives the page). */
var MemoryKitStore = class {
	kits = /* @__PURE__ */ new Map();
	samples = /* @__PURE__ */ new Map();
	meta = /* @__PURE__ */ new Map();
	/** set to make the next commit fail (tests) */
	failNext = null;
	async listKits() {
		return [...this.kits.values()].map(clone);
	}
	async getKit(id) {
		return clone(this.kits.get(id) ?? null);
	}
	async listSamples() {
		return [...this.samples.values()].map(clone);
	}
	async getSample(id) {
		return clone(this.samples.get(id) ?? null);
	}
	async getMeta(key) {
		return clone(this.meta.get(key));
	}
	async commit(c) {
		if (this.failNext) {
			const e = this.failNext;
			this.failNext = null;
			throw e;
		}
		for (const k of c.putKits ?? []) this.kits.set(k.id, clone(k));
		for (const id of c.deleteKits ?? []) this.kits.delete(id);
		for (const s of c.putSamples ?? []) this.samples.set(s.id, clone(s));
		for (const id of c.deleteSamples ?? []) this.samples.delete(id);
		for (const [k, v] of Object.entries(c.meta ?? {})) if (v === void 0) this.meta.delete(k);
		else this.meta.set(k, clone(v));
	}
};
function req(r) {
	return new Promise((resolve, reject) => {
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
}
function wrap(e) {
	if (e instanceof StorageError) return e;
	const name = e?.name ?? "";
	if (name === "QuotaExceededError") return new StorageError("quota", "Browser storage is full: nothing was saved. Free some space or delete unused samples.");
	return new StorageError("failed", `Browser storage failed: ${e?.message || name || "unknown error"}.`);
}
var STORES = [
	"kits",
	"samples",
	"meta"
];
/** IndexedDB: one database per application (for example `<app>-kit-library`). */
var IndexedDbKitStore = class {
	dbName;
	factory;
	db = null;
	constructor(dbName, factory = globalThis.indexedDB ?? null) {
		this.dbName = dbName;
		this.factory = factory;
	}
	open() {
		if (!this.db) {
			const f = this.factory;
			if (!f) return Promise.reject(new StorageError("unavailable", "This browser has no IndexedDB, so kits cannot be kept between visits."));
			this.db = new Promise((resolve, reject) => {
				let r;
				try {
					r = f.open(this.dbName, 1);
				} catch (e) {
					reject(new StorageError("unavailable", `Browser storage is unavailable (${e.message}).`));
					return;
				}
				r.onupgradeneeded = () => {
					const db = r.result;
					if (!db.objectStoreNames.contains("kits")) db.createObjectStore("kits", { keyPath: "id" });
					if (!db.objectStoreNames.contains("samples")) db.createObjectStore("samples", { keyPath: "id" });
					if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
				};
				r.onsuccess = () => {
					r.result.onversionchange = () => r.result.close();
					resolve(r.result);
				};
				r.onerror = () => reject(new StorageError(r.error?.name === "VersionError" ? "failed" : "unavailable", r.error?.name === "VersionError" ? "This kit library was saved by a newer version of the application. Reload the latest version; nothing was changed." : `Browser storage is unavailable (${r.error?.message ?? "blocked"}).`));
				r.onblocked = () => reject(new StorageError("unavailable", "Browser storage is blocked by another tab."));
			});
			this.db.catch(() => this.db = null);
		}
		return this.db;
	}
	async read(store, fn) {
		const db = await this.open();
		try {
			return await req(fn(db.transaction(store, "readonly").objectStore(store)));
		} catch (e) {
			throw wrap(e);
		}
	}
	async listKits() {
		return this.read("kits", (s) => s.getAll());
	}
	async getKit(id) {
		return await this.read("kits", (s) => s.get(id)) ?? null;
	}
	async listSamples() {
		return this.read("samples", (s) => s.getAll());
	}
	async getSample(id) {
		return await this.read("samples", (s) => s.get(id)) ?? null;
	}
	async getMeta(key) {
		return await this.read("meta", (s) => s.get(key)) ?? void 0;
	}
	async commit(c) {
		const db = await this.open();
		try {
			const t = db.transaction([...STORES], "readwrite");
			const done = new Promise((resolve, reject) => {
				t.oncomplete = () => resolve();
				t.onerror = () => reject(t.error);
				t.onabort = () => reject(t.error ?? /* @__PURE__ */ new Error("aborted"));
			});
			done.catch(() => {});
			try {
				const kits = t.objectStore("kits");
				const samples = t.objectStore("samples");
				const meta = t.objectStore("meta");
				for (const [k, v] of Object.entries(c.meta ?? {})) if (v === void 0) meta.delete(k);
				else meta.put(clone(v), k);
				for (const s of c.putSamples ?? []) samples.put(clone(s));
				for (const id of c.deleteSamples ?? []) samples.delete(id);
				for (const k of c.putKits ?? []) kits.put(clone(k));
				for (const id of c.deleteKits ?? []) kits.delete(id);
			} catch (e) {
				t.abort();
				throw e;
			}
			await done;
		} catch (e) {
			throw wrap(e);
		}
	}
};
//#endregion
//#region src/kits/library.ts
/**
* The kit library: an application's samples and kits in this browser.
*
* - **Samples** are imported once (decoded to validate them, then kept as their original bytes
*   in the application's SampleStore, keyed by SHA-256) and indexed here with their metadata.
*   Importing the same file again finds the stored one. Any kit can use any sample.
* - **Kits** refer to samples by id. Duplicating or renaming a kit copies no audio. Deleting a
*   kit never deletes a sample that another kit or the application still uses.
* - **Portable kits** are exported with their audio and imported from files (archive.ts).
* - Decoded audio is cached (least recently used, within a memory budget), so switching kits
*   does not decode the same samples again; nothing is decoded until it is needed.
*
* Every operation either completes or changes nothing, and fails with a KitError, StorageError
* or SampleError whose message is meant for the user.
*/
var yieldToBrowser = () => new Promise((r) => setTimeout(r, 0));
var sameName = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
var audioBytes = (d) => d.channels.reduce((a, c) => a + c.length * 4, 0);
/** Decoded samples by id, least recently used dropped first beyond a memory budget. */
var DecodeCache = class {
	maxBytes;
	items = /* @__PURE__ */ new Map();
	used = 0;
	constructor(maxBytes = 167772160) {
		this.maxBytes = maxBytes;
	}
	get(id, load) {
		const hit = this.items.get(id);
		if (hit) {
			this.items.delete(id);
			this.items.set(id, hit);
			return hit.p;
		}
		const entry = {
			p: load(),
			bytes: 0
		};
		this.items.set(id, entry);
		entry.p.then((d) => {
			if (this.items.get(id) !== entry) return;
			entry.bytes = audioBytes(d);
			this.used += entry.bytes;
			this.trim(id);
		}, () => this.items.get(id) === entry && this.items.delete(id));
		return entry.p;
	}
	set(id, d) {
		this.drop(id);
		const entry = {
			p: Promise.resolve(d),
			bytes: audioBytes(d)
		};
		this.items.set(id, entry);
		this.used += entry.bytes;
		this.trim(id);
	}
	has(id) {
		return this.items.has(id);
	}
	drop(id) {
		const e = this.items.get(id);
		if (!e) return;
		this.used -= e.bytes;
		this.items.delete(id);
	}
	clear() {
		this.items.clear();
		this.used = 0;
	}
	get bytes() {
		return this.used;
	}
	trim(keep) {
		for (const [id, e] of this.items) {
			if (this.used <= this.maxBytes) break;
			if (id === keep || !e.bytes) continue;
			this.drop(id);
		}
	}
};
var KitLibrary = class {
	opts;
	app;
	cache;
	now;
	newId;
	constructor(opts) {
		this.opts = opts;
		this.app = opts.app;
		this.cache = new DecodeCache(opts.cacheBytes);
		this.now = opts.now ?? (() => Date.now());
		this.newId = opts.newId ?? (() => globalThis.crypto.randomUUID());
	}
	/** Whether kits and samples outlive the page (browser storage is available). */
	get persistent() {
		return !!(this.opts.audio && this.opts.store);
	}
	get audio() {
		return this.opts.audio;
	}
	stores() {
		if (!this.opts.audio || !this.opts.store) throw new KitError("unavailable", "Browser storage is unavailable, so kits cannot be kept in this browser. You can still export the current kit.");
		return {
			audio: this.opts.audio,
			store: this.opts.store
		};
	}
	decode(bytes, name) {
		return (this.opts.decode ?? ((b, n) => decodeSample(b, n)))(bytes, name);
	}
	/**
	* Import one sample: decoded first (an unsupported or damaged file throws SampleError and
	* nothing is stored), then kept as its original bytes and indexed. The same audio imported
	* again is the same sample (`duplicate`). Without browser storage the sample is still
	* returned, for this visit (`stored: false`).
	*/
	async addSample(bytes, name, type = "") {
		const fileName = cleanText(name) || "sample";
		const decoded = await this.decode(bytes, fileName);
		const s = await sampleFromBytes(bytes, fileName, type);
		const { audio, store } = this.opts;
		const existing = store ? await store.getSample(s.id) : null;
		const info = {
			...existing ?? {
				id: s.id,
				name: fileName,
				type: s.type,
				size: s.size,
				added: this.now(),
				format: sniffFormat(bytes, fileName)
			},
			duration: decoded.duration,
			sampleRate: decoded.sampleRate,
			channels: decoded.channels.length
		};
		let stored = false;
		if (audio && store) {
			const had = await audio.has(s.id);
			if (!had) await audio.put(s);
			try {
				await store.commit({ putSamples: [info] });
			} catch (e) {
				if (!had && !existing) await audio.delete(s.id).catch(() => {});
				throw e;
			}
			stored = true;
		}
		this.cache.set(s.id, decoded);
		return {
			sample: info,
			decoded,
			duplicate: !!existing,
			stored
		};
	}
	/**
	* Import several files, one at a time (the page stays responsive). A file that fails is
	* reported and skipped; the others are kept.
	*/
	async importFiles(files, onProgress) {
		const report = {
			added: [],
			duplicates: [],
			errors: []
		};
		for (let i = 0; i < files.length; i++) {
			onProgress?.(i, files.length);
			const f = files[i];
			try {
				const r = await this.addSample(await f.arrayBuffer(), f.name, f.type ?? "");
				(r.duplicate ? report.duplicates : report.added).push(r);
			} catch (e) {
				report.errors.push({
					name: cleanText(f.name),
					message: e instanceof Error ? e.message : String(e)
				});
				if (e instanceof StorageError && e.code === "quota") {
					for (const rest of files.slice(i + 1)) report.errors.push({
						name: cleanText(rest.name),
						message: "Not imported: browser storage is full."
					});
					break;
				}
			}
			await yieldToBrowser();
		}
		onProgress?.(files.length, files.length);
		return report;
	}
	/**
	* Index a sample whose bytes are already in the audio store (migrating an application's
	* existing samples): no decoding, nothing copied. False if the audio is not there.
	*/
	async indexSample(id, info) {
		const { audio, store } = this.stores();
		if (!await audio.has(id)) return false;
		if (await store.getSample(id)) return true;
		await store.commit({ putSamples: [{
			id,
			type: "",
			size: 0,
			added: this.now(),
			format: "",
			...info,
			name: cleanText(info.name) || "sample"
		}] });
		return true;
	}
	async listSamples() {
		if (!this.opts.store) return [];
		return (await this.opts.store.listSamples()).sort((a, b) => a.name.localeCompare(b.name));
	}
	async getSample(id) {
		return this.opts.store ? this.opts.store.getSample(id) : null;
	}
	/** A sample's original bytes with its library information, or null if they are not in this browser. */
	async readSample(id) {
		const s = this.opts.audio ? await this.opts.audio.get(id) : null;
		if (!s) return null;
		const info = await this.getSample(id);
		return info ? {
			...s,
			name: info.name || s.name,
			format: info.format,
			duration: info.duration,
			sampleRate: info.sampleRate,
			channels: info.channels
		} : s;
	}
	/** A sample's decoded audio (cached). Throws KitError('missing-audio') if it is not in this browser. */
	decoded(id, name = "sample") {
		return this.cache.get(id, async () => {
			const s = this.opts.audio ? await this.opts.audio.get(id) : null;
			if (!s) throw new KitError("missing-audio", `"${name}" is not in this browser's storage. Import the file again, or a kit that contains it.`, [id]);
			return this.decode(s.bytes, s.name || name);
		});
	}
	/** Change a sample's name or descriptive metadata. */
	async updateSample(id, patch) {
		const { store } = this.stores();
		const s = await store.getSample(id);
		if (!s) throw new KitError("not-found", "That sample is no longer in the library.");
		const next = {
			...s,
			...patch
		};
		if (patch.name !== void 0) next.name = cleanText(patch.name) || s.name;
		if (patch.description !== void 0) next.description = cleanText(patch.description, 2e3) || void 0;
		if (patch.tags !== void 0) next.tags = patch.tags.map((t) => cleanText(t, 32)).filter(Boolean).slice(0, 32);
		await store.commit({ putSamples: [next] });
		return next;
	}
	/** Which saved kits use a sample, and whether the application does. */
	async usage(id) {
		const kits = this.opts.store ? await this.opts.store.listKits() : [];
		const app = new Set(await (this.opts.inUse?.() ?? []));
		return {
			kits: kits.filter((k) => kitSamples(k).includes(id)).map((k) => k.id),
			app: app.has(id)
		};
	}
	/** Delete a sample from this browser. Refused (KitError('in-use')) while a kit or the application uses it. */
	async removeSample(id) {
		const { audio, store } = this.stores();
		const u = await this.usage(id);
		if (u.kits.length || u.app) {
			const names = (await store.listKits()).filter((k) => u.kits.includes(k.id)).map((k) => `"${k.name}"`);
			throw new KitError("in-use", `This sample is still used${names.length ? ` by ${names.join(", ")}` : ""}${u.app ? `${names.length ? " and" : ""} by the current sounds` : ""}, so it was kept.`);
		}
		await store.commit({ deleteSamples: [id] });
		await audio.delete(id);
		this.cache.drop(id);
	}
	/** Delete every library sample that no kit and nothing in the application uses. Returns how many. */
	async removeUnused() {
		const { audio, store } = this.stores();
		const keep = new Set(await (this.opts.inUse?.() ?? []));
		for (const k of await store.listKits()) for (const id of kitSamples(k)) keep.add(id);
		const gone = (await store.listSamples()).filter((s) => !keep.has(s.id)).map((s) => s.id);
		if (!gone.length) return 0;
		await store.commit({ deleteSamples: gone });
		for (const id of gone) {
			await audio.delete(id).catch(() => {});
			this.cache.drop(id);
		}
		return gone.length;
	}
	/** Samples a kit uses whose audio is not in this browser. */
	async missing(kit) {
		const audio = this.opts.audio;
		const out = [];
		for (const id of kitSamples(kit)) if (!audio || !await audio.has(id)) out.push(id);
		return out;
	}
	async listKits() {
		if (!this.opts.store) return [];
		return (await this.opts.store.listKits()).map((k) => ({
			id: k.id,
			name: k.name,
			...k.description ? { description: k.description } : {},
			samples: kitSamples(k).length,
			instruments: k.instruments.length,
			modified: k.modified,
			...k.origin?.bundled ? { bundled: k.origin.bundled } : {}
		})).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
	}
	async getKit(id) {
		return this.opts.store ? this.opts.store.getKit(id) : null;
	}
	async mustGet(id) {
		const k = await this.stores().store.getKit(id);
		if (!k) throw new KitError("not-found", "That kit no longer exists.");
		return k;
	}
	/**
	* Save a kit (new without `id`, else replacing the kit with that id). `audio` gives the bytes
	* of samples the library may not have yet (they are stored first). A different kit with the
	* same name (case-insensitive) is an error unless `replace` (after asking the user): then
	* that kit is replaced in the same step.
	*/
	async saveKit(input, opts = {}) {
		const { audio, store } = this.stores();
		const data = validateKitData(input);
		const kits = await store.listKits();
		const prior = input.id ? kits.find((k) => k.id === input.id) : void 0;
		const clash = kits.find((k) => k.id !== input.id && sameName(k.name, data.name));
		if (clash && !opts.replace) throw new KitError("exists", `A kit named "${clash.name}" already exists.`);
		const given = new Map((opts.audio ?? []).map((s) => [s.id, s]));
		const infos = [];
		const added = [];
		try {
			for (const id of kitSamples(data)) {
				const info = await store.getSample(id);
				const s = given.get(id);
				if (s && !await audio.has(id)) {
					await audio.put(s);
					added.push(id);
				}
				if (!info && (s || await audio.has(id))) {
					const ref = data.instruments.flatMap((i) => i.samples).find((r) => r.sample === id);
					infos.push({
						id,
						name: cleanText(s?.name ?? ref?.name) || "sample",
						type: s?.type ?? "",
						size: s?.bytes.byteLength ?? 0,
						added: this.now(),
						format: s ? s.format || sniffFormat(s.bytes, s.name) : "",
						...s?.duration ? {
							duration: s.duration,
							sampleRate: s.sampleRate,
							channels: s.channels
						} : {}
					});
				}
			}
			const now = this.now();
			const kit = {
				...data,
				id: input.id ?? this.newId(),
				created: prior?.created ?? now,
				modified: now,
				...input.origin ?? prior?.origin ? { origin: input.origin ?? prior?.origin } : {}
			};
			const meta = {};
			if (clash) {
				if (await store.getMeta("default") === clash.id) meta.default = kit.id;
				if (await store.getMeta("current") === clash.id) meta.current = kit.id;
			}
			await store.commit({
				putKits: [kit],
				deleteKits: clash ? [clash.id] : [],
				putSamples: infos,
				meta
			});
			return kit;
		} catch (e) {
			for (const id of added) await audio.delete(id).catch(() => {});
			throw e;
		}
	}
	/** A new, empty kit. */
	createKit(name) {
		return this.saveKit({
			name,
			instruments: []
		});
	}
	async renameKit(id, name) {
		const kit = await this.mustGet(id);
		const n = kitName(name);
		const clash = (await this.stores().store.listKits()).find((k) => k.id !== id && sameName(k.name, n));
		if (clash) throw new KitError("exists", `A kit named "${clash.name}" already exists.`);
		const next = {
			...kit,
			name: n,
			modified: this.now()
		};
		await this.stores().store.commit({ putKits: [next] });
		return next;
	}
	/** A copy of a saved kit, sharing its samples (no audio is copied). */
	async duplicateKit(id, name) {
		const kit = await this.mustGet(id);
		const taken = (await this.stores().store.listKits()).map((k) => k.name);
		const n = name === void 0 ? uniqueKitName(copyName(kit.name), taken) : kitName(name);
		const { id: _id, created: _c, modified: _m, origin: _o, ...data } = kit;
		return this.saveKit({
			...data,
			name: n
		});
	}
	/**
	* Delete a saved kit. Its samples stay in the library; with `removeUnusedSamples`, those that
	* no other kit and nothing in the application uses are deleted too. Returns how many were.
	*/
	async deleteKit(id, opts = {}) {
		const { audio, store } = this.stores();
		const kit = await this.mustGet(id);
		const meta = {};
		if (await store.getMeta("default") === id) meta.default = void 0;
		if (await store.getMeta("current") === id) meta.current = void 0;
		let gone = [];
		if (opts.removeUnusedSamples) {
			const keep = new Set(await (this.opts.inUse?.() ?? []));
			for (const k of await store.listKits()) if (k.id !== id) for (const s of kitSamples(k)) keep.add(s);
			gone = kitSamples(kit).filter((s) => !keep.has(s));
		}
		await store.commit({
			deleteKits: [id],
			deleteSamples: gone,
			meta
		});
		for (const s of gone) {
			await audio.delete(s).catch(() => {});
			this.cache.drop(s);
		}
		return gone.length;
	}
	/** Point every use of one sample in a saved kit at another (to resolve a missing sample). */
	async replaceSample(kitId, from, to) {
		const kit = await this.mustGet(kitId);
		if (!await this.getSample(to)) throw new KitError("not-found", "The replacement sample is not in the library.");
		const instruments = kit.instruments.map((i) => ({
			...i,
			samples: i.samples.map((s) => s.sample === from ? {
				...s,
				sample: to
			} : s)
		}));
		return this.saveKit({
			...kit,
			instruments
		});
	}
	/** A portable kit file with every sample's audio. KitError('missing-audio') if any is not in this browser. */
	async exportKit(kit, extra = []) {
		const data = validateKitData(kit);
		const given = new Map(extra.map((s) => [s.id, s]));
		const samples = [];
		const missing = [];
		for (const id of kitSamples(data)) {
			const s = given.get(id) ?? await this.readSample(id);
			if (s) samples.push(s);
			else missing.push(data.instruments.flatMap((i) => i.samples).find((r) => r.sample === id)?.name ?? id.slice(0, 8));
		}
		if (missing.length) throw new KitError("missing-audio", `The kit cannot be exported: these samples are not in this browser: ${missing.join(", ")}. Import them again (or remove them from the kit) first.`, missing);
		return {
			bytes: writeKitArchive(data, samples, {
				app: this.app,
				core: CORE_VERSION
			}),
			fileName: kitFileName(data.name)
		};
	}
	/**
	* Import a portable kit file. Everything is checked first (the archive, the manifest, every
	* sample's fingerprint, and that every sample decodes); then its samples join the library
	* (those already there are reused) and, with `save` (the default), the kit is saved under a
	* new id (a taken name gets a number). Without `save` the samples are kept but the kit is
	* only returned, for the application to open unsaved. On any failure nothing is kept.
	*/
	async importKit(bytes, opts = {}) {
		const r = await readKitArchive(bytes, { legacy: opts.legacy });
		const problems = [];
		for (const s of r.samples) {
			try {
				const d = await this.decode(s.bytes, s.name);
				this.cache.set(s.id, d);
				s.duration ??= d.duration;
				s.sampleRate ??= d.sampleRate;
				s.channels ??= d.channels.length;
			} catch (e) {
				problems.push(e instanceof SampleError ? e.message : `"${s.name}" could not be decoded.`);
			}
			await yieldToBrowser();
		}
		if (problems.length) throw new KitError("damaged", `The kit contains audio this browser cannot play: ${problems.join(" ")}`, problems);
		const save = opts.save !== false;
		const base = {
			kit: r.kit,
			origin: { app: r.generator.app }
		};
		if (!this.persistent) {
			if (save) this.stores();
			return {
				kit: {
					...r.kit,
					id: this.newId(),
					created: this.now(),
					modified: this.now(),
					origin: base.origin
				},
				saved: false,
				renamed: false,
				added: r.samples.length,
				...r.legacy ? { legacy: r.legacy } : {}
			};
		}
		const { audio, store } = this.stores();
		const fresh = [];
		try {
			const infos = [];
			for (const s of r.samples) {
				if (!await audio.has(s.id)) {
					await audio.put(s);
					fresh.push(s.id);
				}
				const info = await store.getSample(s.id);
				if (!info) infos.push({
					id: s.id,
					name: s.name,
					type: s.type,
					size: s.size,
					added: this.now(),
					format: s.format || sniffFormat(s.bytes, s.name),
					duration: s.duration,
					sampleRate: s.sampleRate,
					channels: s.channels
				});
				else if (info.duration === void 0 && s.duration) infos.push({
					...info,
					duration: s.duration,
					sampleRate: s.sampleRate,
					channels: s.channels
				});
			}
			const now = this.now();
			let kit = {
				...r.kit,
				id: this.newId(),
				created: now,
				modified: now,
				origin: base.origin
			};
			let renamed = false;
			if (save) {
				const name = uniqueKitName(r.kit.name, (await store.listKits()).map((k) => k.name));
				renamed = name !== r.kit.name;
				kit = {
					...kit,
					name
				};
				await store.commit({
					putKits: [kit],
					putSamples: infos
				});
			} else await store.commit({ putSamples: infos });
			return {
				kit,
				saved: save,
				renamed,
				added: fresh.length,
				...r.legacy ? { legacy: r.legacy } : {}
			};
		} catch (e) {
			for (const id of fresh) await audio.delete(id).catch(() => {});
			throw e;
		}
	}
	/** The kit to open at startup (null: none chosen). */
	async getDefault() {
		return (await this.opts.store?.getMeta("default") ?? null) || null;
	}
	async setDefault(id) {
		if (id) await this.mustGet(id);
		await this.stores().store.commit({ meta: { default: id ?? void 0 } });
	}
	/** The kit last loaded or saved. */
	async getCurrent() {
		return (await this.opts.store?.getMeta("current") ?? null) || null;
	}
	async setCurrent(id) {
		if (!this.opts.store) return;
		await this.opts.store.commit({ meta: { current: id ?? void 0 } });
	}
	/** Application values kept with the library (small JSON). */
	async getMeta(key) {
		return this.opts.store?.getMeta(`app:${key}`);
	}
	async setMeta(key, value) {
		await this.stores().store.commit({ meta: { [`app:${key}`]: value } });
	}
};
//#endregion
//#region src/kits/session.ts
var KitSession = class {
	library;
	host;
	/** saved kits, kept up to date for views to read synchronously */
	kits = [];
	defaultId = null;
	/** the saved kit the current sounds came from or were saved as (null: not saved) */
	currentId = null;
	/** the current kit's name */
	name;
	/** the kit last loaded, saved or imported (its data the application does not use is kept) */
	base = null;
	baseline = "";
	listeners = /* @__PURE__ */ new Set();
	untitled;
	constructor(library, host, opts = {}) {
		this.library = library;
		this.host = host;
		this.untitled = opts.untitled ?? "Untitled Kit";
		this.name = this.untitled;
		this.baseline = host.signature();
	}
	/** Changes since the kit was loaded or saved (an imported kit is unsaved until saved). */
	get dirty() {
		return this.host.signature() !== this.baseline;
	}
	onChange(f) {
		this.listeners.add(f);
		return () => this.listeners.delete(f);
	}
	emit() {
		for (const f of this.listeners) f();
	}
	/** Re-read the saved kits and preferences. */
	async refresh() {
		this.kits = await this.library.listKits();
		this.defaultId = await this.library.getDefault();
		if (this.currentId && !this.kits.some((k) => k.id === this.currentId)) this.currentId = null;
		this.emit();
	}
	/** Mark the current sounds as matching the current kit (after the application restored them itself). */
	markSaved() {
		this.baseline = this.host.signature();
		this.record();
		this.emit();
	}
	/** Remember the current kit and the fingerprint of its sounds (for `resume` after a reload). */
	async record() {
		await this.library.setCurrent(this.currentId).catch(() => {});
		if (this.library.persistent) await this.library.setMeta("session", {
			id: this.currentId,
			name: this.name,
			signature: this.baseline
		}).catch(() => {});
	}
	/**
	* At startup, for applications that keep the current sounds themselves (a project that is
	* autosaved): take the kit last loaded or saved as the current kit **without** applying it.
	* The sounds count as unsaved if they changed since (the fingerprint recorded then differs).
	*/
	async resume() {
		await this.refresh();
		const rec = await this.library.getMeta("session").catch(() => void 0);
		const kit = rec?.id ? await this.library.getKit(rec.id) : null;
		if (kit) {
			this.currentId = kit.id;
			this.name = kit.name;
			this.base = kit;
		} else if (rec && !rec.id && rec.name) this.name = rec.name;
		this.baseline = rec ? rec.signature : this.host.signature();
		this.emit();
	}
	/**
	* At startup: open the default kit, else the kit last used. Returns a message if that failed
	* (the current sounds are then unchanged), or null.
	*/
	async restore() {
		await this.refresh();
		const id = this.defaultId ?? await this.library.getCurrent();
		if (!id || !this.kits.some((k) => k.id === id)) return null;
		try {
			await this.load(id);
			return null;
		} catch (e) {
			return e instanceof Error ? e.message : String(e);
		}
	}
	/** How a saved kit (or kit data) would map onto the application, without loading it. */
	async preview(kit) {
		const k = typeof kit === "string" ? await this.library.getKit(kit) : kit;
		if (!k) throw new KitError("not-found", "That kit no longer exists.");
		return {
			kit: k,
			mapping: mapKit(k, this.host.targets()),
			missing: await this.library.missing(k)
		};
	}
	/** A new, empty, unsaved kit. */
	async newKit() {
		await this.host.clear();
		this.currentId = null;
		this.base = null;
		this.name = this.untitled;
		this.baseline = this.host.signature();
		await this.record();
		this.emit();
	}
	async captureKit(name) {
		const c = await this.host.capture(this.base);
		const data = {
			...this.base ? portable(this.base) : {},
			name,
			instruments: c.instruments
		};
		if (c.ext) data.ext = {
			...this.base?.ext ?? {},
			...c.ext
		};
		return {
			data,
			audio: c.audio ?? []
		};
	}
	/**
	* Save the current sounds: over the current saved kit (renaming it if `name` differs), or as
	* a new kit if there is none.
	*/
	async save(name = this.name, opts = {}) {
		if (!this.currentId) return this.saveAs(name, opts);
		return this.store(kitName(name), this.currentId, opts.replace);
	}
	/** Save the current sounds as a new kit. KitError('exists') if the name is taken (unless `replace`). */
	async saveAs(name, opts = {}) {
		return this.store(kitName(name), void 0, opts.replace);
	}
	async store(name, id, replace) {
		const signature = this.host.signature();
		const { data, audio } = await this.captureKit(name);
		const kit = await this.library.saveKit({
			...data,
			id
		}, {
			audio,
			replace
		});
		this.currentId = kit.id;
		this.name = kit.name;
		this.base = kit;
		this.baseline = signature;
		await this.record();
		await this.refresh();
		return kit;
	}
	/** Load a saved kit (the application plays its mapping). Nothing changes if it fails. */
	async load(id) {
		const kit = await this.library.getKit(id);
		if (!kit) throw new KitError("not-found", "That kit no longer exists.");
		const mapping = mapKit(kit, this.host.targets());
		await this.host.apply(kit, mapping);
		this.currentId = kit.id;
		this.name = kit.name;
		this.base = kit;
		this.baseline = this.host.signature();
		await this.record();
		await this.refresh();
		return mapping;
	}
	/**
	* Import a kit file. `open` (the default) plays it at once, unsaved (SAVE keeps it); its
	* samples join the library either way. With `save`, it is also saved as a new kit.
	*/
	async importFile(bytes, opts = {}) {
		const r = await this.library.importKit(bytes, {
			save: !!opts.save,
			legacy: opts.legacy
		});
		let mapping;
		if (opts.open !== false) {
			mapping = mapKit(r.kit, this.host.targets());
			await this.host.apply(r.kit, mapping);
			this.base = portable(r.kit);
			this.name = r.kit.name;
			this.currentId = r.saved ? r.kit.id : null;
			this.baseline = r.saved ? this.host.signature() : "";
			await this.record();
		}
		await this.refresh();
		return {
			...r,
			mapping
		};
	}
	/** The current sounds (unsaved changes included) as a portable kit file. */
	async exportCurrent(name = this.name) {
		const { data, audio } = await this.captureKit(kitName(name));
		return this.library.exportKit(data, audio);
	}
	/** A saved kit as a portable kit file. */
	async exportSaved(id) {
		const kit = await this.library.getKit(id);
		if (!kit) throw new KitError("not-found", "That kit no longer exists.");
		return this.library.exportKit(kit);
	}
	async rename(id, name) {
		const k = await this.library.renameKit(id, name);
		if (id === this.currentId) {
			this.name = k.name;
			if (this.base) this.base = {
				...this.base,
				name: k.name
			};
			await this.record();
		}
		await this.refresh();
	}
	async duplicate(id, name) {
		const k = await this.library.duplicateKit(id, name);
		await this.refresh();
		return k;
	}
	/** Delete a saved kit (its samples stay in the library unless `removeUnusedSamples`). The current sounds are kept, now unsaved. */
	async delete(id, opts = {}) {
		const n = await this.library.deleteKit(id, opts);
		if (id === this.currentId) {
			this.currentId = null;
			this.baseline = "";
			await this.record();
		}
		await this.refresh();
		return n;
	}
	async setDefault(id) {
		await this.library.setDefault(id);
		await this.refresh();
	}
};
//#endregion
//#region src/kits/audition.ts
var Auditioner = class {
	opts;
	playing = null;
	buffers = /* @__PURE__ */ new Map();
	constructor(opts) {
		this.opts = opts;
	}
	async ctx() {
		const ctx = await this.opts.context();
		if (!ctx) return null;
		if (ctx.state === "suspended") await ctx.resume().catch(() => {});
		return ctx.state === "closed" ? null : ctx;
	}
	buffer(ctx, key, audio) {
		if (!("channels" in audio)) return audio;
		const hit = key ? this.buffers.get(key) : void 0;
		if (hit && hit.sampleRate === audio.sampleRate) return hit;
		const len = audio.channels[0]?.length ?? 0;
		const buf = ctx.createBuffer(Math.max(1, audio.channels.length), Math.max(1, len), audio.sampleRate);
		audio.channels.forEach((c, i) => buf.copyToChannel(c, i));
		if (key) {
			this.buffers.delete(key);
			this.buffers.set(key, buf);
			while (this.buffers.size > (this.opts.keep ?? 8)) this.buffers.delete(this.buffers.keys().next().value);
		}
		return buf;
	}
	/** Play audio now (stopping any preview still sounding). False if audio is unavailable. */
	async play(audio, opts = {}) {
		const ctx = await this.ctx();
		if (!ctx) return false;
		this.stop();
		const out = this.opts.output?.() ?? ctx.destination;
		const src = ctx.createBufferSource();
		src.buffer = this.buffer(ctx, opts.key, audio);
		const gain = ctx.createGain();
		gain.gain.value = opts.gain ?? this.opts.gain ?? .8;
		src.connect(gain);
		gain.connect(out);
		const voice = {
			src,
			gain
		};
		src.onended = () => {
			src.disconnect();
			gain.disconnect();
			if (this.playing === voice) this.playing = null;
		};
		this.playing = voice;
		src.start();
		return true;
	}
	/** Play a library sample (decoded once and cached by the library). */
	async playSample(library, id, opts = {}) {
		const cached = this.buffers.get(id);
		return this.play(cached ?? await library.decoded(id, opts.name), {
			key: id,
			gain: opts.gain
		});
	}
	/** Stop the preview that is sounding, if any. */
	stop() {
		const p = this.playing;
		if (!p) return;
		this.playing = null;
		try {
			p.src.stop();
		} catch {}
		p.src.disconnect();
		p.gain.disconnect();
	}
	get active() {
		return !!this.playing;
	}
	/** Forget cached buffers (after samples are deleted). */
	forget(id) {
		if (id) this.buffers.delete(id);
		else this.buffers.clear();
	}
};
//#endregion
//#region src/kits/migrate.ts
/**
* Run a migration once. `id` names it ('legacy-kits-v1'); `run` does the work through `step`.
* Recorded under the library's application values (`migration:<id>`).
*/
async function migrateOnce(library, id, run) {
	const report = {
		ran: false,
		migrated: 0,
		problems: []
	};
	if (!library.persistent) return report;
	try {
		if (await library.getMeta(`migration:${id}`)) return report;
		report.ran = true;
		const done = new Set(await library.getMeta(`migration:${id}:items`) ?? []);
		await run({
			step: async (item, fn) => {
				if (done.has(item)) return false;
				try {
					await fn();
				} catch (e) {
					report.problems.push(`${item}: ${e instanceof Error ? e.message : String(e)}`);
					return false;
				}
				done.add(item);
				report.migrated++;
				await library.setMeta(`migration:${id}:items`, [...done]);
				return true;
			},
			problem: (m) => report.problems.push(m)
		});
		if (!report.problems.length) await library.setMeta(`migration:${id}`, {
			at: Date.now(),
			migrated: done.size
		});
	} catch (e) {
		report.error = e instanceof Error ? e.message : String(e);
	}
	return report;
}
//#endregion
//#region src/kits/bundled.ts
/** Install the bundled kits not installed yet (in order). Failures are returned, not thrown. */
async function installBundledKits(library, kits) {
	const out = [];
	for (const b of kits) {
		if (!library.persistent) {
			out.push({
				id: b.id,
				status: "unavailable"
			});
			continue;
		}
		const key = `bundled:${b.id}`;
		try {
			const done = await library.getMeta(key);
			if (done && done.version >= b.version) {
				out.push({
					id: b.id,
					status: "present",
					kitId: done.kitId
				});
				continue;
			}
			const r = await library.importKit(await b.load(), { save: true });
			const kit = await library.saveKit({
				...r.kit,
				origin: {
					...r.kit.origin,
					bundled: b.id
				}
			});
			await library.setMeta(key, {
				version: b.version,
				kitId: kit.id
			});
			if (b.makeDefault !== false && !await library.getDefault()) await library.setDefault(kit.id);
			out.push({
				id: b.id,
				status: "installed",
				kitId: kit.id
			});
		} catch (e) {
			out.push({
				id: b.id,
				status: "failed",
				error: e instanceof Error ? e.message : String(e)
			});
		}
	}
	return out;
}
//#endregion
export { cleanText as A, formatMime as B, roleInfo as C, MAX_KIT_NAME as D, MAX_INSTRUMENTS as E, uniqueKitName as F, CORE_VERSION as H, validateKit as I, validateKitData as L, kitName as M, kitSamples as N, MAX_KIT_REFS as O, portable as P, SAMPLE_ID as R, pickOrder as S, KitError as T, sniffFormat as V, safeArchivePath as _, DecodeCache as a, describeMapping as b, KIT_STORE_SCHEMA as c, KIT_EXTENSION as d, KIT_FORMAT as f, readKitArchive as g, kitFileName as h, KitSession as i, copyName as j, MAX_SAMPLES_PER_INSTRUMENT as k, MemoryKitStore as l, KIT_VERSION as m, migrateOnce as n, KitLibrary as o, KIT_LIMITS as p, Auditioner as r, IndexedDbKitStore as s, installBundledKits as t, KIT_ACCEPT as u, writeKitArchive as v, rolesOf as w, mapKit as x, DRUM_ROLES as y, formatExtension as z };
