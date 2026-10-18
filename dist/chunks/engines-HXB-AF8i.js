import { t as Ramp } from "./kernels-B99mK_2J.js";
import { S as BUILTIN_AUDIO_ENGINES, b as repairParam, c as chainActive, h as stageSeeds, m as repairChainWith, p as repairChain, r as OUTPUT_CHAIN_PROCESSOR, u as emptyChain } from "./node-B0-SEP0H.js";
//#region src/engines/registry.ts
/**
* Engine registries. A registry is an ordinary object an application creates and owns (there is
* no global list): it holds the engines that application supports, in the order its menus show
* them. `coreEngines()` gives a fresh registry of the built-in engines, optionally restricted to
* the ones the application can use.
*/
var ID = /^[a-z0-9][a-z0-9._-]*$/;
/** Problems with an engine definition (empty when it is usable). */
function checkEngine(def) {
	const errs = [];
	if (!ID.test(def.id ?? "")) errs.push(`invalid id "${def.id}"`);
	if (!def.name) errs.push("missing name");
	if (!Number.isInteger(def.version) || def.version < 1) errs.push("version must be a positive integer");
	if (def.kind !== "audio" && def.kind !== "midi") errs.push(`unknown kind "${def.kind}"`);
	if (def.kind === "audio" && typeof def.createKernel !== "function") errs.push("audio engines need createKernel");
	if (def.kind === "midi" && typeof def.createProcessor !== "function") errs.push("MIDI engines need createProcessor");
	const seen = /* @__PURE__ */ new Set();
	for (const p of def.params ?? []) {
		if (seen.has(p.id)) errs.push(`duplicate parameter "${p.id}"`);
		seen.add(p.id);
		errs.push(...checkParam(p));
	}
	for (const pr of def.presets ?? []) for (const k of Object.keys(pr.params)) if (!seen.has(k)) errs.push(`preset "${pr.key}" sets unknown parameter "${k}"`);
	return errs;
}
function checkParam(p) {
	const errs = [];
	if ((p.type === "continuous" || p.type === "integer") && !(p.min < p.max)) errs.push(`parameter "${p.id}": min must be below max`);
	if (p.type === "enum" && !p.options.length) errs.push(`parameter "${p.id}": no options`);
	if (repairParam(p, p.default) !== p.default) errs.push(`parameter "${p.id}": default out of range`);
	return errs;
}
var EngineRegistry = class EngineRegistry {
	defs = /* @__PURE__ */ new Map();
	constructor(defs = []) {
		for (const d of defs) this.register(d);
	}
	/** Add an engine. Throws on an invalid definition or a duplicate id. */
	register(def) {
		const errs = checkEngine(def);
		if (errs.length) throw new Error(`engine "${def.id}": ${errs.join("; ")}`);
		if (this.defs.has(def.id)) throw new Error(`engine "${def.id}" is already registered`);
		this.defs.set(def.id, def);
		return this;
	}
	/** Remove an engine (configurations that use it keep it as unavailable). */
	unregister(id) {
		return this.defs.delete(id);
	}
	has(id) {
		return this.defs.has(id);
	}
	get(id) {
		return this.defs.get(id);
	}
	audio(id) {
		const d = this.defs.get(id);
		return d?.kind === "audio" ? d : void 0;
	}
	midi(id) {
		const d = this.defs.get(id);
		return d?.kind === "midi" ? d : void 0;
	}
	/** Engines in registration order. */
	list(filter = {}) {
		return [...this.defs.values()].filter((d) => !filter.kind || d.kind === filter.kind);
	}
	/** A new registry with only these engines (in this registry's order); unknown ids are ignored. */
	only(ids) {
		const want = new Set(ids);
		return new EngineRegistry(this.list().filter((d) => want.has(d.id)));
	}
};
/** A fresh registry of the built-in engines (all of them, or only `ids`). */
function coreEngines(ids) {
	const r = new EngineRegistry(BUILTIN_AUDIO_ENGINES);
	return ids ? r.only(ids) : r;
}
//#endregion
//#region src/engines/stream.ts
/**
* The output chain as a block processor. The same class runs inside the chain AudioWorklet
* (live AudioContext and OfflineAudioContext) and over plain buffers (`renderChain`), so what
* an application plays and what it exports come from one implementation.
*
* Changes while running never click:
* - a parameter the engine can change in place ramps (mix, intensity, drive amount);
* - any other parameter change builds a new kernel for that stage and crossfades to it;
* - enabling or bypassing a stage, or the whole chain, crossfades between processed and dry
*   (a re-enabled stage starts from fresh state);
* - adding, removing, reordering or replacing stages builds the new chain and crossfades from
*   the old one.
* With nothing changing, a stage's output is exactly its kernel's output, and a disabled stage
* or a bypassed chain is exactly the input.
*/
/** Samples over which a structural, bypass or kernel change crossfades (about 12 ms at 44.1 kHz). */
var CHAIN_FADE = 512;
var sameParams = (a, b) => {
	const ka = Object.keys(a);
	return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};
