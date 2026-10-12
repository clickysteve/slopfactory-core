import { _ as makeRng$1, f as MODE_FACTORIES, g as makeOnePoleLP, h as driveShapeFor, l as isClean, m as applyDrive, p as applyCrunch } from "./node-zW3tNMzU.js";
import { i as toMono, r as resampleLinear, t as applyFades } from "./dsp-DLHymMUz.js";
//#region src/dsp/output/stream.ts
/**
* Streaming output processor: Good Bits' lo-fi chain run sample by sample, so the same code
* serves an AudioWorklet (live and OfflineAudioContext) and plain buffers.
*
* Every stage calls the vendored Good Bits code (`MODE_FACTORIES`, `driveShapeFor`,
* `makeOnePoleLP`) or repeats its arithmetic exactly (crunch, mix/intensity), rounding to
* 32-bit float between stages as Good Bits' whole-buffer functions do when they write each
* stage into a Float32Array. The result is bit-identical to `applyLofiChain` for the same
* input, settings and seed, whatever the block size (see test/dsp-output.test.ts).
*/
var f32 = Math.fround;
var clamp01$1 = (x) => Math.max(0, Math.min(1, x));
var dbToGain = (db) => db === 0 ? 1 : Math.pow(10, db / 20);
/** Build the chain for one set of settings. Its state (filters, noise, hold counter) starts fresh. */
function createChain(s, sampleRate, seed) {
	if (isClean(s)) return () => {};
	const inG = dbToGain(s.inDb);
	const outG = dbToGain(s.outDb);
	const mix = clamp01$1((s.outputStage.mixPct ?? 100) / 100);
	const factory = MODE_FACTORIES[s.outputStage.mode];
	const stage = s.outputStage.enabled && mix > 1e-4 && s.outputStage.mode !== "clean" && factory ? factory(sampleRate, makeRng$1(seed)) : null;
	const intensity = clamp01$1((s.outputStage.intensityPct ?? 50) / 100);
	const d = s.drive.enabled ? clamp01$1((s.drive.amountPct ?? 0) / 100) : 0;
	const useDrive = d > 1e-4;
	const g = 1 + d * 5;
	const shape = driveShapeFor(s.drive.type);
	const bits = Math.max(1, Math.min(16, Math.round(s.crunch.bits ?? 16)));
	const rate = Math.max(1, Math.min(32, Math.round(s.crunch.rateDivide ?? 1)));
	const hasBits = s.crunch.enabled && bits < 16;
	const hasRate = s.crunch.enabled && rate > 1;
	const useCrunch = hasBits || hasRate;
	const step = 2 / Math.pow(2, bits);
	let index = 0;
	let heldL = 0;
	let heldR = 0;
	const useTone = s.tone.enabled && s.tone.hz < 2e4;
	const lpL = makeOnePoleLP(sampleRate, s.tone.hz);
	const lpR = makeOnePoleLP(sampleRate, s.tone.hz);
	return (L, R, n) => {
		for (let k = 0; k < n; k++) {
			let l = inG === 1 ? L[k] : f32(L[k] * inG);
			let r = inG === 1 ? R[k] : f32(R[k] * inG);
			if (stage) {
				const [rawL, rawR] = stage(l, r);
				const wetL = l + (rawL - l) * intensity;
				const wetR = r + (rawR - r) * intensity;
				l = f32(l + (wetL - l) * mix);
				r = f32(r + (wetR - r) * mix);
			}
			if (useDrive) {
				l = f32((1 - d) * l + d * shape(l, g, d));
				r = f32((1 - d) * r + d * shape(r, g, d));
			}
			if (useCrunch) {
				if (!hasRate || index % rate === 0) {
					heldL = l;
					heldR = r;
				}
				index++;
				l = hasBits ? f32(Math.round(heldL / step) * step) : heldL;
				r = hasBits ? f32(Math.round(heldR / step) * step) : heldR;
			}
			if (useTone) {
				l = f32(lpL(l));
				r = f32(lpR(r));
			}
			L[k] = outG === 1 ? l : l * outG;
			R[k] = outG === 1 ? r : r * outG;
		}
	};
}
/** Samples over which a settings change crossfades from the old chain to the new one. */
var SETTINGS_FADE = 256;
/**
* A processor whose settings can change while it runs. A change starts a new chain and
* crossfades from the old one over SETTINGS_FADE samples, so switching never clicks.
*/
var OutputFxStream = class {
	settings;
	sampleRate;
	seed;
	chain;
	old = null;
	fadeLeft = 0;
	scratchL = /* @__PURE__ */ new Float32Array(128);
	scratchR = /* @__PURE__ */ new Float32Array(128);
	constructor(settings, sampleRate, seed) {
		this.settings = settings;
		this.sampleRate = sampleRate;
		this.seed = seed;
		this.chain = createChain(settings, sampleRate, seed);
	}
	get current() {
		return this.settings;
	}
	set(settings) {
		if (JSON.stringify(settings) === JSON.stringify(this.settings)) return;
		this.old = this.chain;
		this.fadeLeft = 256;
		this.settings = settings;
		this.chain = createChain(settings, this.sampleRate, this.seed);
	}
	/** Start the current settings' state afresh (noise, filters, hold phase), with no crossfade. */
	reset() {
		this.old = null;
		this.fadeLeft = 0;
		this.chain = createChain(this.settings, this.sampleRate, this.seed);
	}
	process(L, R, n = L.length) {
		if (!this.old || this.fadeLeft <= 0) {
			this.chain(L, R, n);
			return;
		}
		if (this.scratchL.length < n) {
			this.scratchL = new Float32Array(n);
			this.scratchR = new Float32Array(n);
		}
		const oL = this.scratchL;
		const oR = this.scratchR;
		oL.set(L.subarray(0, n));
		oR.set(R.subarray(0, n));
		this.old(oL, oR, n);
		this.chain(L, R, n);
		for (let k = 0; k < n; k++) {
			if (this.fadeLeft <= 0) break;
			const t = 1 - this.fadeLeft / 256;
			L[k] = oL[k] + (L[k] - oL[k]) * t;
			R[k] = oR[k] + (R[k] - oR[k]) * t;
			this.fadeLeft--;
		}
		if (this.fadeLeft <= 0) this.old = null;
	}
};
/** Run a processor over whole stereo buffers (offline helper; same code as the worklet). */
function processBuffers(channels, sampleRate, settings, seed, blockSize = 128) {
	const L = Float32Array.from(channels[0]);
	const R = Float32Array.from(channels[1] ?? channels[0]);
	const s = new OutputFxStream(settings, sampleRate, seed);
	for (let i = 0; i < L.length; i += blockSize) {
		const n = Math.min(blockSize, L.length - i);
		s.process(L.subarray(i, i + n), R.subarray(i, i + n), n);
	}
	return [L, R];
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/characters.js
var GROUPS = [
	{
		key: "clean",
		label: "Clean / Rhythmic"
	},
	{
		key: "oldDigital",
		label: "Old Digital"
	},
	{
		key: "granular",
		label: "Granular"
	},
	{
		key: "spectral",
		label: "Spectral"
	},
	{
		key: "experimental",
		label: "Experimental"
	}
];
/** Macro-control metadata. Every macro is a 0-100 slider that is a no-op (factor 1) at its default. */
var MACROS = {
	texture: {
		label: "Grain size",
		hint: "Smaller = fine grain buzz, larger = smoother blur.",
		default: 50
	},
	variation: {
		label: "Variation",
		hint: "How unstable the grains are - position, pitch, reversal.",
		default: 50
	},
	smear: {
		label: "Smear",
		hint: "How far the spectral texture drifts from the original.",
		default: 50
	},
	roughness: {
		label: "Roughness",
		hint: "How hard the digital artifacts bite.",
		default: 50
	},
	cycle: {
		label: "Cycle length",
		hint: "Shorter = buzzy, pitched stutter; longer = audible ghosted repeats.",
		default: 50
	},
	crossfade: {
		label: "Crossfade",
		hint: "Lower = hard, clicky joins; higher = smoother, more phasey.",
		default: 50
	}
};
function macroFactor(macroValues, key) {
	const v = macroValues && typeof macroValues[key] === "number" ? macroValues[key] : MACROS[key].default;
	return Math.max(0, Math.min(2, v / 50));
}
function applyGranularMacros(params, macroValues) {
	const texture = macroFactor(macroValues, "texture");
	const variation = macroFactor(macroValues, "variation");
	const out = { ...params };
	out.grainMs = Math.max(6, params.grainMs * texture);
	out.posJitterMs = (params.posJitterMs || 0) * variation;
	out.timeJitterMs = (params.timeJitterMs || 0) * variation;
	out.pitchJitterCents = (params.pitchJitterCents || 0) * variation;
	out.reverseProb = Math.max(0, Math.min(.95, (params.reverseProb || 0) * variation));
	out.dropoutProb = Math.max(0, Math.min(.85, (params.dropoutProb || 0) * variation));
	return out;
}
function applySpectralMacros(params, macroValues) {
	const smear = macroFactor(macroValues, "smear");
	const out = { ...params };
	if (typeof out.smear === "number") out.smear = Math.max(0, Math.min(1, out.smear * smear));
	if (typeof out.phaseRandomize === "number") out.phaseRandomize = Math.max(0, Math.min(1, out.phaseRandomize * smear));
	if (typeof out.holdMs === "number") out.holdMs = Math.max(40, out.holdMs * smear);
	return out;
}
function applyOldDigitalMacros(params, macroValues) {
	const roughness = macroFactor(macroValues, "roughness");
	const out = { ...params };
	if (typeof out.windowMs === "number") out.windowMs = Math.max(4, out.windowMs / Math.max(.4, roughness));
	if (typeof out.bitDepth === "number") out.bitDepth = Math.max(1, Math.min(16, Math.round(out.bitDepth / Math.max(.35, roughness))));
	if (typeof out.searchMs === "number") out.searchMs = Math.max(0, out.searchMs / Math.max(.5, roughness));
	if (typeof out.repeatJitter === "number") out.repeatJitter = Math.max(0, Math.min(1, out.repeatJitter + Math.max(0, roughness - 1)));
	if (typeof out.chunkMs === "number") out.chunkMs = Math.max(8, out.chunkMs / Math.max(.4, roughness));
	return out;
}
function applyCyclicMacros(params, macroValues) {
	const out = { ...params };
	const cycleV = macroValues && typeof macroValues.cycle === "number" ? macroValues.cycle : MACROS.cycle.default;
	out.cycleMs = Math.max(3, params.cycleMs * Math.pow(2, (cycleV - 50) / 25));
	out.crossfade = Math.max(0, Math.min(.5, params.crossfade * macroFactor(macroValues, "crossfade")));
	return out;
}
var MACRO_APPLIERS = {
	granular: applyGranularMacros,
	spectral: applySpectralMacros,
	oldDigital: applyOldDigitalMacros,
	cyclic: applyCyclicMacros
};
/** Character registry. `params` are the engine's own defaults; `macros` (if present) name which macro sliders apply and which family's mapping resolves them. */
var CHARACTERS = {
	clean: {
		label: "Clean",
		group: "clean",
		engine: "wsola",
		description: "Smooth general-purpose stretch. Good default for most material.",
		params: {
			windowMs: 46,
			searchMs: 14,
			hopFraction: .5,
			bitDepth: null
		}
	},
	tight: {
		label: "Tight",
		group: "clean",
		engine: "wsola",
		description: "Short-window WSOLA tuned for percussive, rhythmic material.",
		params: {
			windowMs: 18,
			searchMs: 9,
			hopFraction: .5,
			bitDepth: null
		}
	},
	transient: {
		label: "Transient",
		group: "clean",
		engine: "phaseVocoder",
		description: "Phase-locked vocoder that protects drum hits from smearing.",
		params: {
			fftMs: 40,
			overlap: 4,
			phaseLocking: true,
			phaseRandomize: 0,
			transientReset: true,
			transientSensitivity: .5
		}
	},
	punch: {
		label: "Punch",
		group: "clean",
		engine: "phaseVocoder",
		description: "Harder transient snap - shorter analysis window, more aggressive phase reset.",
		params: {
			fftMs: 20,
			overlap: 3,
			phaseLocking: true,
			phaseRandomize: 0,
			transientReset: true,
			transientSensitivity: .8
		}
	},
	vintage: {
		label: "Vintage",
		group: "oldDigital",
		engine: "wsola",
		description: "Short-window digital stretch with audible movement.",
		params: {
			windowMs: 24,
			searchMs: 5,
			hopFraction: .5,
			bitDepth: 12
		},
		macros: ["roughness"],
		macroFamily: "oldDigital",
		legacy: true
	},
	loose: {
		label: "Loose",
		group: "oldDigital",
		engine: "wsola",
		description: "Longer grains, minimal search - smeared timing, still musical.",
		params: {
			windowMs: 75,
			searchMs: 6,
			hopFraction: .5,
			bitDepth: null
		},
		macros: ["roughness"],
		macroFamily: "oldDigital"
	},
	choppy: {
		label: "Choppy",
		group: "oldDigital",
		engine: "wsola",
		description: "Short grains, gapped hop, no search - stuttery and broken-up.",
		params: {
			windowMs: 14,
			searchMs: 0,
			hopFraction: .75,
			bitDepth: null
		},
		macros: ["roughness"],
		macroFamily: "oldDigital"
	},
	glitch: {
		label: "Glitch",
		group: "oldDigital",
		engine: "wsola",
		description: "Metallic, low-bit.",
		params: {
			windowMs: 12,
			searchMs: 0,
			hopFraction: .5,
			bitDepth: 8
		},
		macros: ["roughness"],
		macroFamily: "oldDigital",
		legacy: true
	},
	warped: {
		label: "Warped",
		group: "oldDigital",
		engine: "wsola",
		description: "Choppy grains, wobbly pitch.",
		params: {
			windowMs: 8,
			searchMs: 0,
			hopFraction: .5,
			bitDepth: null
		},
		macros: ["roughness"],
		macroFamily: "oldDigital",
		legacy: true
	},
	crushed: {
		label: "Crushed",
		group: "oldDigital",
		engine: "wsola",
		description: "Smooth grains, heavy crush.",
		params: {
			windowMs: 30,
			searchMs: 10,
			hopFraction: .5,
			bitDepth: 6
		},
		macros: ["roughness"],
		macroFamily: "oldDigital",
		legacy: true
	},
	stutter: {
		label: "Stutter",
		group: "oldDigital",
		engine: "repeat",
		description: "Primitive chunk repetition - buzzy, rhythmic digital stutter.",
		params: {
			chunkMs: 90,
			crossfadeMs: 3,
			bitDepth: null,
			repeatJitter: 0
		},
		macros: ["roughness"],
		macroFamily: "oldDigital",
		usesSeed: true
	},
	cheap93: {
		label: "'93",
		group: "oldDigital",
		engine: "repeat",
		description: "Coarse resampled micro-loops with heavy bit reduction, like a budget early-90s sampler.",
		params: {
			chunkMs: 42,
			crossfadeMs: 1,
			bitDepth: 8,
			repeatJitter: .15
		},
		macros: ["roughness"],
		macroFamily: "oldDigital",
		usesSeed: true
	},
	cyclic: {
		label: "Cyclic",
		group: "oldDigital",
		engine: "cyclic",
		description: "Akai S-series style cyclic stretch: fixed-length cycles crossfaded end to end with no splice search. Ghosted, doubled, buzzing - the 90s jungle vocal and break stretch.",
		params: {
			cycleMs: 60,
			crossfade: .25,
			bitDepth: null
		},
		macros: ["cycle", "crossfade"],
		macroFamily: "cyclic"
	},
	cyclic12: {
		label: "Cyclic 12-bit",
		group: "oldDigital",
		engine: "cyclic",
		description: "Shorter cycles, harder joins and 12-bit grit, in the spirit of the earlier 12-bit Akais.",
		params: {
			cycleMs: 35,
			crossfade: .12,
			bitDepth: 12
		},
		macros: ["cycle", "crossfade"],
		macroFamily: "cyclic"
	},
	grain: {
		label: "Grain",
		group: "granular",
		engine: "granular",
		description: "Small overlapping grains with gentle jitter.",
		params: {
			grainMs: 60,
			hopFraction: .5,
			posJitterMs: 4,
			timeJitterMs: 0,
			pitchJitterCents: 0,
			reverseProb: 0,
			dropoutProb: 0,
			envelope: "hann"
		},
		macros: ["texture", "variation"],
		macroFamily: "granular",
		usesSeed: true
	},
	scatter: {
		label: "Scatter",
		group: "granular",
		engine: "granular",
		description: "Unstable grains with position jitter.",
		params: {
			grainMs: 45,
			hopFraction: .5,
			posJitterMs: 35,
			timeJitterMs: 8,
			pitchJitterCents: 10,
			reverseProb: .05,
			dropoutProb: 0,
			envelope: "hann"
		},
		macros: ["texture", "variation"],
		macroFamily: "granular",
		usesSeed: true
	},
	flutter: {
		label: "Flutter",
		group: "granular",
		engine: "granular",
		description: "Wobbly grain pitch - vibrato-like flutter.",
		params: {
			grainMs: 70,
			hopFraction: .5,
			posJitterMs: 6,
			timeJitterMs: 2,
			pitchJitterCents: 60,
			reverseProb: 0,
			dropoutProb: 0,
			envelope: "hann"
		},
		macros: ["texture", "variation"],
		macroFamily: "granular",
		usesSeed: true
	},
	shred: {
		label: "Shred",
		group: "granular",
		engine: "granular",
		description: "Aggressive timing jitter and reversed grains.",
		params: {
			grainMs: 25,
			hopFraction: .4,
			posJitterMs: 50,
			timeJitterMs: 20,
			pitchJitterCents: 80,
			reverseProb: .35,
			dropoutProb: .05,
			envelope: "tri"
		},
		macros: ["texture", "variation"],
		macroFamily: "granular",
		usesSeed: true
	},
	cloud: {
		label: "Cloud",
		group: "granular",
		engine: "granular",
		description: "Large, smoothly overlapped grains - ambient pad texture.",
		params: {
			grainMs: 180,
			hopFraction: .2,
			posJitterMs: 15,
			timeJitterMs: 0,
			pitchJitterCents: 15,
			reverseProb: .05,
			dropoutProb: 0,
			envelope: "hann"
		},
		macros: ["texture", "variation"],
		macroFamily: "granular",
		usesSeed: true
	},
	nervous: {
		label: "Nervous",
		group: "granular",
		engine: "granular",
		description: "Tiny grains, fast twitchy jitter.",
		params: {
			grainMs: 15,
			hopFraction: .5,
			posJitterMs: 25,
			timeJitterMs: 15,
			pitchJitterCents: 40,
			reverseProb: .15,
			dropoutProb: 0,
			envelope: "hann"
		},
		macros: ["texture", "variation"],
		macroFamily: "granular",
		usesSeed: true
	},
	broken: {
		label: "Broken",
		group: "granular",
		engine: "granular",
		description: "Grain dropouts and reversed grains - deliberately broken.",
		params: {
			grainMs: 40,
			hopFraction: .5,
			posJitterMs: 20,
			timeJitterMs: 10,
			pitchJitterCents: 30,
			reverseProb: .3,
			dropoutProb: .15,
			envelope: "rect"
		},
		macros: ["texture", "variation"],
		macroFamily: "granular",
		usesSeed: true
	},
	phase: {
		label: "Phase",
		group: "spectral",
		engine: "phaseVocoder",
		description: "Classic phase-vocoder stretch with audible phasey movement.",
		params: {
			fftMs: 46,
			overlap: 4,
			phaseLocking: false,
			phaseRandomize: .15,
			transientReset: false
		},
		macros: ["smear"],
		macroFamily: "spectral",
		usesSeed: true
	},
	underwater: {
		label: "Underwater",
		group: "spectral",
		engine: "phaseVocoder",
		description: "Diffuse phase-vocoder smear.",
		params: {
			fftMs: 110,
			overlap: 8,
			phaseLocking: false,
			phaseRandomize: .55,
			transientReset: false
		},
		macros: ["smear"],
		macroFamily: "spectral",
		usesSeed: true
	},
	metallic: {
		label: "Metallic",
		group: "spectral",
		engine: "phaseVocoder",
		description: "Small spectral windows with ringing artifacts.",
		params: {
			fftMs: 6,
			overlap: 3,
			phaseLocking: false,
			phaseRandomize: .2,
			transientReset: false
		},
		macros: ["smear"],
		macroFamily: "spectral",
		usesSeed: true
	},
	glass: {
		label: "Glass",
		group: "spectral",
		engine: "phaseVocoder",
		description: "Shimmering and mostly coherent, with a little sparkle of chaos.",
		params: {
			fftMs: 60,
			overlap: 4,
			phaseLocking: true,
			phaseRandomize: .1,
			transientReset: false
		},
		macros: ["smear"],
		macroFamily: "spectral",
		usesSeed: true
	},
	frozen: {
		label: "Frozen",
		group: "spectral",
		engine: "spectralFreeze",
		description: "Holds and smears spectral frames.",
		params: {
			fftMs: 90,
			overlap: 4,
			holdMs: 250
		},
		macros: ["smear"],
		macroFamily: "spectral"
	},
	drone: {
		label: "Drone",
		group: "spectral",
		engine: "spectralFreeze",
		description: "Long-held spectral frames - suspended drone.",
		params: {
			fftMs: 140,
			overlap: 4,
			holdMs: 900
		},
		macros: ["smear"],
		macroFamily: "spectral"
	},
	spectral: {
		label: "Spectral",
		group: "spectral",
		engine: "paulstretch",
		description: "Large-window spectral smear with softened phase.",
		params: {
			windowMs: 180,
			overlap: 8,
			smear: .25
		},
		macros: ["smear"],
		macroFamily: "spectral",
		usesSeed: true
	},
	infinite: {
		label: "Infinite",
		group: "spectral",
		engine: "paulstretch",
		description: "Extreme PaulStretch-style spectral expansion for long evolving textures.",
		params: {
			windowMs: 500,
			overlap: 10,
			smear: .6
		},
		macros: ["smear"],
		macroFamily: "spectral",
		usesSeed: true
	},
	destroyed: {
		label: "Destroyed",
		group: "experimental",
		engine: "granular",
		description: "Everything at once: scrambled grains and bit reduction.",
		params: {
			grainMs: 20,
			hopFraction: .4,
			posJitterMs: 80,
			timeJitterMs: 40,
			pitchJitterCents: 150,
			reverseProb: .5,
			dropoutProb: .12,
			envelope: "tri",
			bitDepth: 5
		},
		macros: ["texture", "variation"],
		macroFamily: "granular",
		usesSeed: true
	},
	tape: {
		label: "Tape",
		group: "experimental",
		engine: "varispeed",
		description: "Pitch follows speed, like tape or a sampler played at the wrong rate.",
		params: {},
		preservesPitch: false
	}
};
/** Look up a character by id, falling back to "clean" for anything unrecognised (old saved settings, typos, ...). */
function resolveCharacter(key) {
	return CHARACTERS[key] || CHARACTERS.clean;
}
/** Resolve a character's engine params with its macro sliders (if any) applied. macroValues is a flat {texture, variation, smear, roughness} map - only the keys the character actually uses are read. */
function resolveCharacterParams(character, macroValues) {
	if (!character.macros || !character.macros.length) return { ...character.params };
	const applier = MACRO_APPLIERS[character.macroFamily];
	return applier ? applier(character.params, macroValues) : { ...character.params };
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/windows.js
function hannWindow(n) {
	const w = new Float32Array(n);
	for (let i = 0; i < n; i++) w[i] = .5 - .5 * Math.cos(2 * Math.PI * i / Math.max(1, n - 1));
	return w;
}
function triangularWindow(n) {
	const w = new Float32Array(n);
	const half = (n - 1) / 2;
	for (let i = 0; i < n; i++) w[i] = 1 - Math.abs((i - half) / Math.max(1, half));
	return w;
}
/** Flat-top-ish rectangular window with a short raised-cosine taper at each edge, just enough to avoid a hard click. */
function rectTaperWindow(n, taperFraction = .08) {
	const w = new Float32Array(n).fill(1);
	const taper = Math.max(1, Math.round(n * taperFraction));
	for (let i = 0; i < taper; i++) {
		const g = .5 - .5 * Math.cos(Math.PI * i / taper);
		w[i] = g;
		w[n - 1 - i] = g;
	}
	return w;
}
var CACHE = /* @__PURE__ */ new Map();
/** Cached window lookup by (shape, length) - the STFT-style engines rebuild windows often at a handful of fixed sizes. */
function getWindow(shape, n) {
	const key = `${shape}:${n}`;
	let w = CACHE.get(key);
	if (!w) {
		w = shape === "tri" ? triangularWindow(n) : shape === "rect" ? rectTaperWindow(n) : hannWindow(n);
		CACHE.set(key, w);
	}
	return w;
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/wsola.js
/** A window's own energy (sum of squares) - split out of similarity() below so the search loop can
* compute it once per grain instead of redundantly recomputing the same value for every candidate
* offset scored against that grain's fixed reference window. */
function energy(ref, len) {
	let sum = 0;
	for (let i = 0; i < len; i++) {
		const x = ref[i] || 0;
		sum += x * x;
	}
	return sum;
}
/**
* Normalized cross-correlation between a reference window and a candidate window, for splice-point
* search. `refEnergy` is `energy(ref, len)`, passed in rather than recomputed here: this is called
* once per candidate offset in the search loop below (up to ~searchRadius*2 times per grain) against
* the SAME reference window every time, so hoisting that one term out is a pure, exact win - it's
* the same value, just computed once per grain instead of once per candidate.
*/
function similarity(ref, refEnergy, cand, candOff, len) {
	let dot = 0;
	let nc = 0;
	for (let i = 0; i < len; i++) {
		const x = ref[i] || 0;
		const y = cand[candOff + i] || 0;
		dot += x * y;
		nc += y * y;
	}
	const denom = Math.sqrt(refEnergy * nc);
	return denom > 1e-9 ? dot / denom : 0;
}
/** Crude bit-depth reduction - old samplers' ADCs were low-bit, so this is part of several "old digital" characters. */
function quantizeInPlace(buf, bits) {
	const step = 2 / Math.pow(2, bits);
	for (let i = 0; i < buf.length; i++) buf[i] = Math.round(buf[i] / step) * step;
}
/**
* Time-stretch every channel in lockstep (grain positions are decided once
* from a mono reference, then applied identically to each channel) so
* multi-channel audio stays phase-aligned instead of each channel drifting
* independently. ratio = output length / input length. Pitch is preserved
* (approximately - WSOLA isn't phase-exact, but it's a solid, well
* established approach for exactly this).
*
* params: { windowMs, searchMs, hopFraction, bitDepth }
*/
function stretchWsola(channels, sampleRate, ratio, params) {
	const p = params || {};
	const windowMs = p.windowMs ?? 46;
	const searchMs = p.searchMs ?? 14;
	const hopFraction = p.hopFraction ?? .5;
	const bitDepth = p.bitDepth ?? null;
	if (Math.abs(ratio - 1) < 1e-6) return channels.map((ch) => Float32Array.from(ch));
	const reference = channels.length > 1 ? toMono(channels) : channels[0];
	const inputLen = reference.length;
	const windowSize = Math.max(64, Math.round(windowMs / 1e3 * sampleRate));
	const synthesisHop = Math.max(1, Math.round(windowSize * hopFraction));
	Math.max(1, Math.round(synthesisHop / ratio));
	const searchRadius = Math.max(0, Math.round(searchMs / 1e3 * sampleRate));
	const window = hannWindow(windowSize);
	const outLen = Math.max(windowSize, Math.round(inputLen * ratio));
	const grains = [];
	let synthesisPos = 0;
	let prevTail = null;
	const maxGrainStart = Math.max(0, inputLen - windowSize);
	while (synthesisPos < outLen) {
		const idealStart = Math.min(maxGrainStart, Math.round(synthesisPos / ratio));
		let bestOffset = 0;
		if (searchRadius > 0 && prevTail) {
			let bestScore = -Infinity;
			const overlapLen = Math.min(windowSize, prevTail.length);
			const refEnergy = energy(prevTail, overlapLen);
			const lo = Math.max(0, idealStart - searchRadius);
			const hi = Math.min(Math.max(lo, maxGrainStart), idealStart + searchRadius);
			for (let cand = lo; cand <= hi; cand++) {
				const score = similarity(prevTail, refEnergy, reference, cand, overlapLen);
				if (score > bestScore) {
					bestScore = score;
					bestOffset = cand - idealStart;
				}
			}
		}
		const grainStart = Math.max(0, Math.min(maxGrainStart, idealStart + bestOffset));
		grains.push({
			grainStart,
			synthesisPos
		});
		const tailLen = Math.min(windowSize, synthesisHop);
		prevTail = reference.slice(grainStart + windowSize - tailLen, grainStart + windowSize);
		synthesisPos += synthesisHop;
	}
	return channels.map((chan) => {
		const out = new Float32Array(outLen + windowSize);
		const weight = new Float32Array(outLen + windowSize);
		for (const { grainStart, synthesisPos: sp } of grains) for (let i = 0; i < windowSize; i++) {
			const s = chan[grainStart + i] || 0;
			out[sp + i] += s * window[i];
			weight[sp + i] += window[i];
		}
		const result = new Float32Array(outLen);
		for (let i = 0; i < outLen; i++) result[i] = weight[i] > 1e-6 ? out[i] / weight[i] : out[i];
		if (bitDepth) quantizeInPlace(result, bitDepth);
		return result;
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/fft.js
/** Smallest power of two >= n (minimum 1). */
function nextPow2(n) {
	let p = 1;
	while (p < n) p <<= 1;
	return p;
}
function bitReversePermute(re, im) {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			let t = re[i];
			re[i] = re[j];
			re[j] = t;
			t = im[i];
			im[i] = im[j];
			im[j] = t;
		}
	}
}
/** In-place forward FFT. re/im must be the same power-of-two length. */
function fft(re, im) {
	const n = re.length;
	if (n <= 1) return;
	bitReversePermute(re, im);
	for (let len = 2; len <= n; len <<= 1) {
		const half = len >> 1;
		const ang = -2 * Math.PI / len;
		const wr = Math.cos(ang);
		const wi = Math.sin(ang);
		for (let i = 0; i < n; i += len) {
			let curWr = 1;
			let curWi = 0;
			for (let j = 0; j < half; j++) {
				const a = i + j;
				const b = a + half;
				const bRe = re[b] * curWr - im[b] * curWi;
				const bIm = re[b] * curWi + im[b] * curWr;
				const aRe = re[a];
				const aIm = im[a];
				re[a] = aRe + bRe;
				im[a] = aIm + bIm;
				re[b] = aRe - bRe;
				im[b] = aIm - bIm;
				const nextWr = curWr * wr - curWi * wi;
				const nextWi = curWr * wi + curWi * wr;
				curWr = nextWr;
				curWi = nextWi;
			}
		}
	}
}
/** In-place inverse FFT (normalized by n so fft() -> ifft() round-trips exactly). */
function ifft(re, im) {
	const n = re.length;
	if (n <= 1) return;
	for (let i = 0; i < n; i++) im[i] = -im[i];
	fft(re, im);
	const invN = 1 / n;
	for (let i = 0; i < n; i++) {
		re[i] *= invN;
		im[i] = -im[i] * invN;
	}
}
/** Wraps a phase (radians) into (-PI, PI]. */
function wrapPhase(x) {
	const twoPi = Math.PI * 2;
	return x - twoPi * Math.floor((x + Math.PI) / twoPi);
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/rng.js
function mulberry32(seed) {
	let a = seed >>> 0;
	return function next() {
		a |= 0;
		a = a + 1831565813 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
/** Hash any seed (number or string) down to a uint32 so callers can pass friendly seeds. */
function hashSeed(seed) {
	if (seed === void 0 || seed === null) return 1;
	if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0 || Math.abs(Math.floor(seed)) >>> 0 || 1;
	let h = 2166136261;
	const s = String(seed);
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0 || 1;
}
/** Combine a base seed with an integer "context" (frame index, channel index, ...) into a new deterministic seed. */
function deriveSeed(baseSeed, context) {
	const base = hashSeed(baseSeed);
	const ctx = context >>> 0 || 0;
	return (Math.imul(base ^ ctx, 2654435761) ^ ctx << 13) >>> 0;
}
/**
* A small deterministic RNG object. `seed` may be a number or string.
* Every stretch engine that uses randomness derives its rng(s) from the same
* seed input (see dsp/stretch/index.js), and - critically - reseeds per
* channel with the SAME seed for decisions that must stay shared across L/R
* (grain jitter, phase randomisation), so stereo material doesn't get torn
* apart by independently-randomised channels.
*/
function makeRng(seed = 1) {
	const next = mulberry32(hashSeed(seed));
	return {
		next,
		signed: () => next() * 2 - 1,
		range: (lo, hi) => lo + next() * (hi - lo),
		int: (n) => Math.min(n - 1, Math.floor(next() * n)),
		bool: (p = .5) => next() < p
	};
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/stft.js
/** Analyse chan[pos .. pos+fftSize) (reading 0 past the array's ends), windowed, returning {mag, phase} for bins [0, half]. */
function analyzeFrame(chan, pos, fftSize, window, half) {
	const re = new Float64Array(fftSize);
	const im = new Float64Array(fftSize);
	for (let i = 0; i < fftSize; i++) re[i] = (chan[pos + i] || 0) * window[i];
	fft(re, im);
	const mag = new Float64Array(half + 1);
	const phase = new Float64Array(half + 1);
	for (let k = 0; k <= half; k++) {
		mag[k] = Math.hypot(re[k], im[k]);
		phase[k] = Math.atan2(im[k], re[k]);
	}
	return {
		mag,
		phase
	};
}
/**
* Analysis/synthesis hop sizes for an STFT stretch at `ratio`. The classic scheme fixes the analysis
* hop at fftSize/hopDivisor and scales the synthesis hop by the ratio - fine for modest stretches,
* but once ratio outgrows the overlap the synthesis frames stop touching and the output turns into
* windowed blips separated by silence (Transient at 8x was ~50% silence, Infinite at 40x ~80%). So
* the synthesis hop is capped at half a frame, and past that point the ANALYSIS hop shrinks instead
* (fractionally - callers floor m*Ha to an integer read position, which can repeat a frame at huge
* ratios). Below the cap this returns exactly the old integer hops, so existing renders are unchanged.
*/
function planHops(fftSize, hopDivisor, ratio) {
	const Ha = Math.max(1, Math.round(fftSize / hopDivisor));
	const Hs = Math.max(1, Math.round(Ha * ratio));
	const maxHs = Math.floor(fftSize / 2);
	if (Hs <= maxHs) return {
		Ha,
		Hs
	};
	return {
		Ha: maxHs / ratio,
		Hs: maxHs
	};
}
/**
* Divides an overlap-add accumulator by its weight accumulator, the last step of every STFT-based
* engine here. The naive version (divide by weight, or by 0 below a tiny epsilon) blows up right at
* the start/end of the output: those samples are covered by only one sparsely-overlapping frame, so
* weight is tiny there (window^2 near a Hann window's zero edge) - and once phase has been changed
* from what the analysis window actually produced (randomised phase, or any bin manipulation), the
* reconstructed frame no longer reliably tapers to ~0 at its own edges the way the original windowed
* segment did, so dividing a NOT-small numerator by a NEAR-ZERO denominator there produces huge
* spikes rather than a small number. Flooring the divisor at a fraction of the buffer's peak weight
* bounds that amplification instead: the few edge samples with too little overlap to trust fade in
* relative to the floor rather than exploding, and every sample with normal overlap is unaffected
* (its weight is already far above the floor).
*/
function normalizeOverlapAdd(out, weight, outLen, floorFraction = .15) {
	let peakWeight = 0;
	for (let i = 0; i < outLen; i++) if (weight[i] > peakWeight) peakWeight = weight[i];
	const floor = Math.max(1e-9, peakWeight * floorFraction);
	const result = new Float32Array(outLen);
	for (let i = 0; i < outLen; i++) result[i] = out[i] / Math.max(weight[i], floor);
	return result;
}
/**
* Builds a full conjugate-symmetric spectrum in `re`/`im` (both length fftSize, overwritten in
* place) from magnitude + phase over bins [0, half], so ifft() of the result comes out real-valued.
*/
function synthesizeSpectrum(re, im, mag, phase, fftSize, half) {
	re[0] = mag[0];
	im[0] = 0;
	re[half] = mag[half];
	im[half] = 0;
	for (let k = 1; k < half; k++) {
		re[k] = mag[k] * Math.cos(phase[k]);
		im[k] = mag[k] * Math.sin(phase[k]);
		re[fftSize - k] = re[k];
		im[fftSize - k] = -im[k];
	}
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/phase-vocoder.js
/** Local maxima of `mag`, above a small fraction of the frame's own peak, used for identity phase locking. */
function findPeaks(mag, half) {
	let frameMax = 0;
	for (let k = 0; k <= half; k++) if (mag[k] > frameMax) frameMax = mag[k];
	const floor = frameMax * .02;
	const peaks = [];
	for (let k = 1; k < half; k++) if (mag[k] >= mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] > floor) peaks.push(k);
	if (peaks.length === 0) peaks.push(0);
	return peaks;
}
/** Which peak "owns" each bin (nearest peak, ties to the lower one), for identity phase locking. */
function ownerForEachBin(peaks, half) {
	const owner = new Int32Array(half + 1);
	let pi = 0;
	for (let k = 0; k <= half; k++) {
		while (pi < peaks.length - 1 && Math.abs(peaks[pi + 1] - k) <= Math.abs(peaks[pi] - k)) pi++;
		owner[k] = peaks[pi];
	}
	return owner;
}
/** Spectral flux (positive-only) between two magnitude frames, used to flag transient frames. */
function spectralFlux(mag, prevMag, half) {
	let flux = 0;
	for (let k = 0; k <= half; k++) flux += Math.max(0, mag[k] - (prevMag ? prevMag[k] : 0));
	return flux;
}
/**
* Runs analyzeFrame across every frame of `reference` up front. Returned alongside the flags so a
* mono input (where `reference` IS the same array as the single channel the synthesis loop below
* processes - see stretchPhaseVocoder) can reuse these already-computed spectra instead of running
* an identical second FFT pass per frame for that channel. For stereo, `reference` is the mono
* downmix - a different signal from either channel - so there's nothing to reuse there and this
* costs the same as before.
*/
function analyzeReferenceFrames(reference, fftSize, hop, window, half, numFrames) {
	const frames = new Array(numFrames);
	for (let m = 0; m < numFrames; m++) frames[m] = analyzeFrame(reference, m * hop, fftSize, window, half);
	return frames;
}
/** Frame indices (shared across channels) whose spectral flux is a sharp outlier vs. the running average. */
function transientFlagsFromFrames(frames, half, numFrames, sensitivity) {
	const fluxes = new Float64Array(numFrames);
	let prevMag = null;
	for (let m = 0; m < numFrames; m++) {
		fluxes[m] = spectralFlux(frames[m].mag, prevMag, half);
		prevMag = frames[m].mag;
	}
	const threshold = fluxes.reduce((a, b) => a + b, 0) / Math.max(1, numFrames) * (2.2 - 1.2 * sensitivity);
	const flags = new Uint8Array(numFrames);
	for (let m = 1; m < numFrames; m++) flags[m] = fluxes[m] > threshold && fluxes[m] > 1e-6 ? 1 : 0;
	return flags;
}
/**
* params: { fftMs, overlap, phaseLocking, phaseRandomize (0-1), transientReset, transientSensitivity (0-1) }
*/
function stretchPhaseVocoder(channels, sampleRate, ratio, params, seed) {
	const p = params || {};
	const fftSize = nextPow2(Math.max(64, Math.round((p.fftMs ?? 46) / 1e3 * sampleRate)));
	const half = fftSize / 2;
	const hopDivisor = Math.max(2, p.overlap ?? 4);
	const { Ha, Hs } = planHops(fftSize, hopDivisor, ratio);
	const gridHop = Math.max(1, Math.round(fftSize / hopDivisor));
	const onGrid = Ha === gridHop;
	const window = getWindow("hann", fftSize);
	const phaseLocking = !!p.phaseLocking;
	const phaseRandomize = Math.max(0, Math.min(1, p.phaseRandomize ?? 0));
	const transientReset = !!p.transientReset;
	const transientSensitivity = Math.max(0, Math.min(1, p.transientSensitivity ?? .5));
	const reference = channels.length > 1 ? toMono(channels) : channels[0];
	const inputLen = reference.length;
	const outLen = Math.max(fftSize, Math.round(inputLen * ratio));
	const numFrames = Math.max(1, Math.ceil(inputLen / Ha) + 1);
	const numGridFrames = Math.max(1, Math.ceil(inputLen / gridHop) + 1);
	const referenceFrames = transientReset ? analyzeReferenceFrames(reference, fftSize, gridHop, window, half, numGridFrames) : null;
	const transientFlags = transientReset ? transientFlagsFromFrames(referenceFrames, half, numGridFrames, transientSensitivity) : null;
	return channels.map((chan) => {
		const rng = phaseRandomize > 0 ? makeRng(seed) : null;
		const out = new Float64Array(outLen + fftSize);
		const weight = new Float64Array(outLen + fftSize);
		const outPhase = new Float64Array(half + 1);
		let prevAnalysisPhase = null;
		let prevAnalysisPos = 0;
		let prevSynthesisPos = 0;
		let prevGrid = -1;
		let havePrev = false;
		const trueFreq = new Float64Array(half + 1);
		const synRe = new Float64Array(fftSize);
		const synIm = new Float64Array(fftSize);
		for (let m = 0; m < numFrames; m++) {
			const analysisPos = Math.floor(m * Ha);
			const synthesisPos = m * Hs;
			if (synthesisPos > outLen + fftSize) break;
			const { mag, phase } = onGrid && chan === reference && referenceFrames ? referenceFrames[m] : analyzeFrame(chan, analysisPos, fftSize, window, half);
			const grid = Math.floor(analysisPos / gridHop);
			const isTransient = transientFlags && grid !== prevGrid ? !!transientFlags[grid] : false;
			prevGrid = grid;
			if (!havePrev) {
				for (let k = 0; k <= half; k++) outPhase[k] = phase[k];
				havePrev = true;
			} else if (isTransient) for (let k = 0; k <= half; k++) outPhase[k] = phase[k];
			else {
				const aStep = analysisPos - prevAnalysisPos;
				const sStep = synthesisPos - prevSynthesisPos;
				for (let k = 0; k <= half; k++) {
					if (aStep > 0) {
						const expected = 2 * Math.PI * k * aStep / fftSize;
						const delta = wrapPhase(phase[k] - prevAnalysisPhase[k] - expected);
						trueFreq[k] = 2 * Math.PI * k / fftSize + delta / aStep;
					}
					outPhase[k] += trueFreq[k] * sStep;
				}
			}
			if (phaseLocking) {
				const peaks = findPeaks(mag, half);
				const owner = ownerForEachBin(peaks, half);
				const peakOutPhase = new Float64Array(half + 1);
				for (const pk of peaks) peakOutPhase[pk] = outPhase[pk];
				for (let k = 0; k <= half; k++) {
					const own = owner[k];
					if (k !== own) outPhase[k] = peakOutPhase[own] + (phase[k] - phase[own]);
				}
			}
			if (rng) for (let k = 1; k < half; k++) outPhase[k] += phaseRandomize * rng.signed() * Math.PI;
			synthesizeSpectrum(synRe, synIm, mag, outPhase, fftSize, half);
			ifft(synRe, synIm);
			for (let i = 0; i < fftSize; i++) {
				const s = synRe[i] * window[i];
				out[synthesisPos + i] += s;
				weight[synthesisPos + i] += window[i] * window[i];
			}
			prevAnalysisPhase = phase;
			prevAnalysisPos = analysisPos;
			prevSynthesisPos = synthesisPos;
		}
		return normalizeOverlapAdd(out, weight, outLen);
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/granular.js
function centsToRatio(cents) {
	return Math.pow(2, cents / 1200);
}
/** Reads `outLen` samples from `chan` starting at `srcStart`, resampled by `rate` (rate>1 reads faster/shorter -> higher pitch), optionally reversed. Out-of-range reads are 0. */
function readGrain(chan, srcStart, outLen, rate, reversed) {
	const out = new Float32Array(outLen);
	for (let i = 0; i < outLen; i++) {
		const srcPos = srcStart + (reversed ? (outLen - 1 - i) * rate : i * rate);
		const i0 = Math.floor(srcPos);
		const frac = srcPos - i0;
		const a = chan[i0] || 0;
		const b = chan[i0 + 1] || 0;
		out[i] = a + (b - a) * frac;
	}
	return out;
}
/**
* params: { grainMs, hopFraction, posJitterMs, timeJitterMs, pitchJitterCents, reverseProb,
* dropoutProb, envelope ('hann'|'tri'|'rect'), bitDepth }
*/
function stretchGranular(channels, sampleRate, ratio, params, seed) {
	const p = params || {};
	const grainMs = p.grainMs ?? 60;
	const hopFraction = p.hopFraction ?? .5;
	const posJitterMs = p.posJitterMs ?? 4;
	const timeJitterMs = p.timeJitterMs ?? 0;
	const pitchJitterCents = p.pitchJitterCents ?? 0;
	const reverseProb = p.reverseProb ?? 0;
	const dropoutProb = p.dropoutProb ?? 0;
	const envelopeShape = p.envelope ?? "hann";
	const bitDepth = p.bitDepth ?? null;
	const grainSamples = Math.max(16, Math.round(grainMs / 1e3 * sampleRate));
	const synthesisHop = Math.max(1, Math.round(grainSamples * hopFraction));
	const analysisHop = Math.max(1, synthesisHop / ratio);
	const posJitterSamples = posJitterMs / 1e3 * sampleRate;
	const timeJitterSamples = timeJitterMs / 1e3 * sampleRate;
	const window = getWindow(envelopeShape, grainSamples);
	const inputLen = (channels.length > 1 ? toMono(channels) : channels[0]).length;
	const outLen = Math.max(grainSamples, Math.round(inputLen * ratio));
	const rng = makeRng(seed);
	const grains = [];
	let analysisPos = 0;
	let synthesisPos = 0;
	while (synthesisPos < outLen && analysisPos < inputLen + grainSamples) {
		const srcStart = analysisPos + rng.signed() * posJitterSamples;
		const dstStart = synthesisPos + rng.signed() * timeJitterSamples;
		const reversed = rng.bool(reverseProb);
		const dropped = rng.bool(dropoutProb);
		const pitchRatio = centsToRatio(rng.signed() * pitchJitterCents);
		grains.push({
			srcStart: Math.max(0, srcStart),
			dstStart: Math.max(0, Math.round(dstStart)),
			reversed,
			dropped,
			pitchRatio
		});
		analysisPos += analysisHop;
		synthesisPos += synthesisHop;
	}
	return channels.map((chan) => {
		const out = new Float32Array(outLen + grainSamples);
		const weight = new Float32Array(outLen + grainSamples);
		for (const g of grains) {
			if (g.dropped) continue;
			const grain = readGrain(chan, g.srcStart, grainSamples, g.pitchRatio, g.reversed);
			for (let i = 0; i < grainSamples; i++) {
				out[g.dstStart + i] += grain[i] * window[i];
				weight[g.dstStart + i] += window[i];
			}
		}
		const result = new Float32Array(outLen);
		for (let i = 0; i < outLen; i++) result[i] = weight[i] > 1e-6 ? out[i] / weight[i] : 0;
		if (bitDepth) quantizeInPlace(result, bitDepth);
		return result;
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/repeat.js
/**
* params: { chunkMs, crossfadeMs, bitDepth, repeatJitter (0-1, random +/-1 wobble on repeat count) }
*/
function stretchRepeat(channels, sampleRate, ratio, params, seed) {
	const p = params || {};
	const chunkMs = p.chunkMs ?? 90;
	const crossfadeMs = p.crossfadeMs ?? 3;
	const bitDepth = p.bitDepth ?? null;
	const repeatJitter = Math.max(0, Math.min(1, p.repeatJitter ?? 0));
	const chunkSamples = Math.max(32, Math.round(chunkMs / 1e3 * sampleRate));
	const crossfadeSamplesTarget = Math.max(0, Math.round(crossfadeMs / 1e3 * sampleRate));
	const inputLen = (channels.length > 1 ? toMono(channels) : channels[0]).length;
	const rng = makeRng(seed);
	const chunks = [];
	let acc = 0;
	for (let srcStart = 0; srcStart < inputLen; srcStart += chunkSamples) {
		acc += ratio;
		let count = Math.round(acc);
		acc -= count;
		if (repeatJitter > 0 && count > 0 && rng.bool(repeatJitter * .5)) count = Math.max(0, count + (rng.bool() ? -1 : 1));
		const len = Math.min(chunkSamples, inputLen - srcStart);
		if (len > 0 && count > 0) chunks.push({
			srcStart,
			len,
			count
		});
	}
	if (chunks.length === 0) chunks.push({
		srcStart: 0,
		len: Math.max(1, inputLen),
		count: 1
	});
	const segments = [];
	for (const { srcStart, len, count } of chunks) for (let r = 0; r < count; r++) segments.push({
		srcStart,
		len
	});
	let totalOut = 0;
	let prevLen = 0;
	for (let i = 0; i < segments.length; i++) {
		const len = segments[i].len;
		const cf = i === 0 ? 0 : Math.min(crossfadeSamplesTarget, len - 1, prevLen - 1);
		totalOut += len - cf;
		prevLen = len;
	}
	return channels.map((chan) => {
		const out = new Float32Array(Math.max(1, totalOut));
		let writePos = 0;
		let prevSegLen = 0;
		for (let i = 0; i < segments.length; i++) {
			const { srcStart, len } = segments[i];
			const cf = i === 0 ? 0 : Math.min(crossfadeSamplesTarget, len - 1, prevSegLen - 1);
			const start = writePos - cf;
			for (let k = 0; k < len; k++) {
				const idx = start + k;
				if (idx < 0 || idx >= out.length) continue;
				const s = chan[srcStart + k] || 0;
				if (k < cf) {
					const g = (k + 1) / (cf + 1);
					out[idx] = out[idx] * (1 - g) + s * g;
				} else out[idx] = s;
			}
			writePos = start + len;
			prevSegLen = len;
		}
		if (bitDepth) quantizeInPlace(out, bitDepth);
		return out;
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/spectral-freeze.js
function clamp01(x) {
	return Math.max(0, Math.min(1, x));
}
/**
* params: { fftMs, overlap, holdMs (how long each captured frame sustains before crossfading) }
*/
function stretchSpectralFreeze(channels, sampleRate, ratio, params) {
	const p = params || {};
	const fftSize = nextPow2(Math.max(256, Math.round((p.fftMs ?? 90) / 1e3 * sampleRate)));
	const half = fftSize / 2;
	const hopDivisor = Math.max(2, p.overlap ?? 4);
	const Ha = Math.max(1, Math.round(fftSize / hopDivisor));
	const { Hs } = planHops(fftSize, hopDivisor, ratio);
	const holdMs = Math.max(20, p.holdMs ?? 300);
	const holdHops = Math.max(2, Math.round(holdMs / 1e3 * sampleRate / Hs));
	const crossfadeHops = Math.max(1, Math.round(holdHops * .3));
	const inputLen = (channels.length > 1 ? toMono(channels) : channels[0]).length;
	const outLen = Math.max(fftSize, Math.round(inputLen * ratio));
	const totalHops = Math.max(1, Math.ceil(outLen / Hs));
	const totalSegments = Math.max(1, Math.ceil(totalHops / holdHops));
	const window = getWindow("hann", fftSize);
	const maxPos = Math.max(0, inputLen - fftSize);
	const capturePos = [];
	for (let s = 0; s <= totalSegments; s++) capturePos.push(totalSegments <= 1 ? 0 : Math.round(s / totalSegments * maxPos));
	return channels.map((chan) => {
		const segMag = [];
		const segPhase0 = [];
		const segFreq = [];
		for (let s = 0; s <= totalSegments; s++) {
			const pos = capturePos[s];
			const { mag, phase } = analyzeFrame(chan, pos, fftSize, window, half);
			const { phase: phaseNext } = analyzeFrame(chan, pos + Ha, fftSize, window, half);
			const freq = new Float64Array(half + 1);
			for (let k = 0; k <= half; k++) {
				const expected = 2 * Math.PI * k * Ha / fftSize;
				const delta = wrapPhase(phaseNext[k] - phase[k] - expected);
				freq[k] = 2 * Math.PI * k / fftSize + delta / Ha;
			}
			segMag.push(mag);
			segPhase0.push(phase);
			segFreq.push(freq);
		}
		const out = new Float64Array(outLen + fftSize);
		const weight = new Float64Array(outLen + fftSize);
		const outPhase = Float64Array.from(segPhase0[0]);
		const synRe = new Float64Array(fftSize);
		const synIm = new Float64Array(fftSize);
		const mag = new Float64Array(half + 1);
		const freq = new Float64Array(half + 1);
		let hop = 0;
		for (let seg = 0; seg < totalSegments && hop < totalHops; seg++) for (let h = 0; h < holdHops && hop < totalHops; h++, hop++) {
			const remaining = holdHops - h;
			const mixNext = remaining <= crossfadeHops ? clamp01(1 - (remaining - 1) / crossfadeHops) : 0;
			const magA = segMag[seg];
			const magB = segMag[seg + 1];
			const freqA = segFreq[seg];
			const freqB = segFreq[seg + 1];
			for (let k = 0; k <= half; k++) {
				mag[k] = magA[k] * (1 - mixNext) + magB[k] * mixNext;
				freq[k] = freqA[k] * (1 - mixNext) + freqB[k] * mixNext;
			}
			const synthesisPos = hop * Hs;
			synthesizeSpectrum(synRe, synIm, mag, outPhase, fftSize, half);
			ifft(synRe, synIm);
			for (let i = 0; i < fftSize; i++) {
				out[synthesisPos + i] += synRe[i] * window[i];
				weight[synthesisPos + i] += window[i] * window[i];
			}
			for (let k = 0; k <= half; k++) outPhase[k] += freq[k] * Hs;
		}
		return normalizeOverlapAdd(out, weight, outLen);
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/paulstretch.js
/** Smooths a magnitude spectrum across neighbouring bins - the "smear" macro's spectral half. */
function smoothMagnitudeInPlace(mag, half, amount) {
	if (amount <= 0) return;
	const radius = Math.max(1, Math.round(amount * 6));
	const src = mag.slice();
	for (let k = 0; k <= half; k++) {
		let sum = 0;
		let count = 0;
		for (let j = -radius; j <= radius; j++) {
			const idx = k + j;
			if (idx < 0 || idx > half) continue;
			sum += src[idx];
			count++;
		}
		mag[k] = sum / count;
	}
}
/**
* params: { windowMs, overlap (hop divisor, higher = denser), smear (0-1, magnitude smoothing +
* frame blending), frameBlend (0-1, how much of the previous frame's magnitude bleeds into this one) }
*/
function stretchPaulstretch(channels, sampleRate, ratio, params, seed) {
	const p = params || {};
	const fftSize = nextPow2(Math.max(256, Math.round((p.windowMs ?? 250) / 1e3 * sampleRate)));
	const half = fftSize / 2;
	const { Ha, Hs } = planHops(fftSize, Math.max(4, p.overlap ?? 8), ratio);
	const window = getWindow("hann", fftSize);
	const smear = Math.max(0, Math.min(1, p.smear ?? .3));
	const frameBlend = Math.max(0, Math.min(.95, p.frameBlend ?? smear * .5));
	const inputLen = (channels.length > 1 ? toMono(channels) : channels[0]).length;
	const outLen = Math.max(fftSize, Math.round(inputLen * ratio));
	const numFrames = Math.max(1, Math.ceil(inputLen / Ha) + 1);
	return channels.map((chan) => {
		const out = new Float64Array(outLen + fftSize);
		const weight = new Float64Array(outLen + fftSize);
		const re = new Float64Array(fftSize);
		const im = new Float64Array(fftSize);
		let prevMag = null;
		for (let m = 0; m < numFrames; m++) {
			const analysisPos = Math.floor(m * Ha);
			const synthesisPos = m * Hs;
			if (synthesisPos > outLen + fftSize) break;
			const { mag: rawMag } = analyzeFrame(chan, analysisPos, fftSize, window, half);
			const mag = new Float64Array(half + 1);
			for (let k = 0; k <= half; k++) mag[k] = prevMag ? rawMag[k] * (1 - frameBlend) + prevMag[k] * frameBlend : rawMag[k];
			smoothMagnitudeInPlace(mag, half, smear);
			prevMag = mag;
			const rng = makeRng(deriveSeed(seed, m));
			re[0] = mag[0];
			im[0] = 0;
			re[half] = mag[half];
			im[half] = 0;
			for (let k = 1; k < half; k++) {
				const ph = rng.next() * 2 * Math.PI;
				re[k] = mag[k] * Math.cos(ph);
				im[k] = mag[k] * Math.sin(ph);
				re[fftSize - k] = re[k];
				im[fftSize - k] = -im[k];
			}
			ifft(re, im);
			for (let i = 0; i < fftSize; i++) {
				const s = re[i] * window[i];
				out[synthesisPos + i] += s;
				weight[synthesisPos + i] += window[i] * window[i];
			}
		}
		return normalizeOverlapAdd(out, weight, outLen);
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/varispeed.js
/** ratio = output length / input length, same convention as every other stretch engine here. */
function stretchVarispeed(channels, ratio) {
	return channels.map((ch) => resampleLinear(ch, 1, ratio));
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/cyclic.js
/**
* params: { cycleMs, crossfade (0-0.5, fraction of the cycle spent crossfading into the next), bitDepth }
*/
function stretchCyclic(channels, sampleRate, ratio, params) {
	const p = params || {};
	const cycleSamples = Math.max(16, Math.round((p.cycleMs ?? 60) / 1e3 * sampleRate));
	const crossfade = Math.max(0, Math.min(.5, p.crossfade ?? .3));
	const bitDepth = p.bitDepth ?? null;
	const fadeLen = Math.round(cycleSamples * crossfade);
	const hop = cycleSamples - fadeLen;
	const inputLen = channels[0] ? channels[0].length : 0;
	const outLen = Math.max(1, Math.round(inputLen * ratio));
	const numCycles = Math.ceil(outLen / hop) + 1;
	const gain = new Float32Array(cycleSamples);
	for (let i = 0; i < cycleSamples; i++) {
		let g = 1;
		if (fadeLen > 0 && i < fadeLen) g = (i + 1) / (fadeLen + 1);
		if (fadeLen > 0 && i >= cycleSamples - fadeLen) g = Math.min(g, (cycleSamples - i) / (fadeLen + 1));
		gain[i] = g;
	}
	return channels.map((chan) => {
		const out = new Float32Array(outLen);
		for (let n = 0; n < numCycles; n++) {
			const dst = n * hop;
			if (dst >= outLen) break;
			const src = Math.max(0, Math.min(inputLen - cycleSamples, Math.round(dst / ratio)));
			const first = n === 0;
			for (let i = 0; i < cycleSamples; i++) {
				const idx = dst + i;
				if (idx >= outLen) break;
				const g = first && i < fadeLen ? 1 : gain[i];
				out[idx] += (chan[src + i] || 0) * g;
			}
		}
		if (bitDepth) quantizeInPlace(out, bitDepth);
		return out;
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/index.js
var ENGINE_FNS = {
	wsola: (channels, sr, ratio, params) => stretchWsola(channels, sr, ratio, params),
	phaseVocoder: (channels, sr, ratio, params, seed) => stretchPhaseVocoder(channels, sr, ratio, params, seed),
	granular: (channels, sr, ratio, params, seed) => stretchGranular(channels, sr, ratio, params, seed),
	repeat: (channels, sr, ratio, params, seed) => stretchRepeat(channels, sr, ratio, params, seed),
	spectralFreeze: (channels, sr, ratio, params) => stretchSpectralFreeze(channels, sr, ratio, params),
	paulstretch: (channels, sr, ratio, params, seed) => stretchPaulstretch(channels, sr, ratio, params, seed),
	varispeed: (channels, sr, ratio) => stretchVarispeed(channels, ratio),
	cyclic: (channels, sr, ratio, params) => stretchCyclic(channels, sr, ratio, params)
};
/** Floor the dispatcher clamps to. Exported so a caller can check whether a ratio it wants
* is actually reachable, rather than having it silently clamped underneath them. */
var MIN_RATIO = .05;
/**
* Time-stretch every channel using the named character. `ratio` = output length / input length.
* `options`: { macroValues: {texture, variation, smear, roughness}, seed }. Unrecognised character
* ids (an old id this version dropped, a typo, a corrupt saved setting) fall back to "clean" rather
* than throwing, per resolveCharacter().
*/
function stretchChannels(channels, sampleRate, ratio, characterKey, options = {}) {
	const character = resolveCharacter(characterKey);
	const inputLen = channels[0] ? channels[0].length : 0;
	const lengthCap = inputLen > 0 ? Math.max(1, 600 * sampleRate / inputLen) : Infinity;
	const maxRatio = Math.min(character.maxRatio || 1e3, lengthCap);
	const clamped = Math.max(MIN_RATIO, Math.min(maxRatio, ratio || 1));
	if (Math.abs(clamped - 1) < 1e-6) return channels.map((ch) => Float32Array.from(ch));
	const params = resolveCharacterParams(character, options.macroValues);
	const seed = options.seed ?? 1;
	const result = (ENGINE_FNS[character.engine] || ENGINE_FNS.wsola)(channels, sampleRate, clamped, params, seed);
	for (const ch of result) for (let i = 0; i < ch.length; i++) {
		const v = ch[i];
		if (!Number.isFinite(v)) ch[i] = 0;
		else if (v > 4) ch[i] = 4;
		else if (v < -4) ch[i] = -4;
	}
	return result;
}
//#endregion
//#region src/dsp/transform/settings.ts
/**
* Sample-transformation settings: a non-destructive recipe applied to a sample's audio before
* it is played (time-stretch, varispeed pitch, reverse, drive, crunch), rendered by Good Bits'
* STRETCH FX chain. The original sample is kept; only these settings are stored, and the
* processed audio is recomputed (and cached) when needed.
*/
function identityTransform() {
	return {
		enabled: false,
		reverse: "none",
		pitch: 0,
		character: "clean",
		ratio: 1,
		macros: {},
		drive: {
			enabled: false,
			type: "tape",
			amountPct: 30
		},
		crunch: {
			enabled: false,
			bits: 12,
			rateDivide: 1
		},
		seed: 1
	};
}
/** True when applying the transform would do nothing (so the original audio is used as is). */
function isIdentity(t) {
	return !t.enabled;
}
/** The STRETCH FX recipe for these settings (one stretch pass, or none at ratio 1). */
function toRecipe(t) {
	const usedMacros = CHARACTERS[t.character]?.macros ?? [];
	const macroValues = {};
	for (const k of usedMacros) if (typeof t.macros[k] === "number") macroValues[k] = t.macros[k];
	return {
		seed: t.seed >>> 0,
		pitch: t.pitch,
		reverse: t.reverse === "none" ? null : t.reverse,
		passes: Math.abs(t.ratio - 1) < 1e-6 ? [] : [{
			character: t.character,
			ratio: t.ratio,
			macroValues
		}],
		drive: t.drive.enabled && t.drive.amountPct > 0 ? {
			type: t.drive.type,
			amount: t.drive.amountPct
		} : null,
		crunch: t.crunch.enabled ? {
			bits: t.crunch.bits,
			rateDivide: t.crunch.rateDivide
		} : null
	};
}
/** A stable cache key for the transform's audible settings. */
function transformKey(t) {
	return isIdentity(t) ? "identity" : JSON.stringify(toRecipe(t));
}
/** Characters in Good Bits' display groups (generic names, as Good Bits shows them). */
function stretchCharacters() {
	return GROUPS.map((g) => ({
		group: g.key,
		label: g.label,
		characters: Object.entries(CHARACTERS).filter(([, c]) => c.group === g.key).map(([key, c]) => ({
			key,
			label: c.label,
			macros: c.macros ?? []
		}))
	}));
}
var MACRO_INFO = MACROS;
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var num = (v, lo, hi, def, int = false) => {
	let x = typeof v === "number" && Number.isFinite(v) ? v : def;
	if (int) x = Math.round(x);
	return Math.max(lo, Math.min(hi, x));
};
function repairTransform(src) {
	const d = identityTransform();
	const o = isObj(src) ? src : {};
	const dr = isObj(o.drive) ? o.drive : {};
	const cr = isObj(o.crunch) ? o.crunch : {};
	const macros = {};
	if (isObj(o.macros)) {
		for (const [k, v] of Object.entries(o.macros)) if (k in MACROS && typeof v === "number" && Number.isFinite(v)) macros[k] = Math.max(0, Math.min(100, v));
	}
	return {
		enabled: o.enabled === true,
		reverse: o.reverse === "pre" || o.reverse === "post" ? o.reverse : "none",
		pitch: num(o.pitch, -24, 24, 0),
		character: typeof o.character === "string" && o.character in CHARACTERS ? o.character : d.character,
		ratio: num(o.ratio, .25, 8, 1),
		macros,
		drive: {
			enabled: dr.enabled === true,
			type: [
				"tape",
				"tube",
				"diode",
				"fuzz"
			].includes(dr.type) ? dr.type : "tape",
			amountPct: num(dr.amountPct, 0, 100, 30)
		},
		crunch: {
			enabled: cr.enabled === true,
			bits: num(cr.bits, 1, 16, 12, true),
			rateDivide: num(cr.rateDivide, 1, 32, 1, true)
		},
		seed: num(o.seed, 0, 4294967295, 1, true)
	};
}
//#endregion
//#region src/dsp/vendor/goodbits/js/stretch-fx/render.js
/** Longest output any result may have, in seconds, whatever the recipe says. */
var HARD_MAX_SECONDS = 24;
function peakOf(channels) {
	let peak = 0;
	for (const ch of channels) for (let i = 0; i < ch.length; i++) {
		const v = Math.abs(ch[i]);
		if (v > peak) peak = v;
	}
	return peak;
}
function reverseAll(channels) {
	return channels.map((ch) => Float32Array.from(ch).reverse());
}
function scrub(channels) {
	for (const ch of channels) for (let i = 0; i < ch.length; i++) if (!Number.isFinite(ch[i])) ch[i] = 0;
}
/**
* @param {object} opts
* @param {Float32Array[]} opts.channels  the source fragment (already cut from the break)
* @param {number} opts.sampleRate
* @param {object} opts.recipe            from recipe.js
* @returns {{channels: Float32Array[], sampleRate: number, duration: number}}
*/
function renderFx({ channels, sampleRate, recipe }) {
	if (!channels.length || !channels[0].length) throw new Error("empty fragment");
	const ms = (m) => Math.round(m / 1e3 * sampleRate);
	let out = channels.map((ch) => Float32Array.from(ch));
	const peakIn = peakOf(out);
	applyFades(out, ms(.6), ms(6));
	if (recipe.reverse === "pre") out = reverseAll(out);
	if (recipe.pitch) {
		const lengthFactor = Math.pow(2, -recipe.pitch / 12);
		out = out.map((ch) => resampleLinear(ch, 1, lengthFactor));
	}
	const seedBase = recipe.seed >>> 0;
	recipe.passes.forEach((pass, i) => {
		const maxRatio = HARD_MAX_SECONDS * sampleRate / Math.max(1, out[0].length);
		const ratio = Math.max(.05, Math.min(pass.ratio, maxRatio));
		out = stretchChannels(out, sampleRate, ratio, pass.character, {
			macroValues: pass.macroValues,
			seed: seedBase + i * 7919 >>> 0
		});
	});
	if (recipe.reverse === "post") out = reverseAll(out);
	if (recipe.drive && recipe.drive.amount > 0) out = applyDrive(out, recipe.drive.type, recipe.drive.amount);
	if (recipe.crunch) out = applyCrunch(out, recipe.crunch);
	scrub(out);
	const peakOut = peakOf(out);
	const target = Math.max(.3, Math.min(.92, peakIn || .5));
	if (peakOut > 1e-6) {
		const gain = Math.min(8, target / peakOut);
		for (const ch of out) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
	}
	const fadeIn = recipe.reverse === "post" ? ms(10) : ms(.7);
	const fadeOut = recipe.reverse === "post" ? ms(2) : ms(14);
	applyFades(out, fadeIn, fadeOut);
	return {
		channels: out,
		sampleRate,
		duration: out[0].length / sampleRate
	};
}
//#endregion
//#region src/dsp/transform/transform.ts
/**
* Applying a sample transformation: Good Bits' STRETCH FX renderer (`renderFx`), unchanged.
* Pure and synchronous, so it runs the same on the main thread, in a Worker or in a test.
*/
/** The transformed audio, or the input itself (not copied) when the transform is off. */
function applyTransform(audio, t) {
	if (isIdentity(t)) return audio;
	if (!audio.channels.length || !audio.channels[0].length) throw new Error("empty sample");
	const r = renderFx({
		channels: audio.channels,
		sampleRate: audio.sampleRate,
		recipe: toRecipe(t)
	});
	return {
		sampleRate: r.sampleRate,
		channels: r.channels
	};
}
//#endregion
//#region src/dsp/transform/cache.ts
/**
* Caches transformed sample audio so an expensive transformation runs once per
* (sample, settings), not once per note. The work is done by a runner: synchronous by default,
* or a Worker (see WorkerTransformRunner) in the browser.
*/
var syncRunner = { run: async (audio, t) => applyTransform(audio, t) };
/** Runs transformations in a Worker created from `worker.ts` by the application's bundler. */
var WorkerTransformRunner = class {
	create;
	worker = null;
	next = 1;
	pending = /* @__PURE__ */ new Map();
	constructor(create) {
		this.create = create;
	}
	ensure() {
		if (!this.worker) {
			this.worker = this.create();
			this.worker.onmessage = (e) => {
				const m = e.data;
				const p = this.pending.get(m.id);
				if (!p) return;
				this.pending.delete(m.id);
				if (m.audio) p.resolve(m.audio);
				else p.reject(new Error(m.error ?? "transformation failed"));
			};
			this.worker.onerror = (e) => {
				for (const p of this.pending.values()) p.reject(new Error(e.message || "transformation worker failed"));
				this.pending.clear();
				this.worker = null;
			};
		}
		return this.worker;
	}
	run(audio, t) {
		return new Promise((resolve, reject) => {
			const id = this.next++;
			this.pending.set(id, {
				resolve,
				reject
			});
			this.ensure().postMessage({
				id,
				audio: {
					sampleRate: audio.sampleRate,
					channels: audio.channels.map((c) => c.slice())
				},
				transform: t
			});
		});
	}
	dispose() {
		this.worker?.terminate();
		this.worker = null;
	}
};
var TransformCache = class {
	runner;
	maxEntries;
	entries = /* @__PURE__ */ new Map();
	constructor(runner = syncRunner, maxEntries = 64) {
		this.runner = runner;
		this.maxEntries = maxEntries;
	}
	/** The transformed audio for a sample id and settings (computed once, then shared). */
	get(sampleId, audio, t) {
		if (isIdentity(t)) return Promise.resolve(audio);
		const key = `${sampleId}|${transformKey(t)}`;
		let p = this.entries.get(key);
		if (!p) {
			p = this.runner.run(audio, t);
			this.entries.set(key, p);
			p.catch(() => this.entries.delete(key));
			if (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
		}
		return p;
	}
	has(sampleId, t) {
		return isIdentity(t) || this.entries.has(`${sampleId}|${transformKey(t)}`);
	}
	/** Forget everything cached for a sample. */
	drop(sampleId) {
		for (const k of [...this.entries.keys()]) if (k.startsWith(`${sampleId}|`)) this.entries.delete(k);
	}
	get size() {
		return this.entries.size;
	}
};
//#endregion
export { MACRO_INFO as a, repairTransform as c, transformKey as d, OutputFxStream as f, processBuffers as h, applyTransform as i, stretchCharacters as l, createChain as m, WorkerTransformRunner as n, identityTransform as o, SETTINGS_FADE as p, syncRunner as r, isIdentity as s, TransformCache as t, toRecipe as u };
