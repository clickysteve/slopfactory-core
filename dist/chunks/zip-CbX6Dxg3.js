//#region src/export/zip.ts
/**
* A small ZIP writer and reader with no dependencies. Files are written STORED (uncompressed:
* PCM audio barely compresses and stored entries keep writing fast and deterministic). The
* reader accepts stored entries and, where the browser provides DecompressionStream, deflated
* ones (so a bundle re-zipped by another tool still opens).
*/
var CRC_TABLE = (() => {
	const t = /* @__PURE__ */ new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(data, crc = 0) {
	let c = ~crc >>> 0;
	for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ c >>> 8;
	return ~c >>> 0;
}
/** A fixed timestamp (2026-01-01 00:00) so the same files always make the same archive. */
var DOS_TIME = 0;
var DOS_DATE = 23585;
function createZip(entries) {
	const enc = new TextEncoder();
	const names = /* @__PURE__ */ new Set();
	const locals = [];
	const centrals = [];
	let offset = 0;
	for (const e of entries) {
		if (names.has(e.name)) throw new Error(`duplicate file name in zip: ${e.name}`);
		names.add(e.name);
		const name = enc.encode(e.name);
		const crc = crc32(e.data);
		const size = e.data.length;
		if (size >= 4294967295 || offset >= 4294967295) throw new RangeError("zip too large (over 4 GB)");
		const local = new Uint8Array(30 + name.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 67324752, true);
		lv.setUint16(4, 20, true);
		lv.setUint16(6, 2048, true);
		lv.setUint16(8, 0, true);
		lv.setUint16(10, DOS_TIME, true);
		lv.setUint16(12, DOS_DATE, true);
		lv.setUint32(14, crc, true);
		lv.setUint32(18, size, true);
		lv.setUint32(22, size, true);
		lv.setUint16(26, name.length, true);
		local.set(name, 30);
		const central = new Uint8Array(46 + name.length);
		const cv = new DataView(central.buffer);
		cv.setUint32(0, 33639248, true);
		cv.setUint16(4, 20, true);
		cv.setUint16(6, 20, true);
		cv.setUint16(8, 2048, true);
		cv.setUint16(10, 0, true);
		cv.setUint16(12, DOS_TIME, true);
		cv.setUint16(14, DOS_DATE, true);
		cv.setUint32(16, crc, true);
		cv.setUint32(20, size, true);
		cv.setUint32(24, size, true);
		cv.setUint16(28, name.length, true);
		cv.setUint32(42, offset, true);
		central.set(name, 46);
		locals.push(local, e.data);
		centrals.push(central);
		offset += local.length + size;
	}
	const centralSize = centrals.reduce((a, c) => a + c.length, 0);
	const end = /* @__PURE__ */ new Uint8Array(22);
	const ev = new DataView(end.buffer);
	ev.setUint32(0, 101010256, true);
	ev.setUint16(8, entries.length, true);
	ev.setUint16(10, entries.length, true);
	ev.setUint32(12, centralSize, true);
	ev.setUint32(16, offset, true);
	const out = new Uint8Array(offset + centralSize + 22);
	let p = 0;
	for (const part of [
		...locals,
		...centrals,
		end
	]) {
		out.set(part, p);
		p += part.length;
	}
	return out;
}
async function inflateRaw(data, limit, name) {
	const DS = globalThis.DecompressionStream;
	if (!DS) throw new Error("this archive is compressed and the browser cannot decompress it");
	const reader = new Blob([data]).stream().pipeThrough(new DS("deflate-raw")).getReader();
	const parts = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.length;
		if (size > limit) {
			await reader.cancel().catch(() => {});
			throw new ZipLimitError(`ZIP entry ${name} expands beyond the limit`);
		}
		parts.push(value);
	}
	const out = new Uint8Array(size);
	let p = 0;
	for (const c of parts) {
		out.set(c, p);
		p += c.length;
	}
	return out;
}
/** An archive exceeded a ReadZipOptions limit. */
var ZipLimitError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "ZipLimitError";
	}
};
/** Read every file in a ZIP archive, checking CRCs (and the limits, if given). */
async function readZip(bytes, opts = {}) {
	const maxEntry = opts.maxEntryBytes ?? Infinity;
	let budget = opts.maxTotalBytes ?? Infinity;
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let eocd = -1;
	for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 101010256) {
		eocd = i;
		break;
	}
	if (eocd < 0) throw new Error("not a ZIP archive");
	const count = dv.getUint16(eocd + 10, true);
	if (count > (opts.maxEntries ?? Infinity)) throw new ZipLimitError(`the archive has too many files (${count})`);
	let p = dv.getUint32(eocd + 16, true);
	const dec = new TextDecoder();
	const out = [];
	for (let i = 0; i < count; i++) {
		if (p + 46 > bytes.length || dv.getUint32(p, true) !== 33639248) throw new Error("damaged ZIP directory");
		const method = dv.getUint16(p + 10, true);
		const crc = dv.getUint32(p + 16, true);
		const csize = dv.getUint32(p + 20, true);
		const usize = dv.getUint32(p + 24, true);
		const nlen = dv.getUint16(p + 28, true);
		const xlen = dv.getUint16(p + 30, true);
		const clen = dv.getUint16(p + 32, true);
		const local = dv.getUint32(p + 42, true);
		const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
		p += 46 + nlen + xlen + clen;
		if (usize > maxEntry || usize > budget) throw new ZipLimitError(`ZIP entry ${name} is too large`);
		if (local + 30 > bytes.length || dv.getUint32(local, true) !== 67324752) throw new Error(`damaged ZIP entry ${name}`);
		const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
		const raw = bytes.subarray(start, start + csize);
		if (raw.length !== csize) throw new Error(`truncated ZIP entry ${name}`);
		let data;
		if (method === 0) data = raw.slice();
		else if (method === 8) data = await inflateRaw(raw, Math.min(maxEntry, budget), name);
		else throw new Error(`ZIP entry ${name} uses an unsupported compression method (${method})`);
		if (data.length > maxEntry || data.length > budget) throw new ZipLimitError(`ZIP entry ${name} is too large`);
		budget -= data.length;
		if (crc32(data) !== crc) throw new Error(`ZIP entry ${name} is corrupt (checksum mismatch)`);
		if (!name.endsWith("/")) out.push({
			name,
			data
		});
	}
	return out;
}
//#endregion
export { readZip as i, crc32 as n, createZip as r, ZipLimitError as t };
