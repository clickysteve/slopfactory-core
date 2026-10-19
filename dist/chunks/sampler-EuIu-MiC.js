import { n as fadeOut, t as GainEnvelope } from "./instrument-DxW7d1F9.js";
import { i as toMono, n as findNearestZeroCrossing } from "./dsp-DLHymMUz.js";
//#region src/sampler/zone.ts
var MIN_LOOP_SECONDS = .001;
var EDGE_FADE_SECONDS = .002;
function defaultZone() {
	return {
		root: 60,
		tune: 0,
		fine: 0,
		volume: 1,
		pan: 0,
		mode: "oneshot",
		start: 0,
		end: null,
		loopStart: 0,
		loopEnd: null,
		release: .03,
		velocitySens: 1,
		mute: false
	};
}
/** Playback-rate transposition, as on a hardware sampler: length changes with pitch. */
function playbackRate(z, pitch) {
	return Math.pow(2, (pitch - z.root + z.tune + z.fine / 100) / 12);
}
/** Level for a velocity: the same 1.5-power curve for every instrument, scaled by sensitivity. */
function velocityGain(z, velocity) {
	const v = Math.max(0, Math.min(127, velocity)) / 127;
	const s = Math.max(0, Math.min(1, z.velocitySens));
	return 1 - s + s * Math.pow(v, 1.5);
}
/** The zone's playable region inside a sample of `duration` seconds, made consistent. */
function region(z, duration) {
	const d = Math.max(0, duration);
	const start = Math.max(0, Math.min(z.start, Math.max(0, d - MIN_LOOP_SECONDS)));
	let end = z.end === null ? d : Math.max(start + MIN_LOOP_SECONDS, Math.min(z.end, d));
	if (end > d) end = d;
	let loopStart = Math.max(start, Math.min(z.loopStart, end - MIN_LOOP_SECONDS));
	let loopEnd = z.loopEnd === null ? end : Math.min(z.loopEnd, end);
	if (loopEnd - loopStart < .001) {
		loopStart = start;
		loopEnd = end;
	}
	return {
		start,
		end,
		loopStart,
		loopEnd,
		trimmedStart: start > 0,
		trimmedEnd: end < d - 1e-9
	};
}
/** Human-readable problems with a zone's settings for a sample length (empty = fine). */
function zoneProblems(z, duration) {
	const out = [];
	if (z.start >= duration) out.push("START is past the end of the sample.");
	if (z.end !== null && z.end <= z.start) out.push("END must be after START.");
	if (z.mode === "loop") {
		const end = z.end ?? duration;
		const le = z.loopEnd ?? end;
		if (z.loopStart < z.start) out.push("LOOP START must not be before START.");
		if (le > end + 1e-9) out.push("LOOP END must not be after END.");
		if (le - z.loopStart < .001) out.push("The loop must be at least 1 ms long.");
	}
	return out;
}
var num = (v, lo, hi, def) => typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def;
var optNum = (v, lo, hi) => v === null || v === void 0 ? null : typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null;
function repairZone(src) {
	const d = defaultZone();
	const o = src && typeof src === "object" && !Array.isArray(src) ? src : {};
	return {
		root: Math.round(num(o.root, 0, 127, d.root)),
		tune: Math.round(num(o.tune, -48, 48, d.tune)),
		fine: num(o.fine, -100, 100, d.fine),
		volume: num(o.volume, 0, 2, d.volume),
		pan: num(o.pan, -1, 1, d.pan),
		mode: o.mode === "gated" || o.mode === "loop" ? o.mode : "oneshot",
		start: num(o.start, 0, 3600, d.start),
		end: optNum(o.end, 0, 3600),
		loopStart: num(o.loopStart, 0, 3600, d.loopStart),
		loopEnd: optNum(o.loopEnd, 0, 3600),
		release: num(o.release, .005, 5, d.release),
		velocitySens: num(o.velocitySens, 0, 1, d.velocitySens),
		mute: o.mute === true
	};
}
var NAMES = [
	"C",
	"C#",
	"D",
	"D#",
	"E",
	"F",
	"F#",
	"G",
	"G#",
	"A",
	"A#",
	"B"
];
/** MIDI note name with middle C (60) = C4. */
function noteName(n) {
	return `${NAMES[(n % 12 + 12) % 12]}${Math.floor(n / 12) - 1}`;
}
/** Parse "C4", "f#2", "Bb3" or a number; null if unreadable. */
function parseNoteName(s) {
	const m = /^\s*([A-Ga-g])([#b]?)(-?\d+)\s*$/.exec(s);
	if (m) {
		const n = [
			0,
			2,
			4,
			5,
			7,
			9,
			11
		]["CDEFGAB".indexOf(m[1].toUpperCase())] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12 * (Number(m[3]) + 1);
		return n >= 0 && n <= 127 ? n : null;
	}
	const n = Number(s);
	return Number.isInteger(n) && n >= 0 && n <= 127 ? n : null;
}
//#endregion
//#region src/sampler/instrument.ts
/**
* The sample instrument: plays one AudioBuffer through a zone, polyphonically, in any
* BaseAudioContext. One AudioBuffer is shared by every note (and by live and offline
* contexts); each note only creates a buffer source, a gain and a panner.
*/
/** Default fade when a note is stopped (stealing, panic, choke): 5 ms, linear. */
var STOP_FADE_SECONDS = .005;
var SampleInstrument = class {
	buffer;
	zone;
	constructor(buffer, zone) {
		this.buffer = buffer;
		this.zone = zone;
	}
	start(ctx, out, note) {
		const z = this.zone;
		if (z.mute || this.buffer.length === 0) return null;
		const r = region(z, this.buffer.duration);
		const rate = playbackRate(z, note.pitch);
		const t = note.time;
		const mono = this.buffer.numberOfChannels === 1;
		const peak = z.volume * velocityGain(z, note.velocity) * (mono ? Math.SQRT2 : 1);
		const src = ctx.createBufferSource();
		src.buffer = this.buffer;
		src.playbackRate.value = rate;
		const g = ctx.createGain();
		const pan = ctx.createStereoPanner();
		pan.pan.value = z.pan;
		src.connect(g).connect(pan).connect(out);
		const env = new GainEnvelope();
		const fadeIn = r.trimmedStart ? EDGE_FADE_SECONDS : 0;
		if (fadeIn) {
			g.gain.setValueAtTime(0, t);
			g.gain.linearRampToValueAtTime(peak, t + fadeIn);
			env.set(t, 0).ramp(t + fadeIn, peak);
		} else {
			g.gain.setValueAtTime(peak, t);
			env.set(t, peak);
		}
		let end;
		if (z.mode === "loop") {
			src.loop = true;
			src.loopStart = r.loopStart;
			src.loopEnd = r.loopEnd;
			src.start(t, r.start);
			end = Infinity;
		} else {
			const length = r.end - r.start;
			src.start(t, r.start, length);
			end = t + length / rate;
			if (r.trimmedEnd && length / rate > .004) {
				g.gain.setValueAtTime(peak, end - EDGE_FADE_SECONDS);
				g.gain.linearRampToValueAtTime(0, end);
				env.set(end - EDGE_FADE_SECONDS, peak).ramp(end, 0);
			}
		}
		src.onended = () => {
			src.disconnect();
			g.disconnect();
			pan.disconnect();
		};
		const handle = {
			end,
			release(time) {
				if (z.mode === "oneshot" || time >= handle.end) return;
				const stopAt = Math.max(time, t) + z.release;
				fadeOut(g.gain, Math.max(time, t), z.release, env);
				src.stop(stopAt);
				handle.end = Math.min(handle.end, stopAt);
			},
			stop(time, fade = STOP_FADE_SECONDS) {
				if (time >= handle.end) return;
				const at = Math.max(time, t);
				const f = Math.max(.001, fade);
				fadeOut(g.gain, at, f, env);
				src.stop(at + f + .001);
				handle.end = at + f + .001;
			}
		};
		return handle;
	}
};
//#endregion
//#region src/sampler/edit.ts
/** Small sample-editing helpers: zero-crossing snapping (Good Bits' search) and waveform peaks. */
/** Move a time (s) to the nearest zero crossing within `windowSeconds`, using Good Bits' search. */
function snapToZeroCrossing(audio, seconds, windowSeconds = .01) {
	const mono = toMono(audio.channels);
	const i = Math.max(0, Math.min(mono.length - 1, Math.round(seconds * audio.sampleRate)));
	return findNearestZeroCrossing(mono, i, Math.round(windowSeconds * audio.sampleRate)) / audio.sampleRate;
}
/** Peak absolute values in `bins` equal slices (for drawing a waveform). */
function waveformPeaks(audio, bins) {
	const n = audio.channels[0]?.length ?? 0;
	const out = new Array(bins).fill(0);
	if (!n) return out;
	for (let b = 0; b < bins; b++) {
		const a = Math.floor(b * n / bins);
		const e = Math.max(a + 1, Math.floor((b + 1) * n / bins));
		let p = 0;
		for (const ch of audio.channels) for (let i = a; i < e && i < n; i++) p = Math.max(p, Math.abs(ch[i]));
		out[b] = p;
	}
	return out;
}
/** Peak absolute value over all channels. */
function peakOf(channels) {
	let p = 0;
	for (const ch of channels) for (let i = 0; i < ch.length; i++) p = Math.max(p, Math.abs(ch[i]));
	return p;
}
//#endregion
export { SampleInstrument as a, noteName as c, region as d, repairZone as f, STOP_FADE_SECONDS as i, parseNoteName as l, zoneProblems as m, snapToZeroCrossing as n, MIN_LOOP_SECONDS as o, velocityGain as p, waveformPeaks as r, defaultZone as s, peakOf as t, playbackRate as u };
