//#region src/dsp/vendor/goodbits/js/outputstage.js
var e = [
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
], t = [
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
function n(e, t) {
	let n = 1 - Math.exp(-2 * Math.PI * t / e), r = 0;
	return (e) => (r += n * (e - r), r);
}
function r(e, t) {
	let r = n(e, t);
	return (e) => e - r(e);
}
function i(e, t, n, r) {
	let i = 2 * Math.PI * t / e, a = Math.cos(i), o = Math.sin(i), s = 10 ** (r / 40), c = o / (2 * n), l = 1 + c / s, u = (1 + c * s) / l, d = -2 * a / l, f = (1 - c * s) / l, p = -2 * a / l, m = (1 - c / s) / l, h = 0, g = 0, _ = 0, v = 0;
	return {
		L(e) {
			let t = u * e + h;
			return h = d * e - p * t + g, g = f * e - m * t, t;
		},
		R(e) {
			let t = u * e + _;
			return _ = d * e - p * t + v, v = f * e - m * t, t;
		}
	};
}
function a(e, t, n, r = 1) {
	let i = 2 * Math.PI * t / e, a = Math.cos(i), o = Math.sin(i), s = 10 ** (n / 40), c = o / 2 * Math.sqrt((s + 1 / s) * (1 / r - 1) + 2), l = 2 * Math.sqrt(s) * c, u = s + 1 + (s - 1) * a + l, d = s * (s + 1 - (s - 1) * a + l) / u, f = 2 * s * (s - 1 - (s + 1) * a) / u, p = s * (s + 1 - (s - 1) * a - l) / u, m = -2 * (s - 1 + (s + 1) * a) / u, h = (s + 1 + (s - 1) * a - l) / u, g = 0, _ = 0, v = 0, y = 0;
	return {
		L(e) {
			let t = d * e + g;
			return g = f * e - m * t + _, _ = p * e - h * t, t;
		},
		R(e) {
			let t = d * e + v;
			return v = f * e - m * t + y, y = p * e - h * t, t;
		}
	};
}
function o(e, t = 1) {
	return Math.tanh(e * t) / Math.tanh(t);
}
function s(e) {
	let t = new Float32Array(e), n = 0;
	return {
		write(r) {
			t[n] = r, n = n + 1 >= e ? 0 : n + 1;
		},
		read(r) {
			let i = n - r;
			for (; i < 0;) i += e;
			let a = Math.floor(i), o = a + 1 >= e ? 0 : a + 1, s = i - a;
			return t[a] + s * (t[o] - t[a]);
		}
	};
}
function c(e, t, n) {
	let r = Math.exp(-1 / (.001 * t * e)), i = Math.exp(-1 / (.001 * n * e)), a = 0;
	return (e) => {
		let t = Math.abs(e), n = t > a ? r : i;
		return a = n * a + (1 - n) * t, a;
	};
}
function l(e) {
	let t = e >>> 0 || 3405649328;
	function n() {
		return t ^= t << 13, t >>>= 0, t ^= t >>> 17, t ^= t << 5, t >>>= 0, t;
	}
	return {
		white: () => (n() | 0) / 2147483648,
		uniform: () => (n() & 2147483647) / 2147483648
	};
}
var u = {
	cassette(e, t) {
		let i = r(e, 60), a = n(e, 9e3), c = n(e, 6e3), l = s(128), u = 0, d = 0, f = Math.PI * 2;
		return (n, r) => {
			l.write(.5 * (n + r)), u += f * .4 / e, d += f * 8 / e, u > f && (u -= f), d > f && (d -= f);
			let s = Math.sin(u) * 10, p = Math.sin(d) * 3, m = t.white() * .8, h = Math.max(1, 24 + s + p + m), g = l.read(h), _ = .75 * n + .25 * g, v = .75 * r + .25 * g;
			_ = i(_), v = i(v), _ = a(_), v = a(v);
			let y = c(t.white()) * .008;
			return _ += y, v += y, [o(_, 1.8), o(v, 1.8)];
		};
	},
	reelToReel(e, t) {
		let r = a(e, 80, 2, 1), i = n(e, 14e3), c = s(128), l = 0, u = Math.PI * 2;
		return (t, n) => {
			c.write(.5 * (t + n)), l += u * .25 / e, l > u && (l -= u);
			let a = Math.sin(l) * 5, s = Math.max(1, 16 + a), d = c.read(s), f = .85 * t + .15 * d, p = .85 * n + .15 * d;
			return f = r.L(f), p = r.R(p), f = i(f), p = i(p), [o(f, 1.5), o(p, 1.5)];
		};
	},
	damaged(e, t) {
		let r = n(e, 7e3), i = n(e, 4e3), a = c(e, 5, 60), o = s(160), l = 0, u = 0, d = 0, f = 0, p = Math.PI * 2;
		return (n, s) => {
			o.write(.5 * (n + s)), l += p * .6 / e, u += p * 11 / e, l > p && (l -= p), u > p && (u -= p);
			let c = Math.sin(l) * 18, m = Math.sin(u) * 6 * (.5 + .5 * Math.sin(l * 1.7)), h = t.white() * 3, g = Math.max(1, 60 + c + m + h), _ = o.read(g), v = .6 * n + .4 * _, y = .6 * s + .4 * _;
			v = r(v), y = r(y);
			let b = 1 / (1 + 4 * a(.5 * (v + y)));
			v *= b, y *= b;
			let x = i(t.white()) * .04;
			return v += x, y += x, --d <= 0 && (d = 1 + Math.floor(t.uniform() * e * 2), f = Math.floor(t.uniform() * .012 * e)), f > 0 && (v *= .25, y *= .25, f--), [v, y];
		};
	},
	vinyl(e, t) {
		let n = r(e, 30), a = i(e, 8e3, .7, 1.5), o = s(64), c = 0, l = 0, u = Math.PI * 2;
		return (r, i) => {
			o.write(.5 * (r + i)), c += u * .55 / e, c > u && (c -= u);
			let s = Math.sin(c) * 4, d = Math.max(1, 8 + s), f = o.read(d), p = .88 * r + .12 * f, m = .88 * i + .12 * f;
			p = a.L(p), m = a.R(m), p = n(p), m = n(m);
			let h = t.white() * .007;
			if (p += h, m += h, --l <= 0) {
				l = 1 + Math.floor(t.uniform() * e * .5);
				let n = .08 + .22 * t.uniform(), r = t.uniform() < .5 ? -1 : 1;
				p += n * r, m += n * r;
			}
			return [p, m];
		};
	},
	boombox(e) {
		let t = r(e, 150), a = n(e, 8e3), s = i(e, 1200, 1.2, 4);
		return (e, n) => {
			let r = t(e), i = t(n);
			r = a(r), i = a(i), r = s.L(r), i = s.R(i);
			let c = .5 * (r + i);
			return r = .7 * r + .3 * c, i = .7 * i + .3 * c, [o(r, 1.3), o(i, 1.3)];
		};
	},
	amRadio(e, t) {
		let i = r(e, 300), a = n(e, 4e3), o = n(e, 3500), s = c(e, 8, 220), l = (e) => {
			let t = .02;
			return e > t ? e - t * .5 : e < -.02 ? e + t * .5 : e * .5;
		}, u = 0, d = 0, f = 0, p = 1 - Math.exp(-1 / (.05 * e));
		return (n, r) => {
			let c = i(n), m = i(r);
			c = a(c), m = a(m), c = l(c), m = l(m);
			let h = .5 * (c + m);
			c = .3 * c + .7 * h, m = .3 * m + .7 * h;
			let g = 1 / (1 + 8 * s(h));
			--f <= 0 && (f = Math.floor(e * (.25 + t.uniform() * .55)), d = t.uniform() < .85 ? .1 + t.uniform() * .25 : .5 + t.uniform() * .5), u += p * (d - u);
			let _ = o(t.white()) * ((.0035 + .018 * u) * g);
			return c += _, m += _, [c, m];
		};
	},
	vhs(e, t) {
		let i = r(e, 50), a = n(e, 12e3), o = c(e, 3, 80), s = 0;
		return (n, r) => {
			let c = i(n), l = i(r);
			c = a(c), l = a(l);
			let u = 1 / (1 + 2.5 * o(.5 * (c + l)));
			if (c *= u, l *= u, --s <= 0) {
				s = 1 + Math.floor(t.uniform() * e * 1.8);
				let n = .02 * (t.uniform() < .5 ? -1 : 1);
				c += n, l += n;
			}
			return [c, l];
		};
	},
	busComp(e) {
		let t = c(e, 12, 180), n = 1.05;
		return (e, r) => {
			let i = t(.5 * (e + r)), a = 1 / (1 + 2 * Math.max(0, i - .25));
			return [e * a * n, r * a * n];
		};
	},
	lathe(e, t) {
		let r = i(e, 8e3, .7, 3), a = n(e, 15e3), s = 0, c = 0, l = 0, u = 0;
		return (n, i) => {
			let d = r.L(n), f = r.R(i);
			return d = a(d), f = a(f), d = o(d, 1.4), f = o(f, 1.4), --s <= 0 && (s = 1 + Math.floor(t.uniform() * e * 8), c = Math.floor(t.uniform() * .006 * e), l = d, u = f), c > 0 && (d = l, f = u, c--), [d, f];
		};
	},
	phone(e) {
		let t = r(e, 400), i = n(e, 3400), a = (e) => {
			let t = (e >= 0 ? 1 : -1) * (Math.log(1 + 32 * Math.abs(e)) / Math.log(33)), n = Math.round(t * 8) / 8;
			return (n >= 0 ? 1 : -1) * ((33 ** Math.abs(n) - 1) / 32);
		};
		return (e, n) => {
			let r = t(e), o = t(n);
			r = i(r), o = i(o), r = a(r), o = a(o);
			let s = .5 * (r + o);
			return r = .2 * r + .8 * s, o = .2 * o + .8 * s, [r, o];
		};
	}
};
function d(e) {
	switch (e) {
		case "tube": return (e, t, n) => {
			let r = .2 * n;
			return Math.tanh((e + r) * t) - Math.tanh(r * t);
		};
		case "diode": return (e, t) => Math.max(-1, Math.min(1, e * t));
		case "fuzz": return (e, t) => {
			let n = e * t;
			return n > 0 ? Math.tanh(n * 3) : Math.max(-1, Math.min(0, n));
		};
		default: return (e, t) => Math.tanh(e * t);
	}
}
//#endregion
//#region src/dsp/output/kernels.ts
var f = Math.fround, p = (e) => Math.max(0, Math.min(1, e)), m = (e, t) => typeof e == "number" && Number.isFinite(e) ? e : t, h = (e) => Math.max(1, Math.round(e * .02)), g = class {
	value;
	step = 0;
	left = 0;
	goal = 0;
	constructor(e) {
		this.value = e;
	}
	get target() {
		return this.left > 0 ? this.goal : this.value;
	}
	get steady() {
		return this.left === 0;
	}
	to(e, t) {
		(this.left !== 0 || e !== this.value) && (this.goal = e, this.left = Math.max(1, t), this.step = (e - this.value) / this.left);
	}
	next() {
		return this.left > 0 && (this.left--, this.value = this.left === 0 ? this.goal : this.value + this.step), this.value;
	}
};
function _(e, t, n) {
	let r = t.mode === "clean" ? void 0 : u[t.mode];
	if (!r) return {
		process() {},
		update: (e) => e.mode === t.mode
	};
	let i = r(e, l(n >>> 0)), a = (e) => {
		let t = p(m(e, 100) / 100);
		return t <= 1e-4 ? 0 : t;
	}, o = new g(a(t.mixPct)), s = new g(p(m(t.intensityPct, 50) / 100)), c = h(e);
	return {
		process(e, t, n) {
			if (o.steady && s.steady) {
				let r = o.value, a = s.value;
				if (r === 0) return;
				for (let o = 0; o < n; o++) {
					let n = e[o], s = t[o], [c, l] = i(n, s), u = n + (c - n) * a, d = s + (l - s) * a;
					e[o] = f(n + (u - n) * r), t[o] = f(s + (d - s) * r);
				}
			} else for (let r = 0; r < n; r++) {
				let n = o.next(), a = s.next(), c = e[r], l = t[r], [u, d] = i(c, l), p = c + (u - c) * a, m = l + (d - l) * a;
				e[r] = f(c + (p - c) * n), t[r] = f(l + (m - l) * n);
			}
		},
		update(e) {
			return e.mode === t.mode && (o.to(a(e.mixPct), c), s.to(p(m(e.intensityPct, 50) / 100), c), !0);
		}
	};
}
function v(e, t) {
	let n = d(t.type), r = new g(p(m(t.amountPct, 0) / 100)), i = h(e);
	return {
		process(e, t, i) {
			if (r.steady) {
				let a = r.value;
				if (a <= 1e-4) return;
				let o = 1 + a * 5;
				for (let r = 0; r < i; r++) e[r] = f((1 - a) * e[r] + a * n(e[r], o, a)), t[r] = f((1 - a) * t[r] + a * n(t[r], o, a));
			} else for (let a = 0; a < i; a++) {
				let i = r.next(), o = 1 + i * 5;
				e[a] = f((1 - i) * e[a] + i * n(e[a], o, i)), t[a] = f((1 - i) * t[a] + i * n(t[a], o, i));
			}
		},
		update(e) {
			return e.type === t.type && (r.to(p(m(e.amountPct, 0) / 100), i), !0);
		}
	};
}
function y(e) {
	let t = Math.max(1, Math.min(16, Math.round(m(e.bits, 16)))), n = Math.max(1, Math.min(32, Math.round(m(e.rateDivide, 1)))), r = t < 16, i = n > 1, a = (t) => t.bits === e.bits && t.rateDivide === e.rateDivide;
	if (!r && !i) return {
		process() {},
		update: a
	};
	let o = 2 / 2 ** t, s = 0, c = 0, l = 0;
	return {
		process(e, t, a) {
			for (let u = 0; u < a; u++) (!i || s % n === 0) && (c = e[u], l = t[u]), s++, e[u] = r ? f(Math.round(c / o) * o) : c, t[u] = r ? f(Math.round(l / o) * o) : l;
		},
		update: a
	};
}
function b(e, t) {
	let r = (e) => e.hz === t.hz;
	if (!(t.hz < 2e4)) return {
		process() {},
		update: r
	};
	let i = n(e, t.hz), a = n(e, t.hz);
	return {
		process(e, t, n) {
			for (let r = 0; r < n; r++) e[r] = f(i(e[r])), t[r] = f(a(t[r]));
		},
		update: r
	};
}
//#endregion
//#region src/engines/builtin.ts
var x = {
	kind: "audio",
	inputs: ["audio"],
	outputs: ["audio"],
	realtime: !0,
	offline: !0,
	latency: 0
}, S = "The Good Bits (lo-fi chain, js/outputstage.js)", C = {
	...x,
	id: "goodbits.output-stage",
	name: "Output stage",
	version: 1,
	description: "A character mode (filters, wow and flutter, noise, compression) blended by intensity and mix.",
	origin: S,
	category: "character",
	seeded: !0,
	params: [
		{
			id: "mode",
			type: "enum",
			label: "Character",
			default: "cassette",
			options: e.filter((e) => e.key !== "clean").map((e) => ({
				value: e.key,
				label: e.label,
				description: e.description
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
			smooth: !0,
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
			smooth: !0,
			description: "How strongly the mode differs from the dry signal"
		}
	],
	createKernel: (e, t, n) => _(e, {
		mode: String(t.mode),
		mixPct: Number(t.mixPct),
		intensityPct: Number(t.intensityPct)
	}, n)
}, w = {
	...x,
	id: "goodbits.drive",
	name: "Drive",
	version: 1,
	description: "Memoryless saturation: tape (soft), tube (asymmetric), diode (hard clip) or fuzz.",
	origin: S,
	category: "saturation",
	params: [{
		id: "type",
		type: "enum",
		label: "Type",
		default: "tape",
		options: t.map((e) => ({
			value: e.key,
			label: e.label,
			description: e.description
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
		smooth: !0
	}],
	createKernel: (e, t) => v(e, {
		type: String(t.type),
		amountPct: Number(t.amountPct)
	})
}, T = {
	...x,
	id: "goodbits.crunch",
	name: "Crunch",
	version: 1,
	description: "Bit-depth reduction and sample-and-hold rate reduction, with no anti-alias filter (the aliasing is the sound).",
	origin: S,
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
	createKernel: (e, t) => y({
		bits: Number(t.bits),
		rateDivide: Number(t.rateDivide)
	})
}, E = {
	...x,
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
		neutral: 2e4,
		scale: "log"
	}],
	createKernel: (e, t) => b(e, { hz: Number(t.hz) })
}, D = Object.freeze([
	C,
	w,
	T,
	E
]);
Object.freeze([
	C.id,
	w.id,
	T.id
]), e.filter((e) => e.key !== "clean");
function O() {
	return {
		bypass: !1,
		inDb: 0,
		outDb: 0,
		outputStage: {
			enabled: !1,
			mode: "cassette",
			mixPct: 100,
			intensityPct: 50
		},
		drive: {
			enabled: !1,
			type: "tape",
			amountPct: 30
		},
		crunch: {
			enabled: !1,
			bits: 12,
			rateDivide: 2
		},
		tone: {
			enabled: !1,
			hz: 8e3
		}
	};
}
var k = (e) => (t) => {
	let n = O();
	return {
		...t,
		bypass: !1,
		outputStage: {
			...n.outputStage,
			enabled: !1,
			...e.outputStage
		},
		drive: {
			...n.drive,
			enabled: !1,
			...e.drive
		},
		crunch: {
			...n.crunch,
			enabled: !1,
			...e.crunch
		},
		tone: {
			...n.tone,
			enabled: !1,
			...e.tone
		}
	};
}, A = [
	{
		key: "clean",
		label: "CLEAN",
		description: "No processing.",
		apply: () => O()
	},
	{
		key: "12bit",
		label: "12-BIT",
		description: "Crunch to 12 bits with the rate held every 2 samples, a touch of tape drive, Tone at 10 kHz.",
		apply: k({
			drive: {
				enabled: !0,
				type: "tape",
				amountPct: 15
			},
			crunch: {
				enabled: !0,
				bits: 12,
				rateDivide: 2
			},
			tone: {
				enabled: !0,
				hz: 1e4
			}
		})
	},
	{
		key: "bitcrush",
		label: "BITCRUSH",
		description: "Crunch to 8 bits, rate held every 4 samples.",
		apply: k({ crunch: {
			enabled: !0,
			bits: 8,
			rateDivide: 4
		} })
	},
	{
		key: "rate",
		label: "RATE REDUCE",
		description: "Sample-rate reduction only: every 6th sample held.",
		apply: k({ crunch: {
			enabled: !0,
			bits: 16,
			rateDivide: 6
		} })
	},
	{
		key: "drive",
		label: "DRIVE",
		description: "Tube drive at 40 %.",
		apply: k({ drive: {
			enabled: !0,
			type: "tube",
			amountPct: 40
		} })
	},
	{
		key: "cassette",
		label: "CASSETTE",
		description: "Good Bits Cassette output stage.",
		apply: k({ outputStage: {
			enabled: !0,
			mode: "cassette",
			mixPct: 100,
			intensityPct: 60
		} })
	},
	{
		key: "vinyl",
		label: "VINYL",
		description: "Good Bits Vinyl output stage.",
		apply: k({ outputStage: {
			enabled: !0,
			mode: "vinyl",
			mixPct: 100,
			intensityPct: 50
		} })
	},
	{
		key: "radio",
		label: "AM RADIO",
		description: "Good Bits AM Radio output stage.",
		apply: k({ outputStage: {
			enabled: !0,
			mode: "amRadio",
			mixPct: 100,
			intensityPct: 70
		} })
	}
];
//#endregion
//#region src/engines/params.ts
function j(e, t) {
	switch (e.type) {
		case "continuous":
		case "integer": {
			let n = typeof t == "number" && Number.isFinite(t) ? t : e.default;
			return e.type === "integer" && (n = Math.round(n)), Math.max(e.min, Math.min(e.max, n));
		}
		case "boolean": return typeof t == "boolean" ? t : e.default;
		case "enum": return typeof t == "string" && e.options.some((e) => e.value === t) ? t : e.default;
	}
}
function M(e, t) {
	let n = t && typeof t == "object" && !Array.isArray(t) ? t : {}, r = {};
	for (let t of e) r[t.id] = j(t, n[t.id]);
	return r;
}
var N = () => ({
	version: 1,
	bypass: !1,
	stages: []
}), P = (e) => !!e && typeof e == "object" && !Array.isArray(e), F = (e) => typeof e == "boolean" || typeof e == "string" || typeof e == "number" && Number.isFinite(e);
function I(e) {
	let t = 0;
	for (let n of e) {
		let e = /^s(\d+)$/.exec(n.id);
		e && (t = Math.max(t, Number(e[1])));
	}
	return `s${t + 1}`;
}
function L(e, t) {
	return R(e, (e) => t?.audio(e));
}
function R(e, t) {
	let n = P(e) ? e : {}, r = [], i = /* @__PURE__ */ new Set();
	for (let e of Array.isArray(n.stages) ? n.stages : []) {
		if (r.length >= 8) break;
		if (!P(e) || typeof e.engine != "string" || !e.engine) continue;
		let n = t(e.engine), a;
		if (n) a = M(n.params, e.params);
		else if (a = {}, P(e.params)) for (let [t, n] of Object.entries(e.params)) F(n) && (a[t] = n);
		let o = typeof e.id == "string" && e.id && !i.has(e.id) ? e.id : "";
		o ||= I([...r, ...[...i].map((e) => ({ id: e }))]), i.add(o);
		let s = {
			id: o,
			engine: e.engine,
			enabled: typeof e.enabled != "boolean" || e.enabled,
			params: a
		}, c = n ? n.version : typeof e.v == "number" ? e.v : void 0;
		c !== void 0 && (s.v = c), r.push(s);
	}
	return {
		version: 1,
		bypass: typeof n.bypass == "boolean" && n.bypass,
		stages: r
	};
}
function z(e, t) {
	return !e.bypass && e.stages.some((e) => e.enabled && (!t || !!t.audio(e.engine)));
}
function B(e, t) {
	let n = /* @__PURE__ */ new Map();
	return e.stages.map((e) => {
		let r = n.get(e.engine) ?? 0;
		return n.set(e.engine, r + 1), r === 0 ? t >>> 0 : (Math.imul((t ^ r * 2654435761) >>> 0, 2246822507) ^ r) >>> 0;
	});
}
function V(e) {
	let t = N();
	t.bypass = e.bypass;
	let n = (e, n) => t.stages.push({
		id: I(t.stages),
		engine: e.id,
		enabled: !0,
		params: M(e.params, n),
		v: e.version
	});
	return e.outputStage.enabled && n(C, { ...e.outputStage }), e.drive.enabled && n(w, { ...e.drive }), e.crunch.enabled && n(T, { ...e.crunch }), e.tone.enabled && n(E, { ...e.tone }), t;
}
Object.freeze(A.map((e) => ({
	key: e.key,
	label: e.label,
	description: e.description,
	config: V(e.apply(O()))
})));
//#endregion
//#region src/engines/constants.ts
var H = "slopfactory-output-chain", U = /^[a-z0-9][a-z0-9._-]*$/;
function W(e) {
	let t = [];
	U.test(e.id ?? "") || t.push(`invalid id "${e.id}"`), e.name || t.push("missing name"), (!Number.isInteger(e.version) || e.version < 1) && t.push("version must be a positive integer"), e.kind !== "audio" && e.kind !== "midi" && t.push(`unknown kind "${e.kind}"`), e.kind === "audio" && typeof e.createKernel != "function" && t.push("audio engines need createKernel"), e.kind === "midi" && typeof e.createProcessor != "function" && t.push("MIDI engines need createProcessor");
	let n = /* @__PURE__ */ new Set();
	for (let r of e.params ?? []) n.has(r.id) && t.push(`duplicate parameter "${r.id}"`), n.add(r.id), t.push(...G(r));
	for (let r of e.presets ?? []) for (let e of Object.keys(r.params)) n.has(e) || t.push(`preset "${r.key}" sets unknown parameter "${e}"`);
	return t;
}
function G(e) {
	let t = [];
	return (e.type === "continuous" || e.type === "integer") && !(e.min < e.max) && t.push(`parameter "${e.id}": min must be below max`), e.type === "enum" && !e.options.length && t.push(`parameter "${e.id}": no options`), e.type === "continuous" && e.scale === "log" && !(e.min > 0) && t.push(`parameter "${e.id}": a log scale needs min > 0`), j(e, e.default) !== e.default && t.push(`parameter "${e.id}": default out of range`), t;
}
var K = class e {
	defs = /* @__PURE__ */ new Map();
	constructor(e = []) {
		for (let t of e) this.register(t);
	}
	register(e) {
		let t = W(e);
		if (t.length) throw Error(`engine "${e.id}": ${t.join("; ")}`);
		if (this.defs.has(e.id)) throw Error(`engine "${e.id}" is already registered`);
		return this.defs.set(e.id, e), this;
	}
	unregister(e) {
		return this.defs.delete(e);
	}
	has(e) {
		return this.defs.has(e);
	}
	get(e) {
		return this.defs.get(e);
	}
	audio(e) {
		let t = this.defs.get(e);
		return t?.kind === "audio" ? t : void 0;
	}
	midi(e) {
		let t = this.defs.get(e);
		return t?.kind === "midi" ? t : void 0;
	}
	list(e = {}) {
		return [...this.defs.values()].filter((t) => !e.kind || t.kind === e.kind);
	}
	only(t) {
		let n = new Set(t);
		return new e(this.list().filter((e) => n.has(e.id)));
	}
}, q = (e, t) => {
	let n = Object.keys(e);
	return n.length === Object.keys(t).length && n.every((n) => e[n] === t[n]);
}, J = class {
	def;
	stage;
	sampleRate;
	seed;
	kernel = null;
	old = null;
	fadeLeft = 0;
	wet;
	constructor(e, t, n, r) {
		this.def = e, this.stage = t, this.sampleRate = n, this.seed = r, this.wet = new g(+!!t.enabled), e && t.enabled && (this.kernel = this.create());
	}
	create() {
		return this.def ? this.def.createKernel(this.sampleRate, this.stage.params, this.seed) : null;
	}
	update(e) {
		let t = this.stage;
		this.stage = e, this.def && (e.enabled && !t.enabled ? (this.wet.steady && this.wet.value === 0 && (this.kernel = this.create(), this.old = null, this.fadeLeft = 0), this.wet.to(1, 512)) : !e.enabled && t.enabled && this.wet.to(0, 512), !q(t.params, e.params) && this.kernel && (this.kernel.update?.(e.params) || (this.old || (this.old = this.kernel, this.fadeLeft = 512), this.kernel = this.create())));
	}
	process(e, t, n, r) {
		let i = this.kernel, a = this.wet;
		if (!i || a.steady && a.value === 0) return;
		let o = !a.steady || a.value !== 1;
		if (o && (r.dL.set(e.subarray(0, n)), r.dR.set(t.subarray(0, n))), this.old) {
			let { oL: a, oR: o } = r;
			a.set(e.subarray(0, n)), o.set(t.subarray(0, n)), this.old.process(a, o, n), i.process(e, t, n);
			for (let r = 0; r < n && this.fadeLeft > 0; r++, this.fadeLeft--) {
				let n = 1 - this.fadeLeft / 512;
				e[r] = a[r] + (e[r] - a[r]) * n, t[r] = o[r] + (t[r] - o[r]) * n;
			}
			this.fadeLeft <= 0 && (this.old = null);
		} else i.process(e, t, n);
		if (o) {
			let { dL: i, dR: o } = r;
			for (let r = 0; r < n; r++) {
				let n = a.next();
				e[r] = i[r] + (e[r] - i[r]) * n, t[r] = o[r] + (t[r] - o[r]) * n;
			}
		}
	}
}, Y = (e) => JSON.stringify(e.stages.map((e) => [e.id, e.engine])), X = class {
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
	constructor(e, t, n, r) {
		this.engines = e, this.sampleRate = n, this.seed = r, this.cfg = L(t, e), this.runners = this.build(), this.wet = new g(+!this.cfg.bypass);
	}
	get config() {
		return this.cfg;
	}
	get idle() {
		return !this.oldRunners && this.wet.steady && (this.wet.value === 0 || !z(this.cfg, this.engines));
	}
	build() {
		let e = B(this.cfg, this.seed);
		return this.cfg.stages.map((t, n) => new J(this.engines.audio(t.engine), t, this.sampleRate, e[n]));
	}
	set(e) {
		let t = L(e, this.engines), n = this.cfg;
		this.cfg = t, t.bypass !== n.bypass && (!t.bypass && this.wet.steady && this.wet.value === 0 && (this.runners = this.build(), this.oldRunners = null, this.fadeLeft = 0), this.wet.to(+!t.bypass, 512)), Y(t) === Y(n) ? t.stages.forEach((e, t) => this.runners[t].update(e)) : (this.oldRunners || (this.oldRunners = this.runners, this.fadeLeft = 512), this.runners = this.build());
	}
	reset() {
		this.oldRunners = null, this.fadeLeft = 0, this.wet = new g(+!this.cfg.bypass), this.runners = this.build();
	}
	grow(e) {
		this.cL.length >= e || (this.scratch = {
			dL: new Float32Array(e),
			dR: new Float32Array(e),
			oL: new Float32Array(e),
			oR: new Float32Array(e)
		}, this.cL = new Float32Array(e), this.cR = new Float32Array(e), this.xL = new Float32Array(e), this.xR = new Float32Array(e));
	}
	run(e, t, n, r) {
		for (let i of e) i.process(t, n, r, this.scratch);
	}
	process(e, t, n = e.length) {
		let r = this.wet;
		if (r.steady && r.value === 0) return;
		this.grow(n);
		let i = !r.steady || r.value !== 1;
		if (i && (this.cL.set(e.subarray(0, n)), this.cR.set(t.subarray(0, n))), this.oldRunners) {
			let { xL: r, xR: i } = this;
			r.set(e.subarray(0, n)), i.set(t.subarray(0, n)), this.run(this.oldRunners, r, i, n), this.run(this.runners, e, t, n);
			for (let a = 0; a < n && this.fadeLeft > 0; a++, this.fadeLeft--) {
				let n = 1 - this.fadeLeft / 512;
				e[a] = r[a] + (e[a] - r[a]) * n, t[a] = i[a] + (t[a] - i[a]) * n;
			}
			this.fadeLeft <= 0 && (this.oldRunners = null);
		} else this.run(this.runners, e, t, n);
		if (i) {
			let { cL: i, cR: a } = this;
			for (let o = 0; o < n; o++) {
				let n = r.next();
				e[o] = i[o] + (e[o] - i[o]) * n, t[o] = a[o] + (t[o] - a[o]) * n;
			}
		}
	}
};
//#endregion
//#region src/engines/processor.ts
function Z(e, t = H) {
	let n = new K(e);
	class r extends AudioWorkletProcessor {
		stream;
		resetAt = null;
		constructor(e) {
			super(e);
			let t = e.processorOptions ?? {};
			this.stream = new X(n, t.config ?? N(), sampleRate, (t.seed ?? 1) >>> 0), typeof t.resetAt == "number" && (this.resetAt = t.resetAt), this.port.onmessage = (e) => {
				let t = e.data;
				t.type === "config" && t.config ? this.stream.set(t.config) : t.type === "reset" && (this.resetAt = typeof t.at == "number" ? t.at : 0);
			};
		}
		process(e, t) {
			let n = t[0], r = n[0], i = n[1] ?? n[0], a = e[0] ?? [];
			return a.length > 0 ? (r.set(a[0]), i.set(a[1] ?? a[0])) : (r.fill(0), i.fill(0)), this.resetAt !== null && currentTime >= this.resetAt && (this.stream.reset(), this.resetAt = null), this.stream.process(r, i, r.length), !0;
		}
	}
	registerProcessor(t, r);
}
//#endregion
//#region src/engines/worklet.ts
Z(D);
//#endregion
