import { a as outputStageKernel, c as FX_PRESETS, g as OUTPUT_STAGES, h as DRIVE_TYPES, n as crunchKernel, o as toneKernel, r as driveKernel, u as cleanFx } from "./kernels-B99mK_2J.js";
//#region src/engines/builtin.ts
/**
* The built-in audio engines: The Good Bits' three output stages (its lo-fi chain: OUTPUT
* STAGE, DRIVE, CRUNCH), with Good Bits' own parameter names, ranges, defaults and labels, and
* Core's TONE (Good Bits' one-pole low-pass, already part of Core's combined processor).
*
* Parameter ids are Good Bits' settings field names, so a value means the same thing in every
* application and in Good Bits' own settings.
*/
var AUDIO = {
	kind: "audio",
	inputs: ["audio"],
	outputs: ["audio"],
	realtime: true,
	offline: true,
	latency: 0
};
var GOOD_BITS = "The Good Bits (lo-fi chain, js/outputstage.js)";
var OUTPUT_STAGE_ENGINE = {
	...AUDIO,
	id: "goodbits.output-stage",
	name: "Output stage",
	version: 1,
	description: "A character mode (filters, wow and flutter, noise, compression) blended by intensity and mix.",
	origin: GOOD_BITS,
	category: "character",
	seeded: true,
	params: [
		{
			id: "mode",
			type: "enum",
			label: "Character",
			default: "cassette",
			options: OUTPUT_STAGES.filter((s) => s.key !== "clean").map((s) => ({
				value: s.key,
				label: s.label,
				description: s.description
			}))
		},
		{
			id: "mixPct",
			type: "continuous",
			label: "Mix",
			min: 0,
			max: 100,
			step: 1,
			default: 100,
			unit: "%",
			smooth: true,
			description: "Final wet/dry blend"
		},
		{
			id: "intensityPct",
			type: "continuous",
			label: "Intensity",
			min: 0,
			max: 100,
			step: 1,
			default: 50,
			unit: "%",
			smooth: true,
			description: "How strongly the mode differs from the dry signal"
		}
	],
	createKernel: (sr, p, seed) => outputStageKernel(sr, {
		mode: String(p.mode),
		mixPct: Number(p.mixPct),
		intensityPct: Number(p.intensityPct)
	}, seed)
};
var DRIVE_ENGINE = {
	...AUDIO,
	id: "goodbits.drive",
	name: "Drive",
	version: 1,
	description: "Memoryless saturation: tape (soft), tube (asymmetric), diode (hard clip) or fuzz.",
	origin: GOOD_BITS,
	category: "saturation",
	params: [{
		id: "type",
		type: "enum",
		label: "Type",
		default: "tape",
		options: DRIVE_TYPES.map((d) => ({
			value: d.key,
			label: d.label,
			description: d.description
		}))
	}, {
		id: "amountPct",
		type: "continuous",
		label: "Amount",
		min: 0,
		max: 100,
		step: 1,
		default: 40,
		unit: "%",
		neutral: 0,
		smooth: true
	}],
	createKernel: (sr, p) => driveKernel(sr, {
		type: String(p.type),
		amountPct: Number(p.amountPct)
	})
};
var CRUNCH_ENGINE = {
	...AUDIO,
	id: "goodbits.crunch",
	name: "Crunch",
	version: 1,
	description: "Bit-depth reduction and sample-and-hold rate reduction, with no anti-alias filter (the aliasing is the sound).",
	origin: GOOD_BITS,
	category: "lo-fi",
	params: [{
		id: "bits",
		type: "integer",
		label: "Bit depth",
		min: 1,
		max: 16,
		default: 8,
		unit: "bit",
		neutral: 16
	}, {
		id: "rateDivide",
		type: "integer",
		label: "Rate divide",
		min: 1,
		max: 32,
		default: 1,
		unit: "x",
		neutral: 1,
		description: "Every n-th sample is held for n samples"
	}],
	createKernel: (_sr, p) => crunchKernel({
		bits: Number(p.bits),
		rateDivide: Number(p.rateDivide)
	})
};
var TONE_ENGINE = {
	...AUDIO,
	id: "core.tone",
	name: "Tone",
	version: 1,
	description: "A gentle one-pole low-pass (6 dB per octave).",
	origin: "Slop Factory Core (The Good Bits one-pole low-pass)",
	category: "filter",
	params: [{
		id: "hz",
		type: "continuous",
		label: "Cutoff",
		min: 200,
		max: 2e4,
		step: 100,
		default: 8e3,
		unit: "Hz",
		neutral: 2e4
	}],
	createKernel: (sr, p) => toneKernel(sr, { hz: Number(p.hz) })
};
/** Every built-in audio engine, in Good Bits' chain order. Immutable. */
var BUILTIN_AUDIO_ENGINES = Object.freeze([
	OUTPUT_STAGE_ENGINE,
	DRIVE_ENGINE,
	CRUNCH_ENGINE,
	TONE_ENGINE
]);
/** The Good Bits' own selection (its original three stages). */
var GOOD_BITS_ENGINE_IDS = Object.freeze([
	OUTPUT_STAGE_ENGINE.id,
	DRIVE_ENGINE.id,
	CRUNCH_ENGINE.id
]);
//#endregion
//#region src/engines/params.ts
/** The default value of every parameter. */
function defaultParams(defs) {
	const out = {};
	for (const d of defs) out[d.id] = d.default;
	return out;
}
/** One value made valid for its parameter: clamped, rounded, or the default when unusable. */
function repairParam(def, v) {
	switch (def.type) {
		case "continuous":
		case "integer": {
			let x = typeof v === "number" && Number.isFinite(v) ? v : def.default;
			if (def.type === "integer") x = Math.round(x);
			return Math.max(def.min, Math.min(def.max, x));
		}
		case "boolean": return typeof v === "boolean" ? v : def.default;
		case "enum": return typeof v === "string" && def.options.some((o) => o.value === v) ? v : def.default;
	}
}
/** Every parameter present and valid; unknown keys dropped. */
function repairParams(defs, src) {
	const o = src && typeof src === "object" && !Array.isArray(src) ? src : {};
	const out = {};
	for (const d of defs) out[d.id] = repairParam(d, o[d.id]);
	return out;
}
/** Whether a value is already valid (repairParam would leave it unchanged). */
function isValidParam(def, v) {
	return repairParam(def, v) === v;
}
var trim = (x, step) => {
	const d = step && step < 1 ? Math.min(4, Math.ceil(-Math.log10(step))) : 0;
	return x.toFixed(d);
};
/** A short display string, e.g. "40%", "8 bit", "OFF", "Cassette". Applications may format their own. */
function formatParam(def, v) {
	switch (def.type) {
		case "continuous":
		case "integer": {
			const x = Number(v);
			if (def.neutral !== void 0 && x === def.neutral) return "OFF";
			const s = def.type === "integer" ? String(Math.round(x)) : trim(x, def.step);
			if (!def.unit) return s;
			return /^[%x]/.test(def.unit) ? `${s}${def.unit}` : `${s} ${def.unit}`;
		}
		case "boolean": return v ? "ON" : "OFF";
		case "enum": return def.options.find((o) => o.value === v)?.label ?? String(v);
	}
}
//#endregion
//#region src/engines/chain.ts
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
var CHAIN_VERSION = 1;
/** Stages a chain may hold. */
var MAX_STAGES = 8;
var emptyChain = () => ({
	version: 1,
	bypass: false,
	stages: []
});
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var isPrimitive = (v) => typeof v === "boolean" || typeof v === "string" || typeof v === "number" && Number.isFinite(v);
function nextStageId(stages) {
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
function repairChain(src, engines) {
	return repairChainWith(src, (id) => engines?.audio(id));
}
/** repairChain with any engine lookup (MIDI chains use their MIDI engines). */
function repairChainWith(src, find) {
	const o = isObj(src) ? src : {};
	const stages = [];
	const ids = /* @__PURE__ */ new Set();
	for (const raw of Array.isArray(o.stages) ? o.stages : []) {
		if (stages.length >= 8) break;
		if (!isObj(raw) || typeof raw.engine !== "string" || !raw.engine) continue;
		const def = find(raw.engine);
		let params;
		if (def) params = repairParams(def.params, raw.params);
		else {
			params = {};
			if (isObj(raw.params)) {
				for (const [k, v] of Object.entries(raw.params)) if (isPrimitive(v)) params[k] = v;
			}
		}
		let id = typeof raw.id === "string" && raw.id && !ids.has(raw.id) ? raw.id : "";
		if (!id) id = nextStageId([...stages, ...[...ids].map((i) => ({ id: i }))]);
		ids.add(id);
		const st = {
			id,
			engine: raw.engine,
			enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
			params
		};
		const v = def ? def.version : typeof raw.v === "number" ? raw.v : void 0;
		if (v !== void 0) st.v = v;
		stages.push(st);
	}
	return {
		version: 1,
		bypass: typeof o.bypass === "boolean" ? o.bypass : false,
		stages
	};
}
/** Does the chain change audio at all? (False: nothing enabled, or bypassed.) */
function chainActive(c, engines) {
	return !c.bypass && c.stages.some((s) => s.enabled && (!engines || !!engines.audio(s.engine)));
}
/** Stages whose engine is not in `engines` (shown as unavailable). */
function unavailableStages(c, engines) {
	return c.stages.filter((s) => !engines.audio(s.engine));
}
/**
* The seed each stage's kernel gets: the chain seed for the first stage of each engine, a
* derived one for further stages of the same engine. A stage's seed therefore does not change
* when stages of other engines are added, removed or moved.
*/
function stageSeeds(c, seed) {
	const count = /* @__PURE__ */ new Map();
	return c.stages.map((s) => {
		const k = count.get(s.engine) ?? 0;
		count.set(s.engine, k + 1);
		return k === 0 ? seed >>> 0 : (Math.imul((seed ^ k * 2654435761) >>> 0, 2246822507) ^ k) >>> 0;
	});
}
/**
* The stages of a combined output-processor setting (Core's OutputFxSettings), in its order:
* output stage, drive, crunch, tone. Its input and output gain are not stages and are not
* carried over.
*/
function chainFromFx(fx) {
	const c = emptyChain();
	c.bypass = fx.bypass;
	const add = (engine, params) => c.stages.push({
		id: nextStageId(c.stages),
		engine: engine.id,
		enabled: true,
		params: repairParams(engine.params, params),
		v: engine.version
	});
	if (fx.outputStage.enabled) add(OUTPUT_STAGE_ENGINE, { ...fx.outputStage });
	if (fx.drive.enabled) add(DRIVE_ENGINE, { ...fx.drive });
	if (fx.crunch.enabled) add(CRUNCH_ENGINE, { ...fx.crunch });
	if (fx.tone.enabled) add(TONE_ENGINE, { ...fx.tone });
	return c;
}
/** Core's processing presets (CLEAN, 12-BIT, BITCRUSH, ...) as chains. */
var CHAIN_PRESETS = Object.freeze(FX_PRESETS.map((p) => ({
	key: p.key,
	label: p.label,
	description: p.description,
	config: chainFromFx(p.apply(cleanFx()))
})));
/** Presets whose every engine is available. */
function presetsFor(engines, presets = CHAIN_PRESETS) {
	return presets.filter((p) => p.config.stages.every((s) => !!engines.audio(s.engine)));
}
/** Which preset (if any) a configuration currently equals (stage ids ignored). */
function matchChainPreset(c, presets = CHAIN_PRESETS) {
	const key = (x) => JSON.stringify(x.stages.map((s) => [
		s.engine,
		s.enabled,
		s.params
	]));
	const k = key(c);
	return presets.find((p) => key(p.config) === k)?.key ?? null;
}
/**
* A headless controller for one chain: the operations an interface needs, validated against
* the application's registry, with change notifications. It holds no audio; applications pass
* `config` to a chain node (live), to the renderer (export) and to their settings storage.
* Every change produces a new configuration object (the old one is never mutated).
*/
var OutputChain = class {
	registry;
	maxStages;
	cfg;
	listeners = /* @__PURE__ */ new Set();
	constructor(registry, config, maxStages = 8) {
		this.registry = registry;
		this.maxStages = maxStages;
		this.cfg = repairChain(config, registry);
	}
	get config() {
		return this.cfg;
	}
	get stages() {
		return this.cfg.stages;
	}
	/** The audio engines the application offers, in its order. */
	available() {
		return this.registry.list({ kind: "audio" });
	}
	stage(id) {
		return this.cfg.stages.find((s) => s.id === id);
	}
	/** The stage's engine, or undefined when it is unavailable in this application. */
	engine(stage) {
		const s = typeof stage === "string" ? this.stage(stage) : stage;
		return s ? this.registry.audio(s.engine) : void 0;
	}
	get canAdd() {
		return this.cfg.stages.length < Math.min(this.maxStages, 8);
	}
	subscribe(fn) {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}
	commit(next) {
		this.cfg = next;
		for (const fn of [...this.listeners]) fn(next);
	}
	mapStage(id, fn) {
		const i = this.cfg.stages.findIndex((s) => s.id === id);
		if (i < 0) return false;
		const next = fn(this.cfg.stages[i]);
		if (!next) return false;
		const stages = [...this.cfg.stages];
		stages[i] = next;
		this.commit({
			...this.cfg,
			stages
		});
		return true;
	}
	/** Add a stage with the engine's defaults (at the end, or at `index`). Returns its id. */
	add(engineId, index = this.cfg.stages.length) {
		const def = this.registry.audio(engineId);
		if (!def || !this.canAdd) return null;
		const st = {
			id: nextStageId(this.cfg.stages),
			engine: def.id,
			enabled: true,
			params: defaultParams(def.params),
			v: def.version
		};
		const stages = [...this.cfg.stages];
		stages.splice(Math.max(0, Math.min(stages.length, index)), 0, st);
		this.commit({
			...this.cfg,
			stages
		});
		return st.id;
	}
	remove(id) {
		if (!this.stage(id)) return false;
		this.commit({
			...this.cfg,
			stages: this.cfg.stages.filter((s) => s.id !== id)
		});
		return true;
	}
	/** Move a stage to a new position (clamped). */
	moveTo(id, index) {
		const from = this.cfg.stages.findIndex((s) => s.id === id);
		if (from < 0) return false;
		const to = Math.max(0, Math.min(this.cfg.stages.length - 1, index));
		if (to === from) return false;
		const stages = [...this.cfg.stages];
		const [s] = stages.splice(from, 1);
		stages.splice(to, 0, s);
		this.commit({
			...this.cfg,
			stages
		});
		return true;
	}
	/** Move a stage up (-1) or down (+1). */
	move(id, delta) {
		const i = this.cfg.stages.findIndex((s) => s.id === id);
		return i >= 0 && this.moveTo(id, i + delta);
	}
	/** Swap a stage's engine for another (same position and enabled state, the new engine's defaults). */
	replace(id, engineId) {
		const def = this.registry.audio(engineId);
		if (!def) return false;
		return this.mapStage(id, (s) => s.engine === engineId ? null : {
			...s,
			engine: def.id,
			params: defaultParams(def.params),
			v: def.version
		});
	}
	setEnabled(id, enabled) {
		return this.mapStage(id, (s) => s.enabled === enabled ? null : {
			...s,
			enabled
		});
	}
	/** Set one parameter (validated: clamped, rounded, or refused for unknown parameters). */
	setParam(id, param, value) {
		return this.setParams(id, { [param]: value });
	}
	setParams(id, patch) {
		return this.mapStage(id, (s) => {
			const def = this.registry.audio(s.engine);
			if (!def) return null;
			const params = { ...s.params };
			let changed = false;
			for (const [k, v] of Object.entries(patch)) {
				const p = def.params.find((x) => x.id === k);
				if (!p || v === void 0) continue;
				const r = repairParam(p, v);
				if (params[k] !== r) {
					params[k] = r;
					changed = true;
				}
			}
			return changed ? {
				...s,
				params
			} : null;
		});
	}
	/** Back to the engine's defaults. */
	resetParams(id) {
		return this.mapStage(id, (s) => {
			const def = this.registry.audio(s.engine);
			return def ? {
				...s,
				params: defaultParams(def.params)
			} : null;
		});
	}
	/** Apply one of the stage's engine presets. */
	applyEnginePreset(id, key) {
		const pr = this.engine(id)?.presets?.find((p) => p.key === key);
		return !!pr && this.setParams(id, pr.params);
	}
	/** Bypass (or restore) the whole chain. */
	setBypass(bypass) {
		if (this.cfg.bypass !== bypass) this.commit({
			...this.cfg,
			bypass
		});
	}
	/** Replace the configuration (validated). */
	load(config) {
		this.commit(repairChain(config, this.registry));
	}
	/** Replace the stages with a preset's (only if every engine it uses is available). */
	applyPreset(preset) {
		if (!preset.config.stages.every((s) => this.registry.audio(s.engine))) return false;
		this.commit(repairChain({
			...preset.config,
			bypass: false
		}, this.registry));
		return true;
	}
	clear() {
		this.commit({
			...this.cfg,
			stages: []
		});
	}
};
//#endregion
//#region src/engines/constants.ts
/** The AudioWorklet processor name registered by the chain worklet. */
var OUTPUT_CHAIN_PROCESSOR = "slopfactory-output-chain";
//#endregion
//#region src/engines/node.ts
/**
* Output-chain nodes for any BaseAudioContext (live or offline).
*
* `loadOutputChain(ctx, moduleUrl)` registers the chain worklet once per context. The module URL
* comes from the application's bundler (for Vite: `import url from
* '@slopfactory/core/chain-worklet.js?url'`), so Core makes no assumption about how it is served.
*
* Without AudioWorklet (an insecure context or an old browser) `createChainNode` returns a
* plain stereo pass-through and reports `processing: false`, so audio still plays, unprocessed.
*/
var loaded = /* @__PURE__ */ new WeakMap();
function loadOutputChain(ctx, moduleUrl) {
	let byUrl = loaded.get(ctx);
	if (!byUrl) loaded.set(ctx, byUrl = /* @__PURE__ */ new Map());
	let p = byUrl.get(moduleUrl);
	if (!p) {
		p = (async () => {
			try {
				if (!ctx.audioWorklet) return false;
				await ctx.audioWorklet.addModule(moduleUrl);
				return true;
			} catch {
				return false;
			}
		})();
		byUrl.set(moduleUrl, p);
	}
	return p;
}
/** A stereo node that runs a chain. Mono sources are up-mixed to two channels. */
function createChainNode(ctx, config = emptyChain(), opts) {
	let current = config;
	if (opts.available && typeof AudioWorkletNode !== "undefined") {
		const node = new AudioWorkletNode(ctx, opts.processor ?? "slopfactory-output-chain", {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			outputChannelCount: [2],
			channelCount: 2,
			channelCountMode: "explicit",
			channelInterpretation: "speakers",
			processorOptions: {
				config,
				seed: (opts.seed ?? 1) >>> 0,
				...opts.resetAt !== void 0 ? { resetAt: opts.resetAt } : {}
			}
		});
		return {
			node,
			processing: true,
			get config() {
				return current;
			},
			set(c) {
				current = c;
				node.port.postMessage({
					type: "config",
					config: c
				});
			},
			reset(at) {
				node.port.postMessage({
					type: "reset",
					at
				});
			},
			dispose() {
				node.disconnect();
				node.port.onmessage = null;
				node.port.close();
			}
		};
	}
	const g = ctx.createGain();
	g.channelCount = 2;
	g.channelCountMode = "explicit";
	g.channelInterpretation = "speakers";
	return {
		node: g,
		processing: false,
		get config() {
			return current;
		},
		set(c) {
			current = c;
		},
		reset() {},
		dispose() {
			g.disconnect();
		}
	};
}
//#endregion
export { CRUNCH_ENGINE as C, TONE_ENGINE as D, OUTPUT_STAGE_ENGINE as E, BUILTIN_AUDIO_ENGINES as S, GOOD_BITS_ENGINE_IDS as T, defaultParams as _, CHAIN_VERSION as a, repairParam as b, chainActive as c, matchChainPreset as d, presetsFor as f, unavailableStages as g, stageSeeds as h, CHAIN_PRESETS as i, chainFromFx as l, repairChainWith as m, loadOutputChain as n, MAX_STAGES as o, repairChain as p, OUTPUT_CHAIN_PROCESSOR as r, OutputChain as s, createChainNode as t, emptyChain as u, formatParam as v, DRIVE_ENGINE as w, repairParams as x, isValidParam as y };
