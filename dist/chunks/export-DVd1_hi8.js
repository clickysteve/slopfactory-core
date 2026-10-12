import { t as encodeWav } from "./audio-codec-8sSSPTh6.js";
//#region src/export/wav.ts
/**
* WAV export: Good Bits' encoder (16-bit PCM, little endian, interleaved, clamp and round, no
* dither, no normalisation), plus level statistics and a header reader for checks and tests.
*/
async function encodeWav16(channels, sampleRate) {
	return new Uint8Array(await encodeWav(channels, sampleRate, 16).arrayBuffer());
}
function levelStats(channels) {
	let peak = 0;
	let clipped = 0;
	let sum = 0;
	let n = 0;
	for (const ch of channels) {
		for (let i = 0; i < ch.length; i++) {
			const a = Math.abs(ch[i]);
			if (a > peak) peak = a;
			if (a > 1) clipped++;
			sum += ch[i] * ch[i];
		}
		n += ch.length;
	}
	return {
		peak,
		peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
		clipped,
		rms: n ? Math.sqrt(sum / n) : 0,
		silent: peak === 0
	};
}
/** Read a canonical WAV header (for verification; throws on anything else). */
function wavInfo(bytes) {
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tag = (at) => String.fromCharCode(...bytes.subarray(at, at + 4));
	if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a RIFF/WAVE file");
	let pos = 12;
	let fmt = null;
	while (pos + 8 <= bytes.length) {
		const id = tag(pos);
		const size = dv.getUint32(pos + 4, true);
		if (id === "fmt ") fmt = {
			format: dv.getUint16(pos + 8, true),
			channels: dv.getUint16(pos + 10, true),
			sampleRate: dv.getUint32(pos + 12, true),
			byteRate: dv.getUint32(pos + 16, true),
			blockAlign: dv.getUint16(pos + 20, true),
			bitsPerSample: dv.getUint16(pos + 22, true)
		};
		else if (id === "data") {
			if (!fmt) throw new Error("data before fmt");
			return {
				riffSize: dv.getUint32(4, true),
				...fmt,
				dataOffset: pos + 8,
				dataBytes: size,
				frames: size / fmt.blockAlign
			};
		}
		pos += 8 + size + size % 2;
	}
	throw new Error("no data chunk");
}
//#endregion
//#region src/export/names.ts
/** File-name helpers: short, predictable, safe on every operating system. */
/** Lower-case letters, digits and single hyphens, at most `max` characters ('' if nothing is left). */
function slug(s, max = 24) {
	return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "");
}
/** Join name parts with underscores, dropping empty ones. */
function fileName(parts, ext) {
	return `${parts.filter(Boolean).join("_")}.${ext}`;
}
/** Make names unique by appending -2, -3... before the extension. */
function uniqueNames(names) {
	const seen = /* @__PURE__ */ new Map();
	return names.map((n) => {
		const c = (seen.get(n) ?? 0) + 1;
		seen.set(n, c);
		if (c === 1) return n;
		const dot = n.lastIndexOf(".");
		return dot > 0 ? `${n.slice(0, dot)}-${c}${n.slice(dot)}` : `${n}-${c}`;
	});
}
//#endregion
export { levelStats as a, encodeWav16 as i, slug as n, wavInfo as o, uniqueNames as r, fileName as t };
