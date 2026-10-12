import { t as fadeOut } from "./instrument-BOUO_zJs.js";
import { n as parseAiff, r as parseWav } from "./audio-codec-8sSSPTh6.js";
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
		const fadeIn = r.trimmedStart ? EDGE_FADE_SECONDS : 0;
		if (fadeIn) {
			g.gain.setValueAtTime(0, t);
			g.gain.linearRampToValueAtTime(peak, t + fadeIn);
		} else g.gain.setValueAtTime(peak, t);
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
				fadeOut(g.gain, Math.max(time, t), z.release, peak);
				src.stop(stopAt);
				handle.end = Math.min(handle.end, stopAt);
			},
			stop(time) {
				if (time >= handle.end) return;
				const at = Math.max(time, t);
				fadeOut(g.gain, at, .005, peak);
				src.stop(at + .006);
				handle.end = at + .006;
			}
		};
		return handle;
	}
};
//#endregion
//#region src/sampler/decode.ts
/**
* Decoding and validating user samples, entirely in the browser.
*
* PCM WAV and AIFF are read by Good Bits' own parsers (byte-exact, at the file's native sample
* rate); anything else goes to the browser's decoder (`decodeAudioData`). Every failure is a
* SampleError with a code and a message meant for the user.
*/
var SampleError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "SampleError";
	}
};
var MAX_SAMPLE_BYTES = 41943040;
var MAX_SAMPLE_SECONDS = 120;
var AUDIO_EXT = /\.(wav|wave|aif|aiff|aifc|mp3|m4a|aac|mp4|ogg|oga|opus|flac|webm|caf)$/i;
function fourcc(dv, at) {
	return at + 4 <= dv.byteLength ? String.fromCharCode(dv.getUint8(at), dv.getUint8(at + 1), dv.getUint8(at + 2), dv.getUint8(at + 3)) : "";
}
/** Decode with the browser (OfflineAudioContext at 44.1 kHz; compressed formats resample to it). */
async function browserDecode(bytes) {
	const OAC = globalThis.OfflineAudioContext;
	if (!OAC) throw new Error("this browser cannot decode audio");
	const buf = await new OAC(1, 1, 44100).decodeAudioData(bytes.slice(0));
	return {
		sampleRate: buf.sampleRate,
		channels: Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice())
	};
}
async function decodeSample(bytes, name, opts = {}) {
	const maxBytes = opts.maxBytes ?? 41943040;
	const maxSeconds = opts.maxSeconds ?? 120;
	if (bytes.byteLength === 0) throw new SampleError("empty", `"${name}" is empty.`);
	if (bytes.byteLength > maxBytes) throw new SampleError("too-large", `"${name}" is ${(bytes.byteLength / 1048576).toFixed(1)} MB; the limit is ${Math.round(maxBytes / 1048576)} MB.`);
	const dv = new DataView(bytes);
	const isWav = fourcc(dv, 0) === "RIFF" && fourcc(dv, 8) === "WAVE";
	const isAiff = fourcc(dv, 0) === "FORM" && (fourcc(dv, 8) === "AIFF" || fourcc(dv, 8) === "AIFC");
	let audio;
	if (isWav || isAiff) try {
		const b = isWav ? parseWav(bytes) : parseAiff(bytes);
		audio = {
			sampleRate: b.sampleRate,
			channels: Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i))
		};
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		const unsupported = /unsupported/i.test(msg);
		if (unsupported && opts.decode !== void 0) audio = await decodeOther(bytes, name, opts.decode);
		else throw new SampleError(unsupported ? "unsupported" : "corrupt", `"${name}" could not be read: ${msg}.`);
	}
	else {
		if (!AUDIO_EXT.test(name) && !opts.decode) throw new SampleError("unsupported", `"${name}" is not a supported audio file.`);
		audio = await decodeOther(bytes, name, opts.decode ?? browserDecode);
	}
	const warnings = [];
	if (!audio.channels.length || !audio.channels[0].length) throw new SampleError("empty", `"${name}" contains no audio.`);
	if (!(audio.sampleRate >= 3e3 && audio.sampleRate <= 768e3)) throw new SampleError("corrupt", `"${name}" has an impossible sample rate (${audio.sampleRate}).`);
	if (audio.channels.length > 2) {
		warnings.push(`"${name}" has ${audio.channels.length} channels; only the first two are used.`);
		audio = {
			sampleRate: audio.sampleRate,
			channels: audio.channels.slice(0, 2)
		};
	}
	const frames = audio.channels[0].length;
	const duration = frames / audio.sampleRate;
	if (duration > maxSeconds) throw new SampleError("too-long", `"${name}" is ${duration.toFixed(1)} s long; the limit is ${maxSeconds} s.`);
	let peak = 0;
	for (const ch of audio.channels) for (let i = 0; i < ch.length; i++) {
		const v = ch[i];
		if (!Number.isFinite(v)) throw new SampleError("corrupt", `"${name}" contains invalid sample values.`);
		const a = v < 0 ? -v : v;
		if (a > peak) peak = a;
	}
	if (peak === 0) warnings.push(`"${name}" is completely silent.`);
	return {
		...audio,
		frames,
		duration,
		warnings
	};
}
async function decodeOther(bytes, name, decode) {
	try {
		return await decode(bytes);
	} catch (e) {
		throw new SampleError("decode", `The browser could not decode "${name}" (${e instanceof Error ? e.message : "unknown format"}). Try WAV or AIFF.`);
	}
}
/** Make an AudioBuffer (context-independent, usable by live and offline contexts alike). */
function toAudioBuffer(audio) {
	const buf = new AudioBuffer({
		length: audio.channels[0].length,
		numberOfChannels: audio.channels.length,
		sampleRate: audio.sampleRate
	});
	audio.channels.forEach((c, i) => buf.copyToChannel(c, i));
	return buf;
}
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
export { repairZone as _, MAX_SAMPLE_SECONDS as a, decodeSample as c, MIN_LOOP_SECONDS as d, defaultZone as f, region as g, playbackRate as h, MAX_SAMPLE_BYTES as i, toAudioBuffer as l, parseNoteName as m, snapToZeroCrossing as n, SampleError as o, noteName as p, waveformPeaks as r, browserDecode as s, peakOf as t, SampleInstrument as u, velocityGain as v, zoneProblems as y };
