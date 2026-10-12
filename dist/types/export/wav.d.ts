export declare function encodeWav16(channels: Float32Array[], sampleRate: number): Promise<Uint8Array>;
export interface LevelStats {
    /** largest absolute sample value (1.0 = full scale) */
    peak: number;
    /** peak in dBFS (-Infinity for silence) */
    peakDb: number;
    /** samples beyond full scale, which the 16-bit conversion clamps */
    clipped: number;
    /** RMS over all channels */
    rms: number;
    silent: boolean;
}
export declare function levelStats(channels: Float32Array[]): LevelStats;
export interface WavInfo {
    riffSize: number;
    format: number;
    channels: number;
    sampleRate: number;
    byteRate: number;
    blockAlign: number;
    bitsPerSample: number;
    dataOffset: number;
    dataBytes: number;
    frames: number;
}
/** Read a canonical WAV header (for verification; throws on anything else). */
export declare function wavInfo(bytes: Uint8Array): WavInfo;
