//#region src/dsp/vendor/goodbits/js/audio-codec.js
/** A minimal AudioBuffer-shaped object so the rest of the app can treat
*  manually-parsed audio the same way as a real browser AudioBuffer. */
function makeBufferLike(sampleRate, channelData) {
	return {
		sampleRate,
		numberOfChannels: channelData.length,
		length: channelData[0].length,
		getChannelData(i) {
			return channelData[i];
		}
	};
}
function parseWav(arrayBuffer) {
	const dv = new DataView(arrayBuffer);
	if (dv.getUint32(0, false) !== 1380533830) throw new Error("Not a RIFF/WAV file");
	if (dv.getUint32(8, false) !== 1463899717) throw new Error("RIFF file is not WAVE format");
	let pos = 12;
	let fmt = null;
	let dataOffset = -1;
	let dataLen = 0;
	while (pos + 8 <= dv.byteLength) {
		const id = dv.getUint32(pos, false);
		const size = dv.getUint32(pos + 4, true);
		const body = pos + 8;
		if (id === 1718449184) {
			const audioFormat = dv.getUint16(body, true);
			const numChannels = dv.getUint16(body + 2, true);
			const sampleRate = dv.getUint32(body + 4, true);
			const bitsPerSample = dv.getUint16(body + 14, true);
			let format = audioFormat;
			if (audioFormat === 65534 && size >= 24) format = dv.getUint16(body + 24, true);
			fmt = {
				format,
				numChannels,
				sampleRate,
				bitsPerSample
			};
		} else if (id === 1684108385) {
			dataOffset = body;
			dataLen = size;
		}
		pos = body + size + size % 2;
	}
	if (!fmt) throw new Error("WAV file has no fmt chunk");
	if (dataOffset < 0) throw new Error("WAV file has no data chunk");
	dataLen = Math.min(dataLen, dv.byteLength - dataOffset);
	const { numChannels, sampleRate, bitsPerSample, format } = fmt;
	const bytesPerSample = bitsPerSample / 8;
	const frameCount = Math.floor(dataLen / (bytesPerSample * numChannels));
	const channels = Array.from({ length: numChannels }, () => new Float32Array(frameCount));
	let readSample;
	if (format === 3 && bitsPerSample === 32) readSample = (off) => dv.getFloat32(off, true);
	else if (format === 1 && bitsPerSample === 16) readSample = (off) => dv.getInt16(off, true) / 32768;
	else if (format === 1 && bitsPerSample === 24) readSample = (off) => {
		const b0 = dv.getUint8(off);
		const b1 = dv.getUint8(off + 1);
		const b2 = dv.getUint8(off + 2);
		let v = b0 | b1 << 8 | b2 << 16;
		if (v & 8388608) v -= 16777216;
		return v / 8388608;
	};
	else if (format === 1 && bitsPerSample === 32) readSample = (off) => dv.getInt32(off, true) / 2147483648;
	else if (format === 1 && bitsPerSample === 8) readSample = (off) => (dv.getUint8(off) - 128) / 128;
	else throw new Error(`Unsupported WAV encoding (format ${format}, ${bitsPerSample}-bit)`);
	for (let f = 0; f < frameCount; f++) {
		const frameOff = dataOffset + f * bytesPerSample * numChannels;
		for (let c = 0; c < numChannels; c++) channels[c][f] = readSample(frameOff + c * bytesPerSample);
	}
	return makeBufferLike(sampleRate, channels);
}
/**
* Encode Float32 channel data as a PCM WAV Blob.
* @param {Float32Array[]} channels
* @param {number} sampleRate
* @param {16|24} bitDepth
* @param {{cuePoints?: number[]}} [options] - cuePoints, if given and non-empty, are written as a
*   standard RIFF "cue " chunk (one cue point per entry) between "fmt " and "data". Each value is a
*   sample-frame offset into the data chunk (NOT milliseconds/seconds/bytes) - see js/slice-markers.js
*   for how chop-region starts become these offsets. Omitting cuePoints (or passing an empty array)
*   produces byte-for-byte the same plain WAV this function has always produced - existing callers
*   are unaffected.
*/
function encodeWav(channels, sampleRate, bitDepth = 24, options = {}) {
	const { cuePoints = null } = options;
	const numChannels = channels.length;
	const frameCount = channels[0].length;
	const bytesPerSample = bitDepth / 8;
	const dataSize = frameCount * numChannels * bytesPerSample;
	const hasCues = Array.isArray(cuePoints) && cuePoints.length > 0;
	const cueBodySize = hasCues ? 4 + cuePoints.length * 24 : 0;
	const cueChunkTotal = hasCues ? 8 + cueBodySize : 0;
	const buffer = new ArrayBuffer(44 + cueChunkTotal + dataSize);
	const dv = new DataView(buffer);
	const writeStr = (off, str) => {
		for (let i = 0; i < str.length; i++) dv.setUint8(off + i, str.charCodeAt(i));
	};
	writeStr(0, "RIFF");
	dv.setUint32(4, 36 + cueChunkTotal + dataSize, true);
	writeStr(8, "WAVE");
	writeStr(12, "fmt ");
	dv.setUint32(16, 16, true);
	dv.setUint16(20, 1, true);
	dv.setUint16(22, numChannels, true);
	dv.setUint32(24, sampleRate, true);
	dv.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
	dv.setUint16(32, numChannels * bytesPerSample, true);
	dv.setUint16(34, bitDepth, true);
	let off = 36;
	if (hasCues) {
		const maxFrame = Math.max(0, frameCount - 1);
		writeStr(off, "cue ");
		dv.setUint32(off + 4, cueBodySize, true);
		dv.setUint32(off + 8, cuePoints.length, true);
		off += 12;
		for (let i = 0; i < cuePoints.length; i++) {
			const sampleOffset = Math.max(0, Math.min(maxFrame, Math.round(cuePoints[i])));
			dv.setUint32(off, i + 1, true);
			dv.setUint32(off + 4, sampleOffset, true);
			writeStr(off + 8, "data");
			dv.setUint32(off + 12, 0, true);
			dv.setUint32(off + 16, 0, true);
			dv.setUint32(off + 20, sampleOffset, true);
			off += 24;
		}
	}
	writeStr(off, "data");
	dv.setUint32(off + 4, dataSize, true);
	off += 8;
	const clamp = (x) => Math.max(-1, Math.min(1, x));
	if (bitDepth === 16) for (let f = 0; f < frameCount; f++) for (let c = 0; c < numChannels; c++) {
		dv.setInt16(off, Math.round(clamp(channels[c][f]) * 32767), true);
		off += 2;
	}
	else if (bitDepth === 24) for (let f = 0; f < frameCount; f++) for (let c = 0; c < numChannels; c++) {
		let v = Math.round(clamp(channels[c][f]) * 8388607);
		if (v < 0) v += 16777216;
		dv.setUint8(off, v & 255);
		dv.setUint8(off + 1, v >> 8 & 255);
		dv.setUint8(off + 2, v >> 16 & 255);
		off += 3;
	}
	else throw new Error(`Unsupported export bit depth: ${bitDepth}`);
	return new Blob([buffer], { type: "audio/wav" });
}
/** Decode the 80-bit IEEE-754 extended-precision float AIFF uses for its sample rate. */
function readExtendedFloat80(dv, offset) {
	const sign = dv.getUint8(offset) & 128 ? -1 : 1;
	const exponent = (dv.getUint8(offset) & 127) << 8 | dv.getUint8(offset + 1);
	const hi = dv.getUint32(offset + 2, false);
	const lo = dv.getUint32(offset + 6, false);
	if (exponent === 0 && hi === 0 && lo === 0) return 0;
	return sign * (hi * Math.pow(2, 32) + lo) * Math.pow(2, exponent - 16383 - 63);
}
function parseAiff(arrayBuffer) {
	const dv = new DataView(arrayBuffer);
	if (dv.getUint32(0, false) !== 1179603533) throw new Error("Not a FORM/AIFF file");
	const formType = dv.getUint32(8, false);
	if (formType !== 1095321158 && formType !== 1095321155) throw new Error("FORM file is not AIFF/AIFC");
	let pos = 12;
	let comm = null;
	let ssndDataStart = -1;
	let ssndDataLen = 0;
	while (pos + 8 <= dv.byteLength) {
		const id = dv.getUint32(pos, false);
		const size = dv.getUint32(pos + 4, false);
		const body = pos + 8;
		if (id === 1129270605) {
			const numChannels = dv.getUint16(body, false);
			const numSampleFrames = dv.getUint32(body + 2, false);
			const bitsPerSample = dv.getUint16(body + 6, false);
			const sampleRate = Math.round(readExtendedFloat80(dv, body + 8));
			let compressionType = "NONE";
			if (formType === 1095321155 && size >= 22) {
				const c = dv.getUint32(body + 18, false);
				compressionType = String.fromCharCode(c >>> 24 & 255, c >>> 16 & 255, c >>> 8 & 255, c & 255);
			}
			comm = {
				numChannels,
				numSampleFrames,
				bitsPerSample,
				sampleRate,
				compressionType
			};
		} else if (id === 1397968452) {
			const dataOffset = dv.getUint32(body, false);
			ssndDataStart = body + 8 + dataOffset;
			ssndDataLen = size - 8 - dataOffset;
		}
		pos = body + size + size % 2;
	}
	if (!comm) throw new Error("AIFF file has no COMM chunk");
	if (ssndDataStart < 0) throw new Error("AIFF file has no SSND chunk");
	const { numChannels, bitsPerSample, sampleRate, compressionType } = comm;
	const littleEndian = compressionType === "sowt";
	if (compressionType !== "NONE" && compressionType !== "sowt" && compressionType !== "\0\0\0\0") throw new Error(`Compressed AIFF-C (${compressionType}) is not supported`);
	const bytesPerSample = Math.ceil(bitsPerSample / 8);
	ssndDataLen = Math.min(ssndDataLen, dv.byteLength - ssndDataStart);
	const frameCount = Math.floor(ssndDataLen / (bytesPerSample * numChannels));
	const channels = Array.from({ length: numChannels }, () => new Float32Array(frameCount));
	let readSample;
	if (bitsPerSample === 16) readSample = (off) => dv.getInt16(off, littleEndian) / 32768;
	else if (bitsPerSample === 24) readSample = (off) => {
		let b0, b1, b2;
		if (littleEndian) {
			b0 = dv.getUint8(off);
			b1 = dv.getUint8(off + 1);
			b2 = dv.getUint8(off + 2);
		} else {
			b2 = dv.getUint8(off);
			b1 = dv.getUint8(off + 1);
			b0 = dv.getUint8(off + 2);
		}
		let v = b0 | b1 << 8 | b2 << 16;
		if (v & 8388608) v -= 16777216;
		return v / 8388608;
	};
	else if (bitsPerSample === 32) readSample = (off) => dv.getInt32(off, littleEndian) / 2147483648;
	else if (bitsPerSample === 8) readSample = (off) => dv.getInt8(off) / 128;
	else throw new Error(`Unsupported AIFF bit depth: ${bitsPerSample}`);
	for (let f = 0; f < frameCount; f++) {
		const frameOff = ssndDataStart + f * bytesPerSample * numChannels;
		for (let c = 0; c < numChannels; c++) channels[c][f] = readSample(frameOff + c * bytesPerSample);
	}
	return makeBufferLike(sampleRate, channels);
}
//#endregion
export { parseAiff as n, parseWav as r, encodeWav as t };
