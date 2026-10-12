import { s as cleanFx, t as createOutputFxNode } from "./node-BcQT94Xh.js";
//#region src/audio/mixer.ts
/**
* Audio routing shared by live playback and offline rendering:
*
*   instrument notes -> voice input -> voice processing -> voice gain -> pan -> mute/solo gate --+
*                            \-> (dry tap: gain -> pan -> gate, for unprocessed stems)            |
*                                                                                                 v
*                                       master bus -> master processing -> master gain -> output
*
* Every voice also exposes its processed signal as a tap (post gate) for stem rendering.
* Works on any BaseAudioContext. Deliberately not a DAW mixer: no sends, no automation.
*/
var defaultStrip = () => ({
	gain: 1,
	pan: 0,
	mute: false,
	solo: false,
	fx: cleanFx()
});
/** Deterministic per-strip seed. */
var stripSeed = (seed, index) => (Math.imul((seed ^ index + 1) >>> 0, 2654435761) ^ index << 7) >>> 0;
var RAMP = .005;
var Mixer = class {
	ctx;
	strips = /* @__PURE__ */ new Map();
	masterBus;
	masterFx;
	output;
	voices;
	constructor(ctx, opts) {
		this.ctx = ctx;
		this.voices = [...opts.voices];
		const seed = opts.seed ?? 1;
		this.masterBus = ctx.createGain();
		this.masterFx = createOutputFxNode(ctx, opts.masterFx ?? cleanFx(), stripSeed(seed, 1e3), opts.fxAvailable);
		this.output = ctx.createGain();
		this.output.gain.value = opts.masterGain ?? 1;
		this.masterBus.connect(this.masterFx.node).connect(this.output);
		opts.voices.forEach((id, i) => {
			const s = {
				...defaultStrip(),
				...opts.strips?.[id]
			};
			const input = ctx.createGain();
			const fx = createOutputFxNode(ctx, s.fx, stripSeed(seed, i), opts.fxAvailable);
			const gain = ctx.createGain();
			const pan = ctx.createStereoPanner();
			const gate = ctx.createGain();
			input.connect(fx.node).connect(gain).connect(pan).connect(gate).connect(this.masterBus);
			const strip = {
				settings: s,
				input,
				fx,
				gain,
				pan,
				gate
			};
			if (opts.dryTaps) {
				const up = ctx.createGain();
				up.channelCount = 2;
				up.channelCountMode = "explicit";
				up.channelInterpretation = "speakers";
				const dg = ctx.createGain();
				const dp = ctx.createStereoPanner();
				const dgate = ctx.createGain();
				input.connect(up).connect(dg).connect(dp).connect(dgate);
				strip.dry = {
					gain: dg,
					pan: dp,
					gate: dgate
				};
			}
			this.strips.set(id, strip);
		});
		this.applyLevels(true);
	}
	strip(id) {
		const s = this.strips.get(id);
		if (!s) throw new Error(`unknown voice "${id}"`);
		return s;
	}
	/** Where an instrument playing on this voice connects. */
	input(id) {
		return this.strip(id).input;
	}
	/** The voice's processed signal after gain, pan and mute (a stem). */
	processedTap(id) {
		return this.strip(id).gate;
	}
	/** The voice's signal before processing, after gain, pan and mute (requires dryTaps). */
	dryTap(id) {
		const d = this.strip(id).dry;
		if (!d) throw new Error("dry taps were not built");
		return d.gate;
	}
	settings(id) {
		return this.strip(id).settings;
	}
	setStrip(id, patch) {
		const s = this.strip(id);
		s.settings = {
			...s.settings,
			...patch
		};
		if (patch.fx) s.fx.set(patch.fx);
		this.applyLevels(false);
	}
	setMasterFx(fx) {
		this.masterFx.set(fx);
	}
	setMasterGain(g) {
		this.ramp(this.output.gain, g, false);
	}
	/** Restart every processor's state at context time `at` (live START). */
	resetFx(at) {
		for (const s of this.strips.values()) s.fx.reset(at);
		this.masterFx.reset(at);
	}
	/** Whether output processing actually runs (false: the browser lacks AudioWorklet). */
	get processing() {
		return this.masterFx.processing;
	}
	ramp(p, v, instant) {
		if (instant) {
			p.value = v;
			return;
		}
		const t = this.ctx.currentTime;
		p.cancelScheduledValues(t);
		p.setValueAtTime(p.value, t);
		p.linearRampToValueAtTime(v, t + RAMP);
	}
	applyLevels(instant) {
		const anySolo = [...this.strips.values()].some((s) => s.settings.solo);
		for (const s of this.strips.values()) {
			const audible = anySolo ? s.settings.solo : !s.settings.mute;
			this.ramp(s.gain.gain, s.settings.gain, instant);
			this.ramp(s.pan.pan, s.settings.pan, instant);
			this.ramp(s.gate.gain, audible ? 1 : 0, instant);
			if (s.dry) {
				this.ramp(s.dry.gain.gain, s.settings.gain, instant);
				this.ramp(s.dry.pan.pan, s.settings.pan, instant);
				this.ramp(s.dry.gate.gain, audible ? 1 : 0, instant);
			}
		}
	}
	dispose() {
		for (const s of this.strips.values()) {
			s.input.disconnect();
			s.fx.dispose();
			s.gain.disconnect();
			s.pan.disconnect();
			s.gate.disconnect();
		}
		this.masterBus.disconnect();
		this.masterFx.dispose();
		this.output.disconnect();
	}
};
//#endregion
//#region src/audio/player.ts
var NotePlayer = class {
	ctx;
	mixer;
	resolve;
	held = /* @__PURE__ */ new Map();
	sounding = /* @__PURE__ */ new Map();
	maxPerVoice;
	constructor(ctx, mixer, resolve, opts = {}) {
		this.ctx = ctx;
		this.mixer = mixer;
		this.resolve = resolve;
		this.maxPerVoice = opts.maxPerVoice ?? 32;
	}
	noteOn(key, voice, note) {
		this.noteOff(key, note.time);
		const inst = this.resolve(voice, note);
		if (!inst) return false;
		const list = (this.sounding.get(voice) ?? []).filter((a) => a.handle.end > note.time);
		while (list.length >= this.maxPerVoice) list.shift().handle.stop(note.time);
		const handle = inst.start(this.ctx, this.mixer.input(voice), note);
		if (!handle) {
			this.sounding.set(voice, list);
			return false;
		}
		list.push({
			handle,
			start: note.time
		});
		this.sounding.set(voice, list);
		this.held.set(key, handle);
		return true;
	}
	noteOff(key, time) {
		const h = this.held.get(key);
		if (!h) return;
		this.held.delete(key);
		h.release(time);
	}
	/** Release every held note (one-shots ring on). */
	releaseAll(time) {
		for (const h of this.held.values()) h.release(time);
		this.held.clear();
	}
	/** Stop everything quickly, one-shots included (panic). */
	stopAll(time) {
		for (const list of this.sounding.values()) for (const a of list) a.handle.stop(time);
		this.sounding.clear();
		this.held.clear();
	}
	/** Notes still sounding at `time`, per voice. */
	activeCount(voice, time) {
		return (this.sounding.get(voice) ?? []).filter((a) => a.handle.end > time).length;
	}
};
//#endregion
export { stripSeed as i, Mixer as n, defaultStrip as r, NotePlayer as t };
