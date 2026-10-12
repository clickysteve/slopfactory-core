//#region src/dsp/vendor/goodbits/js/dsp/stretch/characters.js
var e = {
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
function t(t, n) {
	let r = t && typeof t[n] == "number" ? t[n] : e[n].default;
	return Math.max(0, Math.min(2, r / 50));
}
function n(e, n) {
	let r = t(n, "texture"), i = t(n, "variation"), a = { ...e };
	return a.grainMs = Math.max(6, e.grainMs * r), a.posJitterMs = (e.posJitterMs || 0) * i, a.timeJitterMs = (e.timeJitterMs || 0) * i, a.pitchJitterCents = (e.pitchJitterCents || 0) * i, a.reverseProb = Math.max(0, Math.min(.95, (e.reverseProb || 0) * i)), a.dropoutProb = Math.max(0, Math.min(.85, (e.dropoutProb || 0) * i)), a;
}
function r(e, n) {
	let r = t(n, "smear"), i = { ...e };
	return typeof i.smear == "number" && (i.smear = Math.max(0, Math.min(1, i.smear * r))), typeof i.phaseRandomize == "number" && (i.phaseRandomize = Math.max(0, Math.min(1, i.phaseRandomize * r))), typeof i.holdMs == "number" && (i.holdMs = Math.max(40, i.holdMs * r)), i;
}
function i(e, n) {
	let r = t(n, "roughness"), i = { ...e };
	return typeof i.windowMs == "number" && (i.windowMs = Math.max(4, i.windowMs / Math.max(.4, r))), typeof i.bitDepth == "number" && (i.bitDepth = Math.max(1, Math.min(16, Math.round(i.bitDepth / Math.max(.35, r))))), typeof i.searchMs == "number" && (i.searchMs = Math.max(0, i.searchMs / Math.max(.5, r))), typeof i.repeatJitter == "number" && (i.repeatJitter = Math.max(0, Math.min(1, i.repeatJitter + Math.max(0, r - 1)))), typeof i.chunkMs == "number" && (i.chunkMs = Math.max(8, i.chunkMs / Math.max(.4, r))), i;
}
function a(n, r) {
	let i = { ...n }, a = r && typeof r.cycle == "number" ? r.cycle : e.cycle.default;
	return i.cycleMs = Math.max(3, n.cycleMs * 2 ** ((a - 50) / 25)), i.crossfade = Math.max(0, Math.min(.5, n.crossfade * t(r, "crossfade"))), i;
}
var o = {
	granular: n,
	spectral: r,
	oldDigital: i,
	cyclic: a
}, s = {
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
			phaseLocking: !0,
			phaseRandomize: 0,
			transientReset: !0,
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
			phaseLocking: !0,
			phaseRandomize: 0,
			transientReset: !0,
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
		legacy: !0
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
		legacy: !0
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
		legacy: !0
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
		legacy: !0
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
		usesSeed: !0
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
		usesSeed: !0
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
		usesSeed: !0
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
		usesSeed: !0
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
		usesSeed: !0
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
		usesSeed: !0
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
		usesSeed: !0
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
		usesSeed: !0
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
		usesSeed: !0
	},
	phase: {
		label: "Phase",
		group: "spectral",
		engine: "phaseVocoder",
		description: "Classic phase-vocoder stretch with audible phasey movement.",
		params: {
			fftMs: 46,
			overlap: 4,
			phaseLocking: !1,
			phaseRandomize: .15,
			transientReset: !1
		},
		macros: ["smear"],
		macroFamily: "spectral",
		usesSeed: !0
	},
	underwater: {
		label: "Underwater",
		group: "spectral",
		engine: "phaseVocoder",
		description: "Diffuse phase-vocoder smear.",
		params: {
			fftMs: 110,
			overlap: 8,
			phaseLocking: !1,
			phaseRandomize: .55,
			transientReset: !1
		},
		macros: ["smear"],
		macroFamily: "spectral",
		usesSeed: !0
	},
	metallic: {
		label: "Metallic",
		group: "spectral",
		engine: "phaseVocoder",
		description: "Small spectral windows with ringing artifacts.",
		params: {
			fftMs: 6,
			overlap: 3,
			phaseLocking: !1,
			phaseRandomize: .2,
			transientReset: !1
		},
		macros: ["smear"],
		macroFamily: "spectral",
		usesSeed: !0
	},
	glass: {
		label: "Glass",
		group: "spectral",
		engine: "phaseVocoder",
		description: "Shimmering and mostly coherent, with a little sparkle of chaos.",
		params: {
			fftMs: 60,
			overlap: 4,
			phaseLocking: !0,
			phaseRandomize: .1,
			transientReset: !1
		},
		macros: ["smear"],
		macroFamily: "spectral",
		usesSeed: !0
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
		usesSeed: !0
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
		usesSeed: !0
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
		usesSeed: !0
	},
	tape: {
		label: "Tape",
		group: "experimental",
		engine: "varispeed",
		description: "Pitch follows speed, like tape or a sampler played at the wrong rate.",
		params: {},
		preservesPitch: !1
	}
};
function c(e) {
	return s[e] || s.clean;
}
function l(e, t) {
	if (!e.macros || !e.macros.length) return { ...e.params };
	let n = o[e.macroFamily];
	return n ? n(e.params, t) : { ...e.params };
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp.js
function u(e, t, n) {
	for (let r of e) {
		let e = r.length, i = Math.min(t, Math.floor(e / 2)), a = Math.min(n, Math.floor(e / 2));
		for (let e = 0; e < i; e++) r[e] *= e / i;
		for (let t = 0; t < a; t++) r[e - 1 - t] *= t / a;
	}
}
function d(e) {
	let t = e[0].length;
	if (e.length === 1) return e[0];
	let n = new Float32Array(t);
	for (let r = 0; r < t; r++) {
		let t = 0;
		for (let n of e) t += n[r];
		n[r] = t / e.length;
	}
	return n;
}
function f(e, t, n) {
	if (t === n) return e;
	let r = n / t, i = Math.max(1, Math.round(e.length * r)), a = new Float32Array(i);
	for (let t = 0; t < i; t++) {
		let n = t / r, i = Math.floor(n), o = Math.min(e.length - 1, i + 1), s = n - i;
		a[t] = e[i] * (1 - s) + e[o] * s;
	}
	return a;
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/windows.js
function p(e) {
	let t = new Float32Array(e);
	for (let n = 0; n < e; n++) t[n] = .5 - .5 * Math.cos(2 * Math.PI * n / Math.max(1, e - 1));
	return t;
}
function m(e) {
	let t = new Float32Array(e), n = (e - 1) / 2;
	for (let r = 0; r < e; r++) t[r] = 1 - Math.abs((r - n) / Math.max(1, n));
	return t;
}
function h(e, t = .08) {
	let n = new Float32Array(e).fill(1), r = Math.max(1, Math.round(e * t));
	for (let t = 0; t < r; t++) {
		let i = .5 - .5 * Math.cos(Math.PI * t / r);
		n[t] = i, n[e - 1 - t] = i;
	}
	return n;
}
var g = /* @__PURE__ */ new Map();
function _(e, t) {
	let n = `${e}:${t}`, r = g.get(n);
	return r || (r = e === "tri" ? m(t) : e === "rect" ? h(t) : p(t), g.set(n, r)), r;
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/wsola.js
function v(e, t) {
	let n = 0;
	for (let r = 0; r < t; r++) {
		let t = e[r] || 0;
		n += t * t;
	}
	return n;
}
function y(e, t, n, r, i) {
	let a = 0, o = 0;
	for (let t = 0; t < i; t++) {
		let i = e[t] || 0, s = n[r + t] || 0;
		a += i * s, o += s * s;
	}
	let s = Math.sqrt(t * o);
	return s > 1e-9 ? a / s : 0;
}
function b(e, t) {
	let n = 2 / 2 ** t;
	for (let t = 0; t < e.length; t++) e[t] = Math.round(e[t] / n) * n;
}
function x(e, t, n, r) {
	let i = r || {}, a = i.windowMs ?? 46, o = i.searchMs ?? 14, s = i.hopFraction ?? .5, c = i.bitDepth ?? null;
	if (Math.abs(n - 1) < 1e-6) return e.map((e) => Float32Array.from(e));
	let l = e.length > 1 ? d(e) : e[0], u = l.length, f = Math.max(64, Math.round(a / 1e3 * t)), m = Math.max(1, Math.round(f * s));
	Math.max(1, Math.round(m / n));
	let h = Math.max(0, Math.round(o / 1e3 * t)), g = p(f), _ = Math.max(f, Math.round(u * n)), x = [], S = 0, C = null, w = Math.max(0, u - f);
	for (; S < _;) {
		let e = Math.min(w, Math.round(S / n)), t = 0;
		if (h > 0 && C) {
			let n = -Infinity, r = Math.min(f, C.length), i = v(C, r), a = Math.max(0, e - h), o = Math.min(Math.max(a, w), e + h);
			for (let s = a; s <= o; s++) {
				let a = y(C, i, l, s, r);
				a > n && (n = a, t = s - e);
			}
		}
		let r = Math.max(0, Math.min(w, e + t));
		x.push({
			grainStart: r,
			synthesisPos: S
		});
		let i = Math.min(f, m);
		C = l.slice(r + f - i, r + f), S += m;
	}
	return e.map((e) => {
		let t = new Float32Array(_ + f), n = new Float32Array(_ + f);
		for (let { grainStart: r, synthesisPos: i } of x) for (let a = 0; a < f; a++) {
			let o = e[r + a] || 0;
			t[i + a] += o * g[a], n[i + a] += g[a];
		}
		let r = new Float32Array(_);
		for (let e = 0; e < _; e++) r[e] = n[e] > 1e-6 ? t[e] / n[e] : t[e];
		return c && b(r, c), r;
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/fft.js
function S(e) {
	let t = 1;
	for (; t < e;) t <<= 1;
	return t;
}
function C(e, t) {
	let n = e.length;
	for (let r = 1, i = 0; r < n; r++) {
		let a = n >> 1;
		for (; i & a; a >>= 1) i ^= a;
		if (i ^= a, r < i) {
			let n = e[r];
			e[r] = e[i], e[i] = n, n = t[r], t[r] = t[i], t[i] = n;
		}
	}
}
function w(e, t) {
	let n = e.length;
	if (!(n <= 1)) {
		C(e, t);
		for (let r = 2; r <= n; r <<= 1) {
			let i = r >> 1, a = -2 * Math.PI / r, o = Math.cos(a), s = Math.sin(a);
			for (let a = 0; a < n; a += r) {
				let n = 1, r = 0;
				for (let c = 0; c < i; c++) {
					let l = a + c, u = l + i, d = e[u] * n - t[u] * r, f = e[u] * r + t[u] * n, p = e[l], m = t[l];
					e[l] = p + d, t[l] = m + f, e[u] = p - d, t[u] = m - f;
					let h = n * o - r * s, g = n * s + r * o;
					n = h, r = g;
				}
			}
		}
	}
}
function T(e, t) {
	let n = e.length;
	if (n <= 1) return;
	for (let e = 0; e < n; e++) t[e] = -t[e];
	w(e, t);
	let r = 1 / n;
	for (let i = 0; i < n; i++) e[i] *= r, t[i] = -t[i] * r;
}
function E(e) {
	let t = Math.PI * 2;
	return e - t * Math.floor((e + Math.PI) / t);
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/rng.js
function D(e) {
	let t = e >>> 0;
	return function() {
		t |= 0, t = t + 1831565813 | 0;
		let e = Math.imul(t ^ t >>> 15, 1 | t);
		return e = e + Math.imul(e ^ e >>> 7, 61 | e) ^ e, ((e ^ e >>> 14) >>> 0) / 4294967296;
	};
}
function O(e) {
	if (e == null) return 1;
	if (typeof e == "number" && Number.isFinite(e)) return e >>> 0 || Math.abs(Math.floor(e)) >>> 0 || 1;
	let t = 2166136261, n = String(e);
	for (let e = 0; e < n.length; e++) t ^= n.charCodeAt(e), t = Math.imul(t, 16777619);
	return t >>> 0 || 1;
}
function k(e, t) {
	let n = O(e), r = t >>> 0 || 0;
	return (Math.imul(n ^ r, 2654435761) ^ r << 13) >>> 0;
}
function A(e = 1) {
	let t = D(O(e));
	return {
		next: t,
		signed: () => t() * 2 - 1,
		range: (e, n) => e + t() * (n - e),
		int: (e) => Math.min(e - 1, Math.floor(t() * e)),
		bool: (e = .5) => t() < e
	};
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/stft.js
function j(e, t, n, r, i) {
	let a = new Float64Array(n), o = new Float64Array(n);
	for (let i = 0; i < n; i++) a[i] = (e[t + i] || 0) * r[i];
	w(a, o);
	let s = new Float64Array(i + 1), c = new Float64Array(i + 1);
	for (let e = 0; e <= i; e++) s[e] = Math.hypot(a[e], o[e]), c[e] = Math.atan2(o[e], a[e]);
	return {
		mag: s,
		phase: c
	};
}
function M(e, t, n) {
	let r = Math.max(1, Math.round(e / t)), i = Math.max(1, Math.round(r * n)), a = Math.floor(e / 2);
	return i <= a ? {
		Ha: r,
		Hs: i
	} : {
		Ha: a / n,
		Hs: a
	};
}
function N(e, t, n, r = .15) {
	let i = 0;
	for (let e = 0; e < n; e++) t[e] > i && (i = t[e]);
	let a = Math.max(1e-9, i * r), o = new Float32Array(n);
	for (let r = 0; r < n; r++) o[r] = e[r] / Math.max(t[r], a);
	return o;
}
function P(e, t, n, r, i, a) {
	e[0] = n[0], t[0] = 0, e[a] = n[a], t[a] = 0;
	for (let o = 1; o < a; o++) e[o] = n[o] * Math.cos(r[o]), t[o] = n[o] * Math.sin(r[o]), e[i - o] = e[o], t[i - o] = -t[o];
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/phase-vocoder.js
function F(e, t) {
	let n = 0;
	for (let r = 0; r <= t; r++) e[r] > n && (n = e[r]);
	let r = n * .02, i = [];
	for (let n = 1; n < t; n++) e[n] >= e[n - 1] && e[n] >= e[n + 1] && e[n] > r && i.push(n);
	return i.length === 0 && i.push(0), i;
}
function ee(e, t) {
	let n = new Int32Array(t + 1), r = 0;
	for (let i = 0; i <= t; i++) {
		for (; r < e.length - 1 && Math.abs(e[r + 1] - i) <= Math.abs(e[r] - i);) r++;
		n[i] = e[r];
	}
	return n;
}
function I(e, t, n) {
	let r = 0;
	for (let i = 0; i <= n; i++) r += Math.max(0, e[i] - (t ? t[i] : 0));
	return r;
}
function L(e, t, n, r, i, a) {
	let o = Array(a);
	for (let s = 0; s < a; s++) o[s] = j(e, s * n, t, r, i);
	return o;
}
function te(e, t, n, r) {
	let i = new Float64Array(n), a = null;
	for (let r = 0; r < n; r++) i[r] = I(e[r].mag, a, t), a = e[r].mag;
	let o = i.reduce((e, t) => e + t, 0) / Math.max(1, n) * (2.2 - 1.2 * r), s = new Uint8Array(n);
	for (let e = 1; e < n; e++) s[e] = +(i[e] > o && i[e] > 1e-6);
	return s;
}
function ne(e, t, n, r, i) {
	let a = r || {}, o = S(Math.max(64, Math.round((a.fftMs ?? 46) / 1e3 * t))), s = o / 2, c = Math.max(2, a.overlap ?? 4), { Ha: l, Hs: u } = M(o, c, n), f = Math.max(1, Math.round(o / c)), p = l === f, m = _("hann", o), h = !!a.phaseLocking, g = Math.max(0, Math.min(1, a.phaseRandomize ?? 0)), v = !!a.transientReset, y = Math.max(0, Math.min(1, a.transientSensitivity ?? .5)), b = e.length > 1 ? d(e) : e[0], x = b.length, C = Math.max(o, Math.round(x * n)), w = Math.max(1, Math.ceil(x / l) + 1), D = Math.max(1, Math.ceil(x / f) + 1), O = v ? L(b, o, f, m, s, D) : null, k = v ? te(O, s, D, y) : null;
	return e.map((e) => {
		let t = g > 0 ? A(i) : null, n = new Float64Array(C + o), r = new Float64Array(C + o), a = new Float64Array(s + 1), c = null, d = 0, _ = 0, v = -1, y = !1, x = new Float64Array(s + 1), S = new Float64Array(o), D = new Float64Array(o);
		for (let i = 0; i < w; i++) {
			let w = Math.floor(i * l), A = i * u;
			if (A > C + o) break;
			let { mag: M, phase: N } = p && e === b && O ? O[i] : j(e, w, o, m, s), I = Math.floor(w / f), L = k && I !== v ? !!k[I] : !1;
			if (v = I, !y) {
				for (let e = 0; e <= s; e++) a[e] = N[e];
				y = !0;
			} else if (L) for (let e = 0; e <= s; e++) a[e] = N[e];
			else {
				let e = w - d, t = A - _;
				for (let n = 0; n <= s; n++) {
					if (e > 0) {
						let t = 2 * Math.PI * n * e / o, r = E(N[n] - c[n] - t);
						x[n] = 2 * Math.PI * n / o + r / e;
					}
					a[n] += x[n] * t;
				}
			}
			if (h) {
				let e = F(M, s), t = ee(e, s), n = new Float64Array(s + 1);
				for (let t of e) n[t] = a[t];
				for (let e = 0; e <= s; e++) {
					let r = t[e];
					e !== r && (a[e] = n[r] + (N[e] - N[r]));
				}
			}
			if (t) for (let e = 1; e < s; e++) a[e] += g * t.signed() * Math.PI;
			P(S, D, M, a, o, s), T(S, D);
			for (let e = 0; e < o; e++) {
				let t = S[e] * m[e];
				n[A + e] += t, r[A + e] += m[e] * m[e];
			}
			c = N, d = w, _ = A;
		}
		return N(n, r, C);
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/granular.js
function re(e) {
	return 2 ** (e / 1200);
}
function ie(e, t, n, r, i) {
	let a = new Float32Array(n);
	for (let o = 0; o < n; o++) {
		let s = t + (i ? (n - 1 - o) * r : o * r), c = Math.floor(s), l = s - c, u = e[c] || 0, d = e[c + 1] || 0;
		a[o] = u + (d - u) * l;
	}
	return a;
}
function ae(e, t, n, r, i) {
	let a = r || {}, o = a.grainMs ?? 60, s = a.hopFraction ?? .5, c = a.posJitterMs ?? 4, l = a.timeJitterMs ?? 0, u = a.pitchJitterCents ?? 0, f = a.reverseProb ?? 0, p = a.dropoutProb ?? 0, m = a.envelope ?? "hann", h = a.bitDepth ?? null, g = Math.max(16, Math.round(o / 1e3 * t)), v = Math.max(1, Math.round(g * s)), y = Math.max(1, v / n), x = c / 1e3 * t, S = l / 1e3 * t, C = _(m, g), w = (e.length > 1 ? d(e) : e[0]).length, T = Math.max(g, Math.round(w * n)), E = A(i), D = [], O = 0, k = 0;
	for (; k < T && O < w + g;) {
		let e = O + E.signed() * x, t = k + E.signed() * S, n = E.bool(f), r = E.bool(p), i = re(E.signed() * u);
		D.push({
			srcStart: Math.max(0, e),
			dstStart: Math.max(0, Math.round(t)),
			reversed: n,
			dropped: r,
			pitchRatio: i
		}), O += y, k += v;
	}
	return e.map((e) => {
		let t = new Float32Array(T + g), n = new Float32Array(T + g);
		for (let r of D) {
			if (r.dropped) continue;
			let i = ie(e, r.srcStart, g, r.pitchRatio, r.reversed);
			for (let e = 0; e < g; e++) t[r.dstStart + e] += i[e] * C[e], n[r.dstStart + e] += C[e];
		}
		let r = new Float32Array(T);
		for (let e = 0; e < T; e++) r[e] = n[e] > 1e-6 ? t[e] / n[e] : 0;
		return h && b(r, h), r;
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/repeat.js
function R(e, t, n, r, i) {
	let a = r || {}, o = a.chunkMs ?? 90, s = a.crossfadeMs ?? 3, c = a.bitDepth ?? null, l = Math.max(0, Math.min(1, a.repeatJitter ?? 0)), u = Math.max(32, Math.round(o / 1e3 * t)), f = Math.max(0, Math.round(s / 1e3 * t)), p = (e.length > 1 ? d(e) : e[0]).length, m = A(i), h = [], g = 0;
	for (let e = 0; e < p; e += u) {
		g += n;
		let t = Math.round(g);
		g -= t, l > 0 && t > 0 && m.bool(l * .5) && (t = Math.max(0, t + (m.bool() ? -1 : 1)));
		let r = Math.min(u, p - e);
		r > 0 && t > 0 && h.push({
			srcStart: e,
			len: r,
			count: t
		});
	}
	h.length === 0 && h.push({
		srcStart: 0,
		len: Math.max(1, p),
		count: 1
	});
	let _ = [];
	for (let { srcStart: e, len: t, count: n } of h) for (let r = 0; r < n; r++) _.push({
		srcStart: e,
		len: t
	});
	let v = 0, y = 0;
	for (let e = 0; e < _.length; e++) {
		let t = _[e].len, n = e === 0 ? 0 : Math.min(f, t - 1, y - 1);
		v += t - n, y = t;
	}
	return e.map((e) => {
		let t = new Float32Array(Math.max(1, v)), n = 0, r = 0;
		for (let i = 0; i < _.length; i++) {
			let { srcStart: a, len: o } = _[i], s = i === 0 ? 0 : Math.min(f, o - 1, r - 1), c = n - s;
			for (let n = 0; n < o; n++) {
				let r = c + n;
				if (r < 0 || r >= t.length) continue;
				let i = e[a + n] || 0;
				if (n < s) {
					let e = (n + 1) / (s + 1);
					t[r] = t[r] * (1 - e) + i * e;
				} else t[r] = i;
			}
			n = c + o, r = o;
		}
		return c && b(t, c), t;
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/spectral-freeze.js
function z(e) {
	return Math.max(0, Math.min(1, e));
}
function B(e, t, n, r) {
	let i = r || {}, a = S(Math.max(256, Math.round((i.fftMs ?? 90) / 1e3 * t))), o = a / 2, s = Math.max(2, i.overlap ?? 4), c = Math.max(1, Math.round(a / s)), { Hs: l } = M(a, s, n), u = Math.max(20, i.holdMs ?? 300), f = Math.max(2, Math.round(u / 1e3 * t / l)), p = Math.max(1, Math.round(f * .3)), m = (e.length > 1 ? d(e) : e[0]).length, h = Math.max(a, Math.round(m * n)), g = Math.max(1, Math.ceil(h / l)), v = Math.max(1, Math.ceil(g / f)), y = _("hann", a), b = Math.max(0, m - a), x = [];
	for (let e = 0; e <= v; e++) x.push(v <= 1 ? 0 : Math.round(e / v * b));
	return e.map((e) => {
		let t = [], n = [], r = [];
		for (let i = 0; i <= v; i++) {
			let s = x[i], { mag: l, phase: u } = j(e, s, a, y, o), { phase: d } = j(e, s + c, a, y, o), f = new Float64Array(o + 1);
			for (let e = 0; e <= o; e++) {
				let t = 2 * Math.PI * e * c / a, n = E(d[e] - u[e] - t);
				f[e] = 2 * Math.PI * e / a + n / c;
			}
			t.push(l), n.push(u), r.push(f);
		}
		let i = new Float64Array(h + a), s = new Float64Array(h + a), u = Float64Array.from(n[0]), d = new Float64Array(a), m = new Float64Array(a), _ = new Float64Array(o + 1), b = new Float64Array(o + 1), S = 0;
		for (let e = 0; e < v && S < g; e++) for (let n = 0; n < f && S < g; n++, S++) {
			let c = f - n, h = c <= p ? z(1 - (c - 1) / p) : 0, g = t[e], v = t[e + 1], x = r[e], C = r[e + 1];
			for (let e = 0; e <= o; e++) _[e] = g[e] * (1 - h) + v[e] * h, b[e] = x[e] * (1 - h) + C[e] * h;
			let w = S * l;
			P(d, m, _, u, a, o), T(d, m);
			for (let e = 0; e < a; e++) i[w + e] += d[e] * y[e], s[w + e] += y[e] * y[e];
			for (let e = 0; e <= o; e++) u[e] += b[e] * l;
		}
		return N(i, s, h);
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/paulstretch.js
function V(e, t, n) {
	if (n <= 0) return;
	let r = Math.max(1, Math.round(n * 6)), i = e.slice();
	for (let n = 0; n <= t; n++) {
		let a = 0, o = 0;
		for (let e = -r; e <= r; e++) {
			let r = n + e;
			r < 0 || r > t || (a += i[r], o++);
		}
		e[n] = a / o;
	}
}
function H(e, t, n, r, i) {
	let a = r || {}, o = S(Math.max(256, Math.round((a.windowMs ?? 250) / 1e3 * t))), s = o / 2, { Ha: c, Hs: l } = M(o, Math.max(4, a.overlap ?? 8), n), u = _("hann", o), f = Math.max(0, Math.min(1, a.smear ?? .3)), p = Math.max(0, Math.min(.95, a.frameBlend ?? f * .5)), m = (e.length > 1 ? d(e) : e[0]).length, h = Math.max(o, Math.round(m * n)), g = Math.max(1, Math.ceil(m / c) + 1);
	return e.map((e) => {
		let t = new Float64Array(h + o), n = new Float64Array(h + o), r = new Float64Array(o), a = new Float64Array(o), d = null;
		for (let m = 0; m < g; m++) {
			let g = Math.floor(m * c), _ = m * l;
			if (_ > h + o) break;
			let { mag: v } = j(e, g, o, u, s), y = new Float64Array(s + 1);
			for (let e = 0; e <= s; e++) y[e] = d ? v[e] * (1 - p) + d[e] * p : v[e];
			V(y, s, f), d = y;
			let b = A(k(i, m));
			r[0] = y[0], a[0] = 0, r[s] = y[s], a[s] = 0;
			for (let e = 1; e < s; e++) {
				let t = b.next() * 2 * Math.PI;
				r[e] = y[e] * Math.cos(t), a[e] = y[e] * Math.sin(t), r[o - e] = r[e], a[o - e] = -a[e];
			}
			T(r, a);
			for (let e = 0; e < o; e++) {
				let i = r[e] * u[e];
				t[_ + e] += i, n[_ + e] += u[e] * u[e];
			}
		}
		return N(t, n, h);
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/varispeed.js
function U(e, t) {
	return e.map((e) => f(e, 1, t));
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/cyclic.js
function W(e, t, n, r) {
	let i = r || {}, a = Math.max(16, Math.round((i.cycleMs ?? 60) / 1e3 * t)), o = Math.max(0, Math.min(.5, i.crossfade ?? .3)), s = i.bitDepth ?? null, c = Math.round(a * o), l = a - c, u = e[0] ? e[0].length : 0, d = Math.max(1, Math.round(u * n)), f = Math.ceil(d / l) + 1, p = new Float32Array(a);
	for (let e = 0; e < a; e++) {
		let t = 1;
		c > 0 && e < c && (t = (e + 1) / (c + 1)), c > 0 && e >= a - c && (t = Math.min(t, (a - e) / (c + 1))), p[e] = t;
	}
	return e.map((e) => {
		let t = new Float32Array(d);
		for (let r = 0; r < f; r++) {
			let i = r * l;
			if (i >= d) break;
			let o = Math.max(0, Math.min(u - a, Math.round(i / n))), s = r === 0;
			for (let n = 0; n < a; n++) {
				let r = i + n;
				if (r >= d) break;
				let a = s && n < c ? 1 : p[n];
				t[r] += (e[o + n] || 0) * a;
			}
		}
		return s && b(t, s), t;
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/dsp/stretch/index.js
var G = {
	wsola: (e, t, n, r) => x(e, t, n, r),
	phaseVocoder: (e, t, n, r, i) => ne(e, t, n, r, i),
	granular: (e, t, n, r, i) => ae(e, t, n, r, i),
	repeat: (e, t, n, r, i) => R(e, t, n, r, i),
	spectralFreeze: (e, t, n, r) => B(e, t, n, r),
	paulstretch: (e, t, n, r, i) => H(e, t, n, r, i),
	varispeed: (e, t, n) => U(e, n),
	cyclic: (e, t, n, r) => W(e, t, n, r)
}, K = .05;
function q(e, t, n, r, i = {}) {
	let a = c(r), o = e[0] ? e[0].length : 0, s = o > 0 ? Math.max(1, 600 * t / o) : Infinity, u = Math.min(a.maxRatio || 1e3, s), d = Math.max(K, Math.min(u, n || 1));
	if (Math.abs(d - 1) < 1e-6) return e.map((e) => Float32Array.from(e));
	let f = l(a, i.macroValues), p = i.seed ?? 1, m = (G[a.engine] || G.wsola)(e, t, d, f, p);
	for (let e of m) for (let t = 0; t < e.length; t++) {
		let n = e[t];
		Number.isFinite(n) ? n > 4 ? e[t] = 4 : n < -4 && (e[t] = -4) : e[t] = 0;
	}
	return m;
}
//#endregion
//#region src/dsp/vendor/goodbits/js/outputstage.js
function oe(e) {
	return Math.max(0, Math.min(1, e));
}
function se(e) {
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
function ce(e, t, n = 0) {
	let r = oe((n ?? 0) / 100);
	if (r <= 1e-4) return e.map((e) => Float32Array.from(e));
	let i = 1 + r * 5, a = se(t);
	return e.map((e) => {
		let t = new Float32Array(e.length);
		for (let n = 0; n < e.length; n++) {
			let o = e[n];
			t[n] = (1 - r) * o + r * a(o, i, r);
		}
		return t;
	});
}
function le(e, { bits: t = 16, rateDivide: n = 1 } = {}) {
	let r = Math.max(1, Math.min(16, Math.round(t ?? 16))), i = Math.max(1, Math.min(32, Math.round(n ?? 1))), a = r < 16, o = i > 1;
	if (!a && !o) return e.map((e) => Float32Array.from(e));
	let s = 2 / 2 ** r;
	return e.map((e) => {
		let t = new Float32Array(e.length), n = 0;
		for (let r = 0; r < e.length; r++) (!o || r % i === 0) && (n = e[r]), t[r] = a ? Math.round(n / s) * s : n;
		return t;
	});
}
//#endregion
//#region src/dsp/vendor/goodbits/js/stretch-fx/render.js
var ue = 24;
function J(e) {
	let t = 0;
	for (let n of e) for (let e = 0; e < n.length; e++) {
		let r = Math.abs(n[e]);
		r > t && (t = r);
	}
	return t;
}
function Y(e) {
	return e.map((e) => Float32Array.from(e).reverse());
}
function de(e) {
	for (let t of e) for (let e = 0; e < t.length; e++) Number.isFinite(t[e]) || (t[e] = 0);
}
function fe({ channels: e, sampleRate: t, recipe: n }) {
	if (!e.length || !e[0].length) throw Error("empty fragment");
	let r = (e) => Math.round(e / 1e3 * t), i = e.map((e) => Float32Array.from(e)), a = J(i);
	if (u(i, r(.6), r(6)), n.reverse === "pre" && (i = Y(i)), n.pitch) {
		let e = 2 ** (-n.pitch / 12);
		i = i.map((t) => f(t, 1, e));
	}
	let o = n.seed >>> 0;
	n.passes.forEach((e, n) => {
		let r = ue * t / Math.max(1, i[0].length), a = Math.max(.05, Math.min(e.ratio, r));
		i = q(i, t, a, e.character, {
			macroValues: e.macroValues,
			seed: o + n * 7919 >>> 0
		});
	}), n.reverse === "post" && (i = Y(i)), n.drive && n.drive.amount > 0 && (i = ce(i, n.drive.type, n.drive.amount)), n.crunch && (i = le(i, n.crunch)), de(i);
	let s = J(i), c = Math.max(.3, Math.min(.92, a || .5));
	if (s > 1e-6) {
		let e = Math.min(8, c / s);
		for (let t of i) for (let n = 0; n < t.length; n++) t[n] *= e;
	}
	let l = n.reverse === "post" ? r(10) : r(.7), d = n.reverse === "post" ? r(2) : r(14);
	return u(i, l, d), {
		channels: i,
		sampleRate: t,
		duration: i[0].length / t
	};
}
//#endregion
//#region src/dsp/transform/settings.ts
function X() {
	return {
		enabled: !1,
		reverse: "none",
		pitch: 0,
		character: "clean",
		ratio: 1,
		macros: {},
		drive: {
			enabled: !1,
			type: "tape",
			amountPct: 30
		},
		crunch: {
			enabled: !1,
			bits: 12,
			rateDivide: 1
		},
		seed: 1
	};
}
function pe(e) {
	return !e.enabled;
}
function me(e) {
	let t = s[e.character]?.macros ?? [], n = {};
	for (let r of t) typeof e.macros[r] == "number" && (n[r] = e.macros[r]);
	return {
		seed: e.seed >>> 0,
		pitch: e.pitch,
		reverse: e.reverse === "none" ? null : e.reverse,
		passes: Math.abs(e.ratio - 1) < 1e-6 ? [] : [{
			character: e.character,
			ratio: e.ratio,
			macroValues: n
		}],
		drive: e.drive.enabled && e.drive.amountPct > 0 ? {
			type: e.drive.type,
			amount: e.drive.amountPct
		} : null,
		crunch: e.crunch.enabled ? {
			bits: e.crunch.bits,
			rateDivide: e.crunch.rateDivide
		} : null
	};
}
var Z = (e) => !!e && typeof e == "object" && !Array.isArray(e), Q = (e, t, n, r, i = !1) => {
	let a = typeof e == "number" && Number.isFinite(e) ? e : r;
	return i && (a = Math.round(a)), Math.max(t, Math.min(n, a));
};
function he(t) {
	let n = X(), r = Z(t) ? t : {}, i = Z(r.drive) ? r.drive : {}, a = Z(r.crunch) ? r.crunch : {}, o = {};
	if (Z(r.macros)) for (let [t, n] of Object.entries(r.macros)) t in e && typeof n == "number" && Number.isFinite(n) && (o[t] = Math.max(0, Math.min(100, n)));
	return {
		enabled: r.enabled === !0,
		reverse: r.reverse === "pre" || r.reverse === "post" ? r.reverse : "none",
		pitch: Q(r.pitch, -24, 24, 0),
		character: typeof r.character == "string" && r.character in s ? r.character : n.character,
		ratio: Q(r.ratio, .25, 8, 1),
		macros: o,
		drive: {
			enabled: i.enabled === !0,
			type: [
				"tape",
				"tube",
				"diode",
				"fuzz"
			].includes(i.type) ? i.type : "tape",
			amountPct: Q(i.amountPct, 0, 100, 30)
		},
		crunch: {
			enabled: a.enabled === !0,
			bits: Q(a.bits, 1, 16, 12, !0),
			rateDivide: Q(a.rateDivide, 1, 32, 1, !0)
		},
		seed: Q(r.seed, 0, 4294967295, 1, !0)
	};
}
//#endregion
//#region src/dsp/transform/transform.ts
function ge(e, t) {
	if (pe(t)) return e;
	if (!e.channels.length || !e.channels[0].length) throw Error("empty sample");
	let n = fe({
		channels: e.channels,
		sampleRate: e.sampleRate,
		recipe: me(t)
	});
	return {
		sampleRate: n.sampleRate,
		channels: n.channels
	};
}
//#endregion
//#region src/dsp/transform/worker.ts
var $ = self;
$.onmessage = (e) => {
	let { id: t, audio: n, transform: r } = e.data;
	try {
		let e = ge(n, he(r)), i = e.channels === n.channels ? e.channels.map((e) => e.slice()) : e.channels;
		$.postMessage({
			id: t,
			audio: {
				sampleRate: e.sampleRate,
				channels: i
			}
		}, i.map((e) => e.buffer));
	} catch (e) {
		$.postMessage({
			id: t,
			error: e instanceof Error ? e.message : String(e)
		});
	}
};
//#endregion
