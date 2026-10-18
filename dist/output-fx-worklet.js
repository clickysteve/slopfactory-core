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
//#region src/dsp/output/settings.ts
var f = e.filter((e) => e.key !== "clean");
function p() {
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
function m(e) {
	return e.bypass || !e.outputStage.enabled && !e.drive.enabled && !e.crunch.enabled && !e.tone.enabled && e.inDb === 0 && e.outDb === 0;
}
var h = (e) => !!e && typeof e == "object" && !Array.isArray(e), g = (e, t, n, r, i = !1) => {
	let a = typeof e == "number" && Number.isFinite(e) ? e : r;
	return i && (a = Math.round(a)), Math.max(t, Math.min(n, a));
}, _ = (e, t) => typeof e == "boolean" ? e : t;
function v(e) {
	let n = p(), r = h(e) ? e : {}, i = h(r.outputStage) ? r.outputStage : {}, a = h(r.drive) ? r.drive : {}, o = h(r.crunch) ? r.crunch : {}, s = h(r.tone) ? r.tone : {}, c = f.map((e) => e.key), l = t.map((e) => e.key);
	return {
		bypass: _(r.bypass, n.bypass),
		inDb: g(r.inDb, -24, 24, n.inDb),
		outDb: g(r.outDb, -24, 24, n.outDb),
		outputStage: {
			enabled: _(i.enabled, !1),
			mode: typeof i.mode == "string" && c.includes(i.mode) ? i.mode : n.outputStage.mode,
			mixPct: g(i.mixPct, 0, 100, n.outputStage.mixPct),
			intensityPct: g(i.intensityPct, 0, 100, n.outputStage.intensityPct)
		},
		drive: {
			enabled: _(a.enabled, !1),
			type: typeof a.type == "string" && l.includes(a.type) ? a.type : n.drive.type,
			amountPct: g(a.amountPct, 0, 100, n.drive.amountPct)
		},
		crunch: {
			enabled: _(o.enabled, !1),
			bits: g(o.bits, 1, 16, n.crunch.bits, !0),
			rateDivide: g(o.rateDivide, 1, 32, n.crunch.rateDivide, !0)
		},
		tone: {
			enabled: _(s.enabled, !1),
			hz: g(s.hz, 200, 2e4, n.tone.hz)
		}
	};
}
//#endregion
//#region src/dsp/output/kernels.ts
var y = Math.fround, b = (e) => Math.max(0, Math.min(1, e)), x = (e, t) => typeof e == "number" && Number.isFinite(e) ? e : t, S = (e) => Math.max(1, Math.round(e * .02)), C = class {
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
function w(e, t, n) {
	let r = t.mode === "clean" ? void 0 : u[t.mode];
	if (!r) return {
		process() {},
		update: (e) => e.mode === t.mode
	};
	let i = r(e, l(n >>> 0)), a = (e) => {
		let t = b(x(e, 100) / 100);
		return t <= 1e-4 ? 0 : t;
	}, o = new C(a(t.mixPct)), s = new C(b(x(t.intensityPct, 50) / 100)), c = S(e);
	return {
		process(e, t, n) {
			if (o.steady && s.steady) {
				let r = o.value, a = s.value;
				if (r === 0) return;
				for (let o = 0; o < n; o++) {
					let n = e[o], s = t[o], [c, l] = i(n, s), u = n + (c - n) * a, d = s + (l - s) * a;
					e[o] = y(n + (u - n) * r), t[o] = y(s + (d - s) * r);
				}
			} else for (let r = 0; r < n; r++) {
				let n = o.next(), a = s.next(), c = e[r], l = t[r], [u, d] = i(c, l), f = c + (u - c) * a, p = l + (d - l) * a;
				e[r] = y(c + (f - c) * n), t[r] = y(l + (p - l) * n);
			}
		},
		update(e) {
			return e.mode === t.mode && (o.to(a(e.mixPct), c), s.to(b(x(e.intensityPct, 50) / 100), c), !0);
		}
	};
}
function T(e, t) {
	let n = d(t.type), r = new C(b(x(t.amountPct, 0) / 100)), i = S(e);
	return {
		process(e, t, i) {
			if (r.steady) {
				let a = r.value;
				if (a <= 1e-4) return;
				let o = 1 + a * 5;
				for (let r = 0; r < i; r++) e[r] = y((1 - a) * e[r] + a * n(e[r], o, a)), t[r] = y((1 - a) * t[r] + a * n(t[r], o, a));
			} else for (let a = 0; a < i; a++) {
				let i = r.next(), o = 1 + i * 5;
				e[a] = y((1 - i) * e[a] + i * n(e[a], o, i)), t[a] = y((1 - i) * t[a] + i * n(t[a], o, i));
			}
		},
		update(e) {
			return e.type === t.type && (r.to(b(x(e.amountPct, 0) / 100), i), !0);
		}
	};
}
function E(e) {
	let t = Math.max(1, Math.min(16, Math.round(x(e.bits, 16)))), n = Math.max(1, Math.min(32, Math.round(x(e.rateDivide, 1)))), r = t < 16, i = n > 1, a = (t) => t.bits === e.bits && t.rateDivide === e.rateDivide;
	if (!r && !i) return {
		process() {},
		update: a
	};
	let o = 2 / 2 ** t, s = 0, c = 0, l = 0;
	return {
		process(e, t, a) {
			for (let u = 0; u < a; u++) (!i || s % n === 0) && (c = e[u], l = t[u]), s++, e[u] = r ? y(Math.round(c / o) * o) : c, t[u] = r ? y(Math.round(l / o) * o) : l;
		},
		update: a
	};
}
function D(e, t) {
	let r = (e) => e.hz === t.hz;
	if (!(t.hz < 2e4)) return {
		process() {},
		update: r
	};
	let i = n(e, t.hz), a = n(e, t.hz);
	return {
		process(e, t, n) {
			for (let r = 0; r < n; r++) e[r] = y(i(e[r])), t[r] = y(a(t[r]));
		},
		update: r
	};
}
function O(e) {
	return { process(t, n, r) {
		if (e !== 1) for (let i = 0; i < r; i++) t[i] = t[i] * e, n[i] = n[i] * e;
	} };
}
//#endregion
//#region src/dsp/output/stream.ts
var k = (e) => e === 0 ? 1 : 10 ** (e / 20);
function A(e, t, n) {
	if (m(e)) return () => {};
	let r = [O(k(e.inDb))];
	return e.outputStage.enabled && r.push(w(t, e.outputStage, n)), e.drive.enabled && r.push(T(t, e.drive)), e.crunch.enabled && r.push(E(e.crunch)), e.tone.enabled && r.push(D(t, e.tone)), r.push(O(k(e.outDb))), (e, t, n) => {
		for (let i of r) i.process(e, t, n);
	};
}
var j = class {
	settings;
	sampleRate;
	seed;
	chain;
	old = null;
	fadeLeft = 0;
	scratchL = /* @__PURE__ */ new Float32Array(128);
	scratchR = /* @__PURE__ */ new Float32Array(128);
	constructor(e, t, n) {
		this.settings = e, this.sampleRate = t, this.seed = n, this.chain = A(e, t, n);
	}
	get current() {
		return this.settings;
	}
	set(e) {
		JSON.stringify(e) !== JSON.stringify(this.settings) && (this.old = this.chain, this.fadeLeft = 256, this.settings = e, this.chain = A(e, this.sampleRate, this.seed));
	}
	reset() {
		this.old = null, this.fadeLeft = 0, this.chain = A(this.settings, this.sampleRate, this.seed);
	}
	process(e, t, n = e.length) {
		if (!this.old || this.fadeLeft <= 0) {
			this.chain(e, t, n);
			return;
		}
		this.scratchL.length < n && (this.scratchL = new Float32Array(n), this.scratchR = new Float32Array(n));
		let r = this.scratchL, i = this.scratchR;
		r.set(e.subarray(0, n)), i.set(t.subarray(0, n)), this.old(r, i, n), this.chain(e, t, n);
		for (let a = 0; a < n && !(this.fadeLeft <= 0); a++) {
			let n = 1 - this.fadeLeft / 256;
			e[a] = r[a] + (e[a] - r[a]) * n, t[a] = i[a] + (t[a] - i[a]) * n, this.fadeLeft--;
		}
		this.fadeLeft <= 0 && (this.old = null);
	}
}, M = "slopfactory-output-fx", N = class extends AudioWorkletProcessor {
	stream;
	resetAt = null;
	constructor(e) {
		super(e);
		let t = e.processorOptions ?? {};
		this.stream = new j(v(t.settings), sampleRate, (t.seed ?? 1) >>> 0), typeof t.resetAt == "number" && (this.resetAt = t.resetAt), this.port.onmessage = (e) => {
			let t = e.data;
			t.type === "settings" ? this.stream.set(v(t.settings)) : t.type === "reset" && (this.resetAt = typeof t.at == "number" ? t.at : 0);
		};
	}
	process(e, t) {
		let n = t[0], r = n[0], i = n[1] ?? n[0], a = e[0] ?? [];
		return a.length > 0 ? (r.set(a[0]), i.set(a[1] ?? a[0])) : (r.fill(0), i.fill(0)), this.resetAt !== null && currentTime >= this.resetAt && (this.stream.reset(), this.resetAt = null), this.stream.process(r, i, r.length), !0;
	}
};
registerProcessor(M, N);
//#endregion
