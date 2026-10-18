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
function clamp01$1(x) {
	return Math.max(0, Math.min(1, x));
}
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
/** amountPct 0-100. 0 is a no-op copy. */
function applyDrive(channels, driveKey, amountPct = 0) {
	const d = clamp01$1((amountPct ?? 0) / 100);
	if (d <= 1e-4) return channels.map((ch) => Float32Array.from(ch));
	const g = 1 + d * 5;
	const shape = driveShapeFor(driveKey);
	return channels.map((ch) => {
		const out = new Float32Array(ch.length);
		for (let i = 0; i < ch.length; i++) {
			const x = ch[i];
			out[i] = (1 - d) * x + d * shape(x, g, d);
		}
		return out;
	});
}
/** bits: 1-16 (16 = no reduction). rateDivide: 1-32 (1 = no reduction). Both are no-ops at their max. */
function applyCrunch(channels, { bits = 16, rateDivide = 1 } = {}) {
	const bitsClamped = Math.max(1, Math.min(16, Math.round(bits ?? 16)));
	const rateClamped = Math.max(1, Math.min(32, Math.round(rateDivide ?? 1)));
	const hasBits = bitsClamped < 16;
	const hasRate = rateClamped > 1;
	if (!hasBits && !hasRate) return channels.map((ch) => Float32Array.from(ch));
	const step = 2 / Math.pow(2, bitsClamped);
	return channels.map((ch) => {
		const out = new Float32Array(ch.length);
		let held = 0;
		for (let i = 0; i < ch.length; i++) {
			if (!hasRate || i % rateClamped === 0) held = ch[i];
			out[i] = hasBits ? Math.round(held / step) * step : held;
		}
		return out;
	});
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
var DRIVE_SHAPES = DRIVE_TYPES;
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
var withStages = (patch) => (b) => {
	const c = cleanFx();
	return {
		...b,
		bypass: false,
		outputStage: {
			...c.outputStage,
			enabled: false,
			...patch.outputStage
		},
		drive: {
			...c.drive,
			enabled: false,
			...patch.drive
		},
		crunch: {
			...c.crunch,
			enabled: false,
			...patch.crunch
		},
		tone: {
			...c.tone,
			enabled: false,
			...patch.tone
		}
	};
};
var FX_PRESETS = [
	{
		key: "clean",
		label: "CLEAN",
		description: "No processing.",
		apply: () => cleanFx()
	},
	{
		key: "12bit",
		label: "12-BIT",
		description: "Crunch to 12 bits with the rate held every 2 samples, a touch of tape drive, Tone at 10 kHz.",
		apply: withStages({
			drive: {
				enabled: true,
				type: "tape",
				amountPct: 15
			},
			crunch: {
				enabled: true,
				bits: 12,
				rateDivide: 2
			},
			tone: {
				enabled: true,
				hz: 1e4
			}
		})
	},
	{
		key: "bitcrush",
		label: "BITCRUSH",
		description: "Crunch to 8 bits, rate held every 4 samples.",
		apply: withStages({ crunch: {
			enabled: true,
			bits: 8,
			rateDivide: 4
		} })
	},
	{
		key: "rate",
		label: "RATE REDUCE",
		description: "Sample-rate reduction only: every 6th sample held.",
		apply: withStages({ crunch: {
			enabled: true,
			bits: 16,
			rateDivide: 6
		} })
	},
	{
		key: "drive",
		label: "DRIVE",
		description: "Tube drive at 40 %.",
		apply: withStages({ drive: {
			enabled: true,
			type: "tube",
			amountPct: 40
		} })
	},
	{
		key: "cassette",
		label: "CASSETTE",
		description: "Good Bits Cassette output stage.",
		apply: withStages({ outputStage: {
			enabled: true,
			mode: "cassette",
			mixPct: 100,
			intensityPct: 60
		} })
	},
	{
		key: "vinyl",
		label: "VINYL",
		description: "Good Bits Vinyl output stage.",
		apply: withStages({ outputStage: {
			enabled: true,
			mode: "vinyl",
			mixPct: 100,
			intensityPct: 50
		} })
	},
	{
		key: "radio",
		label: "AM RADIO",
		description: "Good Bits AM Radio output stage.",
		apply: withStages({ outputStage: {
			enabled: true,
			mode: "amRadio",
			mixPct: 100,
			intensityPct: 70
		} })
	}
];
/** Which preset (if any) the settings currently match, for display. */
function matchPreset(s) {
	const key = (x) => JSON.stringify({
		...x,
		bypass: false
	});
	for (const p of FX_PRESETS) if (key(p.apply(s)) === key(s)) return p.key;
	return null;
}
/** A short status label, e.g. "CLEAN", "12-BIT", "CRUNCH+DRIVE", "BYPASS". */
function fxLabel(s) {
	if (s.bypass) return "BYPASS";
	const m = matchPreset(s);
	if (m) return FX_PRESETS.find((p) => p.key === m).label;
	const parts = [];
	if (s.outputStage.enabled) parts.push(OUTPUT_STAGES.find((x) => x.key === s.outputStage.mode)?.label.toUpperCase() ?? "STAGE");
	if (s.drive.enabled) parts.push("DRIVE");
	if (s.crunch.enabled) parts.push(`${s.crunch.bits}BIT${s.crunch.rateDivide > 1 ? `/${s.crunch.rateDivide}` : ""}`);
	if (s.tone.enabled) parts.push("TONE");
	return parts.length ? parts.join("+") : s.inDb || s.outDb ? "GAIN" : "CLEAN";
}
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var num$1 = (v, lo, hi, def, int = false) => {
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
		inDb: num$1(o.inDb, -24, 24, d.inDb),
		outDb: num$1(o.outDb, -24, 24, d.outDb),
		outputStage: {
			enabled: bool(os.enabled, false),
			mode: typeof os.mode === "string" && modes.includes(os.mode) ? os.mode : d.outputStage.mode,
			mixPct: num$1(os.mixPct, 0, 100, d.outputStage.mixPct),
			intensityPct: num$1(os.intensityPct, 0, 100, d.outputStage.intensityPct)
		},
		drive: {
			enabled: bool(dr.enabled, false),
			type: typeof dr.type === "string" && drives.includes(dr.type) ? dr.type : d.drive.type,
			amountPct: num$1(dr.amountPct, 0, 100, d.drive.amountPct)
		},
		crunch: {
			enabled: bool(cr.enabled, false),
			bits: num$1(cr.bits, 1, 16, d.crunch.bits, true),
			rateDivide: num$1(cr.rateDivide, 1, 32, d.crunch.rateDivide, true)
		},
		tone: {
			enabled: bool(to.enabled, false),
			hz: num$1(to.hz, 200, 2e4, d.tone.hz)
		}
	};
}
//#endregion
//#region src/dsp/output/kernels.ts
/**
* Block kernels for the Good Bits lo-fi stages: one stage each, processing a stereo block in
* place. These are the only implementation of the stages in Core: the combined output
* processor (`createChain` in stream.ts) and the output-engine plugins (`../../engines`) are
* both built from them, live (AudioWorklet), offline (OfflineAudioContext) and over plain
* buffers.
*
* Every kernel calls the vendored Good Bits code (`MODE_FACTORIES`, `driveShapeFor`,
* `makeOnePoleLP`) or repeats its arithmetic exactly (crunch, mix/intensity), and rounds to
* 32-bit float on output as Good Bits' whole-buffer functions do when they write a stage into a
* Float32Array. With steady parameters the output is bit-identical to `applyOutputStage`,
* `applyDrive` and `applyCrunch` on the same input and seed, whatever the block size.
*
* `update()` changes parameters in place where that can be done smoothly (a short linear ramp
* on mix, intensity and drive amount) and returns false where it cannot (a different mode,
* shape, bit depth, rate or cutoff), in which case the caller builds a new kernel and
* crossfades to it.
*/
var f32 = Math.fround;
var clamp01 = (x) => Math.max(0, Math.min(1, x));
var num = (v, def) => typeof v === "number" && Number.isFinite(v) ? v : def;
/** Length of an in-place parameter ramp, in samples (20 ms). */
var rampFrames = (sampleRate) => Math.max(1, Math.round(sampleRate * .02));
/** A value that moves linearly to its target over a number of samples and then holds it exactly. */
var Ramp = class {
	value;
	step = 0;
	left = 0;
	goal = 0;
	constructor(value) {
		this.value = value;
	}
	get target() {
		return this.left > 0 ? this.goal : this.value;
	}
	get steady() {
		return this.left === 0;
	}
	to(target, frames) {
		if (this.left === 0 && target === this.value) return;
		this.goal = target;
		this.left = Math.max(1, frames);
		this.step = (target - this.value) / this.left;
	}
	next() {
		if (this.left > 0) {
			this.left--;
			this.value = this.left === 0 ? this.goal : this.value + this.step;
		}
		return this.value;
	}
};
/** Good Bits output stage (applyOutputStage): a character mode, intensity, then mix. */
function outputStageKernel(sampleRate, p, seed) {
	const factory = p.mode !== "clean" ? MODE_FACTORIES[p.mode] : void 0;
	if (!factory) return {
		process() {},
		update: (q) => q.mode === p.mode
	};
	const stage = factory(sampleRate, makeRng(seed >>> 0));
	const mixOf = (pct) => {
		const m = clamp01(num(pct, 100) / 100);
		return m <= 1e-4 ? 0 : m;
	};
	const mix = new Ramp(mixOf(p.mixPct));
	const intensity = new Ramp(clamp01(num(p.intensityPct, 50) / 100));
	const frames = rampFrames(sampleRate);
	return {
		process(L, R, n) {
			if (mix.steady && intensity.steady) {
				const m = mix.value;
				const t = intensity.value;
				if (m === 0) return;
				for (let k = 0; k < n; k++) {
					const l = L[k];
					const r = R[k];
					const [rawL, rawR] = stage(l, r);
					const wetL = l + (rawL - l) * t;
					const wetR = r + (rawR - r) * t;
					L[k] = f32(l + (wetL - l) * m);
					R[k] = f32(r + (wetR - r) * m);
				}
				return;
			}
			for (let k = 0; k < n; k++) {
				const m = mix.next();
				const t = intensity.next();
				const l = L[k];
				const r = R[k];
				const [rawL, rawR] = stage(l, r);
				const wetL = l + (rawL - l) * t;
				const wetR = r + (rawR - r) * t;
				L[k] = f32(l + (wetL - l) * m);
				R[k] = f32(r + (wetR - r) * m);
			}
		},
		update(q) {
			if (q.mode !== p.mode) return false;
			mix.to(mixOf(q.mixPct), frames);
			intensity.to(clamp01(num(q.intensityPct, 50) / 100), frames);
			return true;
		}
	};
}
/** Good Bits drive (applyDrive): out = (1 - d) x + d shape(x, 1 + 5d, d). */
function driveKernel(sampleRate, p) {
	const shape = driveShapeFor(p.type);
	const amount = new Ramp(clamp01(num(p.amountPct, 0) / 100));
	const frames = rampFrames(sampleRate);
	return {
		process(L, R, n) {
			if (amount.steady) {
				const d = amount.value;
				if (d <= 1e-4) return;
				const g = 1 + d * 5;
				for (let k = 0; k < n; k++) {
					L[k] = f32((1 - d) * L[k] + d * shape(L[k], g, d));
					R[k] = f32((1 - d) * R[k] + d * shape(R[k], g, d));
				}
				return;
			}
			for (let k = 0; k < n; k++) {
				const d = amount.next();
				const g = 1 + d * 5;
				L[k] = f32((1 - d) * L[k] + d * shape(L[k], g, d));
				R[k] = f32((1 - d) * R[k] + d * shape(R[k], g, d));
			}
		},
		update(q) {
			if (q.type !== p.type) return false;
			amount.to(clamp01(num(q.amountPct, 0) / 100), frames);
			return true;
		}
	};
}
/** Good Bits crunch (applyCrunch): every n-th sample held n samples, then quantised. */
function crunchKernel(p) {
	const bits = Math.max(1, Math.min(16, Math.round(num(p.bits, 16))));
	const rate = Math.max(1, Math.min(32, Math.round(num(p.rateDivide, 1))));
	const hasBits = bits < 16;
	const hasRate = rate > 1;
	const same = (q) => q.bits === p.bits && q.rateDivide === p.rateDivide;
	if (!hasBits && !hasRate) return {
		process() {},
		update: same
	};
	const step = 2 / Math.pow(2, bits);
	let index = 0;
	let heldL = 0;
	let heldR = 0;
	return {
		process(L, R, n) {
			for (let k = 0; k < n; k++) {
				if (!hasRate || index % rate === 0) {
					heldL = L[k];
					heldR = R[k];
				}
				index++;
				L[k] = hasBits ? f32(Math.round(heldL / step) * step) : heldL;
				R[k] = hasBits ? f32(Math.round(heldR / step) * step) : heldR;
			}
		},
		update: same
	};
}
/** Tone: Good Bits' one-pole low-pass (makeOnePoleLP) per channel. 20 kHz and above = off. */
function toneKernel(sampleRate, p) {
	const same = (q) => q.hz === p.hz;
	if (!(p.hz < 2e4)) return {
		process() {},
		update: same
	};
	const lpL = makeOnePoleLP(sampleRate, p.hz);
	const lpR = makeOnePoleLP(sampleRate, p.hz);
	return {
		process(L, R, n) {
			for (let k = 0; k < n; k++) {
				L[k] = f32(lpL(L[k]));
				R[k] = f32(lpR(R[k]));
			}
		},
		update: same
	};
}
/** A fixed gain (the combined processor's IN and OUT dB). */
function gainKernel(gain) {
	return { process(L, R, n) {
		if (gain === 1) return;
		for (let k = 0; k < n; k++) {
			L[k] = L[k] * gain;
			R[k] = R[k] * gain;
		}
	} };
}
//#endregion
export { applyCrunch as _, outputStageKernel as a, FX_PRESETS as c, fxLabel as d, isClean as f, OUTPUT_STAGES as g, DRIVE_TYPES as h, gainKernel as i, OUTPUT_STAGE_MODES as l, repairFx as m, crunchKernel as n, toneKernel as o, matchPreset as p, driveKernel as r, DRIVE_SHAPES as s, Ramp as t, cleanFx as u, applyDrive as v };