var StageRunner = class {
	def;
	stage;
	sampleRate;
	seed;
	kernel = null;
	old = null;
	fadeLeft = 0;
	wet;
	constructor(def, stage, sampleRate, seed) {
		this.def = def;
		this.stage = stage;
		this.sampleRate = sampleRate;
		this.seed = seed;
		this.wet = new Ramp(stage.enabled ? 1 : 0);
		if (def && stage.enabled) this.kernel = this.create();
	}
	create() {
		return this.def ? this.def.createKernel(this.sampleRate, this.stage.params, this.seed) : null;
	}
	update(stage) {
		const prev = this.stage;
		this.stage = stage;
		if (!this.def) return;
		if (stage.enabled && !prev.enabled) {
			if (this.wet.steady && this.wet.value === 0) {
				this.kernel = this.create();
				this.old = null;
				this.fadeLeft = 0;
			}
			this.wet.to(1, 512);
		} else if (!stage.enabled && prev.enabled) this.wet.to(0, 512);
		if (sameParams(prev.params, stage.params) || !this.kernel) return;
		if (this.kernel.update?.(stage.params)) return;
		if (!this.old) {
			this.old = this.kernel;
			this.fadeLeft = 512;
		}
		this.kernel = this.create();
	}
	process(L, R, n, s) {
		const k = this.kernel;
		const w = this.wet;
		if (!k || w.steady && w.value === 0) return;
		const blend = !w.steady || w.value !== 1;
		if (blend) {
			s.dL.set(L.subarray(0, n));
			s.dR.set(R.subarray(0, n));
		}
		if (this.old) {
			const { oL, oR } = s;
			oL.set(L.subarray(0, n));
			oR.set(R.subarray(0, n));
			this.old.process(oL, oR, n);
			k.process(L, R, n);
			for (let i = 0; i < n && this.fadeLeft > 0; i++, this.fadeLeft--) {
				const t = 1 - this.fadeLeft / 512;
				L[i] = oL[i] + (L[i] - oL[i]) * t;
				R[i] = oR[i] + (R[i] - oR[i]) * t;
			}
			if (this.fadeLeft <= 0) this.old = null;
		} else k.process(L, R, n);
		if (blend) {
			const { dL, dR } = s;
			for (let i = 0; i < n; i++) {
				const g = w.next();
				L[i] = dL[i] + (L[i] - dL[i]) * g;
				R[i] = dR[i] + (R[i] - dR[i]) * g;
			}
		}
	}
};
var structure = (c) => JSON.stringify(c.stages.map((s) => [s.id, s.engine]));
var ChainStream = class {
	engines;
	sampleRate;
	seed;
	cfg;
	runners;
	oldRunners = null;
	fadeLeft = 0;
	wet;
	scratch = {
		dL: /* @__PURE__ */ new Float32Array(128),
		dR: /* @__PURE__ */ new Float32Array(128),
		oL: /* @__PURE__ */ new Float32Array(128),
		oR: /* @__PURE__ */ new Float32Array(128)
	};
	cL = /* @__PURE__ */ new Float32Array(128);
	cR = /* @__PURE__ */ new Float32Array(128);
	xL = /* @__PURE__ */ new Float32Array(128);
	xR = /* @__PURE__ */ new Float32Array(128);
	constructor(engines, config, sampleRate, seed) {
		this.engines = engines;
		this.sampleRate = sampleRate;
		this.seed = seed;
		this.cfg = repairChain(config, engines);
		this.runners = this.build();
		this.wet = new Ramp(this.cfg.bypass ? 0 : 1);
	}
	get config() {
		return this.cfg;
	}
	/** True when the chain leaves audio unchanged and nothing is fading. */
	get idle() {
		return !this.oldRunners && this.wet.steady && (this.wet.value === 0 || !chainActive(this.cfg, this.engines));
	}
	build() {
		const seeds = stageSeeds(this.cfg, this.seed);
		return this.cfg.stages.map((s, i) => new StageRunner(this.engines.audio(s.engine), s, this.sampleRate, seeds[i]));
	}
	set(config) {
		const next = repairChain(config, this.engines);
		const prev = this.cfg;
		this.cfg = next;
		if (next.bypass !== prev.bypass) {
			if (!next.bypass && this.wet.steady && this.wet.value === 0) {
				this.runners = this.build();
				this.oldRunners = null;
				this.fadeLeft = 0;
			}
			this.wet.to(next.bypass ? 0 : 1, 512);
		}
		if (structure(next) !== structure(prev)) {
			if (!this.oldRunners) {
				this.oldRunners = this.runners;
				this.fadeLeft = 512;
			}
			this.runners = this.build();
			return;
		}
		next.stages.forEach((s, i) => this.runners[i].update(s));
	}
	/** Start every stage's state afresh (noise, filters, counters), with no crossfade. */
	reset() {
		this.oldRunners = null;
		this.fadeLeft = 0;
		this.wet = new Ramp(this.cfg.bypass ? 0 : 1);
		this.runners = this.build();
	}
	grow(n) {
		if (this.cL.length >= n) return;
		this.scratch = {
			dL: new Float32Array(n),
			dR: new Float32Array(n),
			oL: new Float32Array(n),
			oR: new Float32Array(n)
		};
		this.cL = new Float32Array(n);
		this.cR = new Float32Array(n);
		this.xL = new Float32Array(n);
		this.xR = new Float32Array(n);
	}
	run(runners, L, R, n) {
		for (const r of runners) r.process(L, R, n, this.scratch);
	}
	/** Process a stereo block in place. */
	process(L, R, n = L.length) {
		const w = this.wet;
		if (w.steady && w.value === 0) return;
		this.grow(n);
		const blend = !w.steady || w.value !== 1;
		if (blend) {
			this.cL.set(L.subarray(0, n));
			this.cR.set(R.subarray(0, n));
		}
		if (this.oldRunners) {
			const { xL, xR } = this;
			xL.set(L.subarray(0, n));
			xR.set(R.subarray(0, n));
			this.run(this.oldRunners, xL, xR, n);
			this.run(this.runners, L, R, n);
			for (let i = 0; i < n && this.fadeLeft > 0; i++, this.fadeLeft--) {
				const t = 1 - this.fadeLeft / 512;
				L[i] = xL[i] + (L[i] - xL[i]) * t;
				R[i] = xR[i] + (R[i] - xR[i]) * t;
			}
			if (this.fadeLeft <= 0) this.oldRunners = null;
		} else this.run(this.runners, L, R, n);
		if (blend) {
			const { cL, cR } = this;
			for (let i = 0; i < n; i++) {
				const g = w.next();
				L[i] = cL[i] + (L[i] - cL[i]) * g;
				R[i] = cR[i] + (R[i] - cR[i]) * g;
			}
		}
	}
};
var builtin = null;
/**
* Run a chain over whole buffers: the offline path, the same code as the worklet. One channel
* in gives one channel out (processed as identical left and right, as Good Bits does); the
* input is not modified.
*/
function renderChain(channels, sampleRate, config, seed, opts = {}) {
	const engines = opts.engines ?? (builtin ??= coreEngines());
	const L = Float32Array.from(channels[0] ?? []);
	const R = Float32Array.from(channels[1] ?? channels[0] ?? []);
	const s = new ChainStream(engines, config, sampleRate, seed >>> 0);
	if (!s.idle) {
		const block = Math.max(1, opts.blockSize ?? 128);
		for (let i = 0; i < L.length; i += block) {
			const n = Math.min(block, L.length - i);
			s.process(L.subarray(i, i + n), R.subarray(i, i + n), n);
		}
	}
	return channels.length > 1 ? [L, R] : [L];
}
//#endregion
//#region src/engines/processor.ts
/**
* The output-chain AudioWorklet processor. It only moves blocks in and out of a ChainStream, so
* live playback (AudioContext) and offline rendering (OfflineAudioContext) run exactly the same
* DSP code as `renderChain`.
*
* `registerChainProcessor(engines)` registers it for a set of engines. Core's own worklet file
* (`chain-worklet.js`) registers the built-in engines; an application with engines of its own
* builds a worklet entry that calls this with its engine list.
*
* Messages: { type: 'config', config } changes the chain (crossfaded where needed);
*           { type: 'reset', at } restarts every stage's state at context time `at` (seconds).
*/
function registerChainProcessor(engines, name = OUTPUT_CHAIN_PROCESSOR) {
	const registry = new EngineRegistry(engines);
	class OutputChainProcessor extends AudioWorkletProcessor {
		stream;
		resetAt = null;
		constructor(options) {
			super(options);
			const po = options.processorOptions ?? {};
			this.stream = new ChainStream(registry, po.config ?? emptyChain(), sampleRate, (po.seed ?? 1) >>> 0);
			if (typeof po.resetAt === "number") this.resetAt = po.resetAt;
			this.port.onmessage = (e) => {
				const m = e.data;
				if (m.type === "config" && m.config) this.stream.set(m.config);
				else if (m.type === "reset") this.resetAt = typeof m.at === "number" ? m.at : 0;
			};
		}
		process(inputs, outputs) {
			const out = outputs[0];
			const L = out[0];
			const R = out[1] ?? out[0];
			const inp = inputs[0] ?? [];
			if (inp.length > 0) {
				L.set(inp[0]);
				R.set(inp[1] ?? inp[0]);
			} else {
				L.fill(0);
				R.fill(0);
			}
			if (this.resetAt !== null && currentTime >= this.resetAt) {
				this.stream.reset();
				this.resetAt = null;
			}
			this.stream.process(L, R, L.length);
			return true;
		}
	}
	registerProcessor(name, OutputChainProcessor);
}
//#endregion
//#region src/engines/midi.ts
/**
* A serial chain of MIDI engines with note safety built in.
*
* Engines transform note-ons and channel messages; they never end notes. The chain records, for
* every note-on it receives, the note-ons that left the chain because of it, and when that note
* ends (note-off, or note-on with velocity 0) it sends the matching note-offs itself, no
* earlier than the note-ons they end. So bypassing, removing, reordering or re-configuring an
* engine while notes are held, or stopping the transport, can never leave a note stuck:
* whatever an engine did to a note-on, its note-off follows the recorded result.
*
* Where two held notes produce the same output note (same channel and key), the output note-off
* is sent when the last of them ends. System messages (clock, start, stop, song position) pass
* through untouched, in order.
*
* No MIDI engine is built in yet (The Good Bits has no MIDI processing to extract); this is the
* contract and plumbing that future MIDI engines plug into.
*/
var isNoteOn = (b) => (b[0] & 240) === 144 && (b[2] ?? 0) > 0;
var isNoteOff = (b) => (b[0] & 240) === 128 || (b[0] & 240) === 144 && (b[2] ?? 0) === 0;
var noteKey = (b) => (b[0] & 15) * 128 + (b[1] & 127);
var MidiEngineChain = class {
	engines;
	out;
	cfg;
	stages = [];
	/** input note -> the output notes it produced, with their note-on times */
	held = /* @__PURE__ */ new Map();
	/** output note -> number of input notes holding it */
	holders = /* @__PURE__ */ new Map();
	constructor(engines, config, out) {
		this.engines = engines;
		this.out = out;
		this.cfg = repairChainWith(config, (id) => this.engines.midi(id));
		this.build();
	}
	get config() {
		return this.cfg;
	}
	/** Output notes currently sounding. */
	get sounding() {
		return this.holders.size;
	}
	create(s) {
		return this.engines.midi(s.engine)?.createProcessor(s.params) ?? null;
	}
	build() {
		this.stages = this.cfg.stages.map((s) => ({
			cfg: s,
			proc: this.create(s)
		}));
	}
	/** Change the chain. Held notes keep their recorded outputs and end correctly. */
	set(config) {
		const next = repairChainWith(config, (id) => this.engines.midi(id));
		const old = new Map(this.stages.map((s) => [s.cfg.id, s]));
		this.cfg = next;
		this.stages = next.stages.map((c) => {
			const prev = old.get(c.id);
			if (prev && prev.cfg.engine === c.engine && prev.proc) {
				if (JSON.stringify(prev.cfg.params) === JSON.stringify(c.params) || prev.proc.update?.(c.params)) return {
					cfg: c,
					proc: prev.proc
				};
			}
			return {
				cfg: c,
				proc: this.create(c)
			};
		});
	}
	run(msg) {
		let msgs = [msg];
		if (this.cfg.bypass) return msgs;
		for (const s of this.stages) {
			if (!s.cfg.enabled || !s.proc) continue;
			const next = [];
			for (const m of msgs) s.proc.process(m, (o) => !isNoteOff(o.bytes) && next.push({
				bytes: [...o.bytes],
				time: o.time
			}));
			msgs = next;
		}
		return msgs;
	}
	release(input, time) {
		const outs = this.held.get(input);
		if (!outs) return;
		this.held.delete(input);
		for (const o of outs) {
			const n = (this.holders.get(o.key) ?? 1) - 1;
			if (n > 0) {
				this.holders.set(o.key, n);
				continue;
			}
			this.holders.delete(o.key);
			this.out({
				bytes: [
					128 | Math.floor(o.key / 128),
					o.key % 128,
					0
				],
				time: Math.max(time, o.time)
			});
		}
	}
	/** Send one message into the chain. */
	send(msg) {
		const b = msg.bytes;
		if (!b.length) return;
		if (b[0] >= 240) {
			this.out({
				bytes: [...b],
				time: msg.time
			});
			return;
		}
		if (isNoteOff(b)) {
			this.release(noteKey(b), msg.time);
			return;
		}
		if (!isNoteOn(b)) {
			for (const m of this.run(msg)) this.out(m);
			return;
		}
		const input = noteKey(b);
		this.release(input, msg.time);
		const outs = [];
		for (const m of this.run(msg)) {
			if (isNoteOn(m.bytes)) {
				const k = noteKey(m.bytes);
				outs.push({
					key: k,
					time: m.time
				});
				this.holders.set(k, (this.holders.get(k) ?? 0) + 1);
			}
			this.out(m);
		}
		if (outs.length) this.held.set(input, outs);
	}
	/** End every note the chain started (no earlier than its note-on) and reset the engines. */
	panic(time) {
		for (const input of [...this.held.keys()]) this.release(input, time);
		for (const s of this.stages) s.proc?.reset?.();
	}
	/** Transport stop: the same as panic. */
	stop(time) {
		this.panic(time);
	}
};
//#endregion
export { renderChain as a, coreEngines as c, ChainStream as i, registerChainProcessor as n, EngineRegistry as o, CHAIN_FADE as r, checkEngine as s, MidiEngineChain as t };
