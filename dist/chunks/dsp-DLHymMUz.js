//#region src/dsp/vendor/goodbits/js/dsp.js
/**
* Search outward from `sampleIndex` (within +/- windowSamples) for the
* nearest sample where the signal crosses zero, to avoid an audible click
* at a hard cut. Falls back to the original index if no crossing is found.
*/
function findNearestZeroCrossing(mono, sampleIndex, windowSamples) {
	const n = mono.length;
	const start = Math.max(1, sampleIndex - windowSamples);
	const end = Math.min(n - 1, sampleIndex + windowSamples);
	let best = sampleIndex;
	let bestDist = Infinity;
	for (let i = start; i <= end; i++) {
		const prev = mono[i - 1];
		const cur = mono[i];
		if (prev <= 0 && cur >= 0 || prev >= 0 && cur <= 0) {
			const dist = Math.abs(i - sampleIndex);
			if (dist < bestDist) {
				bestDist = dist;
				best = i;
			}
		}
	}
	return best;
}
/** Apply a linear fade-in/out in place to a set of per-channel Float32Arrays. */
function applyFades(channels, fadeInSamples, fadeOutSamples) {
	for (const ch of channels) {
		const n = ch.length;
		const fi = Math.min(fadeInSamples, Math.floor(n / 2));
		const fo = Math.min(fadeOutSamples, Math.floor(n / 2));
		for (let i = 0; i < fi; i++) ch[i] *= i / fi;
		for (let i = 0; i < fo; i++) ch[n - 1 - i] *= i / fo;
	}
}
/** Downmix any number of channels to mono by averaging. */
function toMono(channels) {
	const n = channels[0].length;
	if (channels.length === 1) return channels[0];
	const out = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		let sum = 0;
		for (const ch of channels) sum += ch[i];
		out[i] = sum / channels.length;
	}
	return out;
}
/** Simple linear-interpolation resampler, good enough for analysis use. */
function resampleLinear(mono, fromRate, toRate) {
	if (fromRate === toRate) return mono;
	const ratio = toRate / fromRate;
	const outLen = Math.max(1, Math.round(mono.length * ratio));
	const out = new Float32Array(outLen);
	for (let i = 0; i < outLen; i++) {
		const srcPos = i / ratio;
		const i0 = Math.floor(srcPos);
		const i1 = Math.min(mono.length - 1, i0 + 1);
		const frac = srcPos - i0;
		out[i] = mono[i0] * (1 - frac) + mono[i1] * frac;
	}
	return out;
}
//#endregion
export { toMono as i, findNearestZeroCrossing as n, resampleLinear as r, applyFades as t };
