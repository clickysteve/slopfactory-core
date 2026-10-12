//#region src/dsp/vendor/goodbits/js/outputstage.js
/** Output stage character presets - order matches the UI select. "clean" is the off/bypass state. */
var OUTPUT_STAGES = [
	{
		key: "clean",
		label: "Clean",
		description: "no coloration"
	},
	{
		key: "cassette",
		label: "Cassette",
		description: "C90 wow + flutter + hiss"
	},
	{
		key: "reelToReel",
		label: "Reel-to-Reel",
		description: "slow wow, head bump, glue"
	},
	{
		key: "damaged",
		label: "Damaged",
		description: "pitch dropouts, wide flutter"
	},
	{
		key: "vinyl",
		label: "Vinyl",
		description: "surface crackle + LP wobble"
	},
	{
		key: "boombox",
		label: "Boombox",
		description: "plastic-cabinet bandpass"
	},
	{
		key: "amRadio",
		label: "AM Radio",
		description: "300 Hz-4 kHz, occasional static"
	},
	{
		key: "vhs",
		label: "VHS Hi-Fi",
		description: "AGC pumping, narrow band"
	},
	{
		key: "busComp",
		label: "Bus Comp",
		description: "2-bus glue, no noise"
	},
	{
		key: "lathe",
		label: "Lathe",
		description: "dub-plate emphasis"
	},
	{
		key: "phone",
		label: "Phone Bus",
		description: "voicemail bandpass + mu-law"
	}
];
/** Saturation drive types - order matches the UI select. */
var DRIVE_TYPES = [
	{
		key: "tape",
		label: "Tape",
		description: "soft, symmetric saturation"
	},
	{
		key: "tube",
		label: "Tube",
		description: "asymmetric, warm even harmonics"
	},
	{
		key: "diode",
		label: "Diode",
		description: "hard clip, odd harmonics"
	},
	{
		key: "fuzz",
		label: "Fuzz",
		description: "extreme, broken-speaker fuzz"
	}
];
function makeOnePoleLP(fs, fc) {
	const a = 1 - Math.exp(-2 * Math.PI * fc / fs);
	let y = 0;
	return (x) => {
		y += a * (x - y);
		return y;
	};
}
function makeOnePoleHP(fs, fc) {
	const lp = makeOnePoleLP(fs, fc);
	return (x) => x - lp(x);
}
/** RBJ cookbook peaking EQ. Returns {L, R} process functions with independent channel state. */
function makeBiquadPeak(fs, freq, Q, gainDb) {
	const w0 = 2 * Math.PI * freq / fs;
	const cosW0 = Math.cos(w0);
	const sinW0 = Math.sin(w0);
	const A = Math.pow(10, gainDb / 40);
	const alpha = sinW0 / (2 * Q);
	const a0d = 1 + alpha / A;
	const b0 = (1 + alpha * A) / a0d;
	const b1 = -2 * cosW0 / a0d;
	const b2 = (1 - alpha * A) / a0d;
	const a1 = -2 * cosW0 / a0d;
	const a2 = (1 - alpha / A) / a0d;
	let z1L = 0, z2L = 0, z1R = 0, z2R = 0;
	return {
		L(x) {
			const y = b0 * x + z1L;
			z1L = b1 * x - a1 * y + z2L;
			z2L = b2 * x - a2 * y;
			return y;
		},
		R(x) {
			const y = b0 * x + z1R;
			z1R = b1 * x - a1 * y + z2R;
			z2R = b2 * x - a2 * y;
			return y;
		}
	};
}
/** RBJ cookbook low shelf. */
function makeBiquadLowShelf(fs, freq, gainDb, slope = 1) {
	const w0 = 2 * Math.PI * freq / fs;
	const cosW0 = Math.cos(w0);
	const sinW0 = Math.sin(w0);
	const A = Math.pow(10, gainDb / 40);
	const alpha = sinW0 / 2 * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2);
	const sqrtA2alpha = 2 * Math.sqrt(A) * alpha;
	const a0d = A + 1 + (A - 1) * cosW0 + sqrtA2alpha;
	const b0 = A * (A + 1 - (A - 1) * cosW0 + sqrtA2alpha) / a0d;
	const b1 = 2 * A * (A - 1 - (A + 1) * cosW0) / a0d;
	const b2 = A * (A + 1 - (A - 1) * cosW0 - sqrtA2alpha) / a0d;
	const a1 = -2 * (A - 1 + (A + 1) * cosW0) / a0d;
	const a2 = (A + 1 + (A - 1) * cosW0 - sqrtA2alpha) / a0d;
	let z1L = 0, z2L = 0, z1R = 0, z2R = 0;
	return {
		L(x) {
			const y = b0 * x + z1L;
			z1L = b1 * x - a1 * y + z2L;
			z2L = b2 * x - a2 * y;
			return y;
		},
		R(x) {
			const y = b0 * x + z1R;
			z1R = b1 * x - a1 * y + z2R;
			z2R = b2 * x - a2 * y;
			return y;
		}
	};
}
/** Soft tanh-ish saturator with adjustable drive. */
function softSat(x, drive = 1) {
	return Math.tanh(x * drive) / Math.tanh(drive);
}
/** Short ring-buffer delay line for wow/flutter, read with linear interpolation at a fractional offset. */
function makeShortDelay(capacity) {
	const buf = new Float32Array(capacity);
	let writePos = 0;
	return {
		write(x) {
			buf[writePos] = x;
			writePos = writePos + 1 >= capacity ? 0 : writePos + 1;
		},
		read(delaySamples) {
			let pos = writePos - delaySamples;
			while (pos < 0) pos += capacity;
			const i0 = Math.floor(pos);
			const i1 = i0 + 1 >= capacity ? 0 : i0 + 1;
			const frac = pos - i0;
			return buf[i0] + frac * (buf[i1] - buf[i0]);
		}
	};
}
/** Peak-detector envelope follower with attack/release in ms. */
function makeEnvFollower(fs, attMs, relMs) {
	const aAtt = Math.exp(-1 / (.001 * attMs * fs));
	const aRel = Math.exp(-1 / (.001 * relMs * fs));
	let env = 0;
	return (x) => {
		const ax = Math.abs(x);
		const a = ax > env ? aAtt : aRel;
		env = a * env + (1 - a) * ax;
		return env;
	};
}
/**
* xorshift32 RNG, seeded per call so re-processing the same audio is reproducible within one run.
* A second, deliberately separate implementation from js/dsp/stretch/rng.js's mulberry32-based
* makeRng(): that one drives the stretch engines' {next,signed,range,int,bool} API from a
* number-or-string seed shared across a whole engine call, while this one is called per SAMPLE in
* hot loops below (wow/flutter/hiss/click generation, potentially millions of calls per file) and
* only ever needs two cheap accessors. Not merged into one implementation: since the two use
* different underlying algorithms, unifying them would silently change the exact noise sequence -
* and therefore the audible lo-fi output - for every existing seed, which isn't a change to make as
* a side effect of deduplication.
*/
function makeRng(seed) {
	let s = seed >>> 0 || 3405649328;
	function next() {
		s ^= s << 13;
		s >>>= 0;
		s ^= s >>> 17;
		s ^= s << 5;
		s >>>= 0;
		return s;
	}
	return {
		white: () => (next() | 0) / 2147483648,
		uniform: () => (next() & 2147483647) / 2147483648
	};
}
var MODE_FACTORIES = {
	cassette(fs, rng) {
		const hp60 = makeOnePoleHP(fs, 60);
		const lp9k = makeOnePoleLP(fs, 9e3);
		const hissLp = makeOnePoleLP(fs, 6e3);
		const wowDelay = makeShortDelay(128);
		let wowPhase = 0, flutterPhase = 0;
		const twoPi = Math.PI * 2;
		return (L, R) => {
			wowDelay.write(.5 * (L + R));
			wowPhase += twoPi * .4 / fs;
			flutterPhase += twoPi * 8 / fs;
			if (wowPhase > twoPi) wowPhase -= twoPi;
			if (flutterPhase > twoPi) flutterPhase -= twoPi;
			const wow = Math.sin(wowPhase) * 10;
			const flut = Math.sin(flutterPhase) * 3;
			const jit = rng.white() * .8;
			const dly = Math.max(1, 24 + wow + flut + jit);
			const wobble = wowDelay.read(dly);
			let l = .75 * L + .25 * wobble;
			let r = .75 * R + .25 * wobble;
			l = hp60(l);
			r = hp60(r);
			l = lp9k(l);
			r = lp9k(r);
			const hiss = hissLp(rng.white()) * .008;
			l += hiss;
			r += hiss;
			return [softSat(l, 1.8), softSat(r, 1.8)];
		};
	},
	reelToReel(fs, rng) {
		const shelf = makeBiquadLowShelf(fs, 80, 2, 1);
		const lp14k = makeOnePoleLP(fs, 14e3);
		const wowDelay = makeShortDelay(128);
		let wowPhase = 0;
		const twoPi = Math.PI * 2;
		return (L, R) => {
			wowDelay.write(.5 * (L + R));
			wowPhase += twoPi * .25 / fs;
			if (wowPhase > twoPi) wowPhase -= twoPi;
			const wow = Math.sin(wowPhase) * 5;
			const dly = Math.max(1, 16 + wow);
			const wobble = wowDelay.read(dly);
			let l = .85 * L + .15 * wobble;
			let r = .85 * R + .15 * wobble;
			l = shelf.L(l);
			r = shelf.R(r);
			l = lp14k(l);
			r = lp14k(r);
			return [softSat(l, 1.5), softSat(r, 1.5)];
		};
	},
	damaged(fs, rng) {
		const lp7k = makeOnePoleLP(fs, 7e3);
		const hissLp = makeOnePoleLP(fs, 4e3);
		const agc = makeEnvFollower(fs, 5, 60);
		const wowDelay = makeShortDelay(160);
		let wowPhase = 0, flutterPhase = 0, skipCountdown = 0, skipHoldSamples = 0;
		const twoPi = Math.PI * 2;
		return (L, R) => {
			wowDelay.write(.5 * (L + R));
			wowPhase += twoPi * .6 / fs;
			flutterPhase += twoPi * 11 / fs;
			if (wowPhase > twoPi) wowPhase -= twoPi;
			if (flutterPhase > twoPi) flutterPhase -= twoPi;
			const wow = Math.sin(wowPhase) * 18;
			const flut = Math.sin(flutterPhase) * 6 * (.5 + .5 * Math.sin(wowPhase * 1.7));
			const jit = rng.white() * 3;
			const dly = Math.max(1, 60 + wow + flut + jit);
			const wobble = wowDelay.read(dly);
			let l = .6 * L + .4 * wobble;
			let r = .6 * R + .4 * wobble;
			l = lp7k(l);
			r = lp7k(r);
			const duck = 1 / (1 + 4 * agc(.5 * (l + r)));
			l *= duck;
			r *= duck;
			const hiss = hissLp(rng.white()) * .04;
			l += hiss;
			r += hiss;
			if (--skipCountdown <= 0) {
				skipCountdown = 1 + Math.floor(rng.uniform() * fs * 2);
				skipHoldSamples = Math.floor(rng.uniform() * .012 * fs);
			}
			if (skipHoldSamples > 0) {
				l *= .25;
				r *= .25;
				skipHoldSamples--;
			}
			return [l, r];
		};
	},
	vinyl(fs, rng) {
		const riaaHp = makeOnePoleHP(fs, 30);
		const tilt = makeBiquadPeak(fs, 8e3, .7, 1.5);
		const wowDelay = makeShortDelay(64);
		let vinylPhase = 0, clickCountdown = 0;
		const twoPi = Math.PI * 2;
		return (L, R) => {
			wowDelay.write(.5 * (L + R));
			vinylPhase += twoPi * .55 / fs;
			if (vinylPhase > twoPi) vinylPhase -= twoPi;
			const wow = Math.sin(vinylPhase) * 4;
			const dly = Math.max(1, 8 + wow);
			const wobble = wowDelay.read(dly);
			let l = .88 * L + .12 * wobble;
			let r = .88 * R + .12 * wobble;
			l = tilt.L(l);
			r = tilt.R(r);
			l = riaaHp(l);
			r = riaaHp(r);
			const surface = rng.white() * .007;
			l += surface;
			r += surface;
			if (--clickCountdown <= 0) {
				clickCountdown = 1 + Math.floor(rng.uniform() * fs * .5);
				const popAmp = .08 + .22 * rng.uniform();
				const popSign = rng.uniform() < .5 ? -1 : 1;
				l += popAmp * popSign;
				r += popAmp * popSign;
			}
			return [l, r];
		};
	},
	boombox(fs) {
		const hp150 = makeOnePoleHP(fs, 150);
		const lp8k = makeOnePoleLP(fs, 8e3);
		const honk = makeBiquadPeak(fs, 1200, 1.2, 4);
		return (L, R) => {
			let l = hp150(L);
			let r = hp150(R);
			l = lp8k(l);
			r = lp8k(r);
			l = honk.L(l);
			r = honk.R(r);
			const mono = .5 * (l + r);
			l = .7 * l + .3 * mono;
			r = .7 * r + .3 * mono;
			return [softSat(l, 1.3), softSat(r, 1.3)];
		};
	},
	amRadio(fs, rng) {
		const hp300 = makeOnePoleHP(fs, 300);
		const lp4k = makeOnePoleLP(fs, 4e3);
		const hissLp = makeOnePoleLP(fs, 3500);
		const progEnv = makeEnvFollower(fs, 8, 220);
		const kink = (x) => {
			const t = .02;
			if (x > t) return x - t * .5;
			if (x < -.02) return x + t * .5;
			return x * .5;
		};
		let washEnv = 0, washTarget = 0, washHold = 0;
		const washA = 1 - Math.exp(-1 / (.05 * fs));
		return (L, R) => {
			let l = hp300(L);
			let r = hp300(R);
			l = lp4k(l);
			r = lp4k(r);
			l = kink(l);
			r = kink(r);
			const mono = .5 * (l + r);
			l = .3 * l + .7 * mono;
			r = .3 * r + .7 * mono;
			const duck = 1 / (1 + 8 * progEnv(mono));
			if (--washHold <= 0) {
				washHold = Math.floor(fs * (.25 + rng.uniform() * .55));
				washTarget = rng.uniform() < .85 ? .1 + rng.uniform() * .25 : .5 + rng.uniform() * .5;
			}
			washEnv += washA * (washTarget - washEnv);
			const hiss = hissLp(rng.white()) * ((.0035 + .018 * washEnv) * duck);
			l += hiss;
			r += hiss;
			return [l, r];
		};
	},
	vhs(fs, rng) {
		const hp50 = makeOnePoleHP(fs, 50);
		const lp12k = makeOnePoleLP(fs, 12e3);
		const agc = makeEnvFollower(fs, 3, 80);
		let clickCountdown = 0;
		return (L, R) => {
			let l = hp50(L);
			let r = hp50(R);
			l = lp12k(l);
			r = lp12k(r);
			const duck = 1 / (1 + 2.5 * agc(.5 * (l + r)));
			l *= duck;
			r *= duck;
			if (--clickCountdown <= 0) {
				clickCountdown = 1 + Math.floor(rng.uniform() * fs * 1.8);
				const tick = .02 * (rng.uniform() < .5 ? -1 : 1);
				l += tick;
				r += tick;
			}
			return [l, r];
		};
	},
	busComp(fs) {
		const agc = makeEnvFollower(fs, 12, 180);
		const thr = .25;
		const make = 1.05;
		return (L, R) => {
			const env = agc(.5 * (L + R));
			const gr = 1 / (1 + 2 * Math.max(0, env - thr));
			return [L * gr * make, R * gr * make];
		};
	},
	lathe(fs, rng) {
		const boost = makeBiquadPeak(fs, 8e3, .7, 3);
		const lp15k = makeOnePoleLP(fs, 15e3);
		let skipCountdown = 0, skipHoldSamples = 0, skipHoldL = 0, skipHoldR = 0;
		return (L, R) => {
			let l = boost.L(L);
			let r = boost.R(R);
			l = lp15k(l);
			r = lp15k(r);
			l = softSat(l, 1.4);
			r = softSat(r, 1.4);
			if (--skipCountdown <= 0) {
				skipCountdown = 1 + Math.floor(rng.uniform() * fs * 8);
				skipHoldSamples = Math.floor(rng.uniform() * .006 * fs);
				skipHoldL = l;
				skipHoldR = r;
			}
			if (skipHoldSamples > 0) {
				l = skipHoldL;
				r = skipHoldR;
				skipHoldSamples--;
			}
			return [l, r];
		};
	},
	phone(fs) {
		const hp400 = makeOnePoleHP(fs, 400);
		const lp3k4 = makeOnePoleLP(fs, 3400);
		const mulawQuant = (x) => {
			const mu = 32;
			const c = (x >= 0 ? 1 : -1) * (Math.log(1 + mu * Math.abs(x)) / Math.log(33));
			const q = Math.round(c * 8) / 8;
			return (q >= 0 ? 1 : -1) * ((Math.pow(33, Math.abs(q)) - 1) / mu);
		};
		return (L, R) => {
			let l = hp400(L);
			let r = hp400(R);
			l = lp3k4(l);
			r = lp3k4(r);
			l = mulawQuant(l);
			r = mulawQuant(r);
			const mono = .5 * (l + r);
			l = .2 * l + .8 * mono;
			r = .2 * r + .8 * mono;
			return [l, r];
		};
	}
};
function driveShapeFor(key) {
	switch (key) {
		case "tube": return (x, g, d) => {
			const bias = .2 * d;
			return Math.tanh((x + bias) * g) - Math.tanh(bias * g);
		};
		case "diode": return (x, g) => Math.max(-1, Math.min(1, x * g));
		case "fuzz": return (x, g) => {
			const v = x * g;
			return v > 0 ? Math.tanh(v * 3) : Math.max(-1, Math.min(0, v));
		};
		default: return (x, g) => Math.tanh(x * g);
	}
}
//#endregion
//#region src/dsp/output/settings.ts
/**
* Output-processor settings: what a voice or master processor does to audio as it plays.
*
* The stage layout is Good Bits' lo-fi chain (`applyLofiChain`: output stage, then drive, then
* crunch) with the same field names, plus an input and output gain and an optional Tone stage
* (Good Bits' one-pole low-pass). Plain JSON, safe to store in any application's project file.
*/
var OUTPUT_STAGE_MODES = OUTPUT_STAGES.filter((s) => s.key !== "clean");
function cleanFx() {
	return {
		bypass: false,
		inDb: 0,
		outDb: 0,
		outputStage: {
			enabled: false,
			mode: "cassette",
			mixPct: 100,
			intensityPct: 50
		},
		drive: {
			enabled: false,
			type: "tape",
			amountPct: 30
		},
		crunch: {
			enabled: false,
			bits: 12,
			rateDivide: 2
		},
		tone: {
			enabled: false,
			hz: 8e3
		}
	};
}
/** True when the processor leaves audio exactly as it is. */
function isClean(s) {
	return s.bypass || !s.outputStage.enabled && !s.drive.enabled && !s.crunch.enabled && !s.tone.enabled && s.inDb === 0 && s.outDb === 0;
}
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var num = (v, lo, hi, def, int = false) => {
	let x = typeof v === "number" && Number.isFinite(v) ? v : def;
	if (int) x = Math.round(x);
	return Math.max(lo, Math.min(hi, x));
};
var bool = (v, def) => typeof v === "boolean" ? v : def;
/** Validate stored settings, filling anything missing or out of range from the CLEAN defaults. */
function repairFx(src) {
	const d = cleanFx();
	const o = isObj(src) ? src : {};
	const os = isObj(o.outputStage) ? o.outputStage : {};
	const dr = isObj(o.drive) ? o.drive : {};
	const cr = isObj(o.crunch) ? o.crunch : {};
	const to = isObj(o.tone) ? o.tone : {};
	const modes = OUTPUT_STAGE_MODES.map((m) => m.key);
	const drives = DRIVE_TYPES.map((m) => m.key);
	return {
		bypass: bool(o.bypass, d.bypass),
		inDb: num(o.inDb, -24, 24, d.inDb),
		outDb: num(o.outDb, -24, 24, d.outDb),
		outputStage: {
			enabled: bool(os.enabled, false),
			mode: typeof os.mode === "string" && modes.includes(os.mode) ? os.mode : d.outputStage.mode,
			mixPct: num(os.mixPct, 0, 100, d.outputStage.mixPct),
			intensityPct: num(os.intensityPct, 0, 100, d.outputStage.intensityPct)
		},
		drive: {
			enabled: bool(dr.enabled, false),
			type: typeof dr.type === "string" && drives.includes(dr.type) ? dr.type : d.drive.type,
			amountPct: num(dr.amountPct, 0, 100, d.drive.amountPct)
		},
		crunch: {
			enabled: bool(cr.enabled, false),
			bits: num(cr.bits, 1, 16, d.crunch.bits, true),
			rateDivide: num(cr.rateDivide, 1, 32, d.crunch.rateDivide, true)
		},
		tone: {
			enabled: bool(to.enabled, false),
			hz: num(to.hz, 200, 2e4, d.tone.hz)
		}
	};
}
//#endregion
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
var clamp01 = (x) => Math.max(0, Math.min(1, x));
var dbToGain = (db) => db === 0 ? 1 : Math.pow(10, db / 20);
/** Build the chain for one set of settings. Its state (filters, noise, hold counter) starts fresh. */
function createChain(s, sampleRate, seed) {
	if (isClean(s)) return () => {};
	const inG = dbToGain(s.inDb);
	const outG = dbToGain(s.outDb);
	const mix = clamp01((s.outputStage.mixPct ?? 100) / 100);
	const factory = MODE_FACTORIES[s.outputStage.mode];
	const stage = s.outputStage.enabled && mix > 1e-4 && s.outputStage.mode !== "clean" && factory ? factory(sampleRate, makeRng(seed)) : null;
	const intensity = clamp01((s.outputStage.intensityPct ?? 50) / 100);
	const d = s.drive.enabled ? clamp01((s.drive.amountPct ?? 0) / 100) : 0;
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
//#endregion
//#region src/dsp/output/constants.ts
/** The AudioWorklet processor name registered by worklet.ts. */
var OUTPUT_FX_PROCESSOR = "slopfactory-output-fx";
//#endregion
//#region src/dsp/output/worklet.ts
/**
* AudioWorklet processor for output processing. It only moves blocks in and out of the shared
* OutputFxStream, so live playback (AudioContext) and offline rendering (OfflineAudioContext)
* run exactly the same DSP code.
*
* Messages: { type: 'settings', settings } changes settings (crossfaded);
*           { type: 'reset', at } restarts processor state at context time `at` (seconds).
*/
var OutputFxProcessor = class extends AudioWorkletProcessor {
	stream;
	resetAt = null;
	constructor(options) {
		super(options);
		const po = options.processorOptions ?? {};
		this.stream = new OutputFxStream(repairFx(po.settings), sampleRate, (po.seed ?? 1) >>> 0);
		this.port.onmessage = (e) => {
			const m = e.data;
			if (m.type === "settings") this.stream.set(repairFx(m.settings));
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
};
registerProcessor(OUTPUT_FX_PROCESSOR, OutputFxProcessor);
//#endregion
