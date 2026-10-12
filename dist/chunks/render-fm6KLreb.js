import { n as TimeMap } from "./timeline-CjtGBLYv.js";
import { n as loadOutputFx } from "./node-BcQT94Xh.js";
import { n as NotePlayer, r as Mixer } from "./player-B8Zoz9_C.js";
//#region src/render/offline.ts
/**
* Offline rendering of a Timeline to a master mix and isolated, sample-aligned stems.
*
* The same Mixer, NotePlayer, instruments and output-processor worklet as live playback run
* in an OfflineAudioContext. Each requested output (master, or one voice's stem) becomes two
* channels of one multichannel render, so every output shares frame 0 = tick 0, the same
* length (music plus a common tail) and the same sample rate by construction. A render too big
* for the memory budget is split into several renders of whole outputs; each starts from frame
* 0 with the same events, so alignment is unchanged.
*
* Notes are scheduled in chunks at suspend() points, which also report progress and allow
* cancellation. Nothing here touches a live AudioContext, a transport or MIDI.
*/
var EXPORT_SAMPLE_RATE = 44100;
var MAX_RENDER_SECONDS = 1200;
var MAX_CONTEXT_CHANNELS = 32;
var RenderCancelled = class extends Error {
	constructor() {
		super("Render cancelled.");
		this.name = "RenderCancelled";
	}
};
/** Split outputs into groups of at most `maxOutputs` (each output is two channels). */
function planRenders(outputs, frames, memoryBudget) {
	const perOutput = frames * 2 * 4;
	const maxOutputs = Math.max(1, Math.min(MAX_CONTEXT_CHANNELS / 2, Math.floor(memoryBudget / Math.max(1, perOutput))));
	const groups = [];
	for (let i = 0; i < outputs.length; i += maxOutputs) groups.push(outputs.slice(i, i + maxOutputs));
	return groups;
}
function renderLength(timeline, tailSeconds, sampleRate) {
	const musicSeconds = new TimeMap(timeline.tempo).seconds(timeline.length);
	return {
		musicSeconds,
		frames: Math.max(1, Math.ceil((musicSeconds + Math.max(0, tailSeconds)) * sampleRate))
	};
}
async function renderTimeline(req) {
	const sr = req.sampleRate ?? 44100;
	const { frames, musicSeconds } = renderLength(req.timeline, req.tailSeconds, sr);
	if (frames / sr > 1200) throw new RangeError(`The render would be ${Math.round(frames / sr)} s long; the limit is ${MAX_RENDER_SECONDS / 60} minutes.`);
	const voiceIds = new Set(req.timeline.voices.map((v) => v.id));
	for (const s of req.stems) if (!voiceIds.has(s.voice)) throw new Error(`unknown voice "${s.voice}"`);
	const outputs = [...req.master ? [{
		kind: "master",
		processed: true
	}] : [], ...req.stems.map((s) => ({
		kind: "stem",
		voice: s.voice,
		processed: s.processed
	}))];
	if (!outputs.length) throw new Error("Nothing to render: choose the master, stems or both.");
	const groups = planRenders(outputs, frames, req.memoryBudget ?? 402653184);
	const results = [];
	let processed = true;
	for (let g = 0; g < groups.length; g++) {
		const r = await renderGroup(req, groups[g], frames, sr, (f) => req.onProgress?.((g + f) / groups.length));
		processed &&= r.processed;
		results.push(...r.outputs);
	}
	req.onProgress?.(1);
	return {
		sampleRate: sr,
		frames,
		seconds: frames / sr,
		musicSeconds,
		outputs: results,
		renders: groups.length,
		processed
	};
}
async function renderGroup(req, group, frames, sr, progress) {
	if (req.signal?.aborted) throw new RenderCancelled();
	const channels = group.length * 2;
	const needsAll = group.some((o) => o.kind === "master");
	const latency = needsAll && req.masterInsert ? Math.max(0, Math.round(req.masterLatencyFrames ?? 0)) : 0;
	const pre = Math.ceil(Math.max(0, req.preRollSeconds ?? 0) * sr / 128) * 128;
	const t0 = pre / sr;
	const length = pre + frames + latency;
	const ctx = req.createContext ? req.createContext(channels, length, sr) : new OfflineAudioContext({
		numberOfChannels: channels,
		length,
		sampleRate: sr
	});
	const fxAvailable = req.fxModuleUrl ? await loadOutputFx(ctx, req.fxModuleUrl) : false;
	const needed = new Set(needsAll ? req.timeline.voices.map((v) => v.id) : group.map((o) => o.voice));
	const mixer = new Mixer(ctx, {
		voices: req.timeline.voices.map((v) => v.id),
		strips: req.strips,
		masterFx: req.masterFx,
		masterGain: req.masterGain,
		fxAvailable,
		seed: req.fxSeed,
		dryTaps: group.some((o) => o.kind === "stem" && !o.processed)
	});
	const merger = ctx.createChannelMerger(channels);
	merger.channelInterpretation = "discrete";
	const masterOut = needsAll && req.masterInsert ? req.masterInsert(ctx, mixer.output) : mixer.output;
	group.forEach((o, k) => {
		const split = ctx.createChannelSplitter(2);
		(o.kind === "master" ? masterOut : o.processed ? mixer.processedTap(o.voice) : mixer.dryTap(o.voice)).connect(split);
		split.connect(merger, 0, 2 * k);
		split.connect(merger, 1, 2 * k + 1);
	});
	ctx.destination.channelCount = channels;
	ctx.destination.channelCountMode = "explicit";
	ctx.destination.channelInterpretation = "discrete";
	merger.connect(ctx.destination);
	if (pre) mixer.resetFx(t0);
	const player = new NotePlayer(ctx, mixer, req.resolve, {
		maxPerVoice: req.maxPerVoice,
		choke: req.choke
	});
	const tm = new TimeMap(req.timeline.tempo);
	const events = req.choke ? req.timeline.events : req.timeline.events.filter((e) => needed.has(e.voice));
	let next = 0;
	let cancelled = false;
	const schedule = (until) => {
		while (next < events.length) {
			const e = events[next];
			const t = t0 + tm.seconds(e.tick);
			if (t >= until) break;
			next++;
			if (cancelled) continue;
			if (e.type === "note") {
				const n = e;
				const note = {
					time: t,
					pitch: n.pitch,
					velocity: n.velocity,
					channel: n.channel,
					instrument: n.instrument
				};
				if (!needed.has(n.voice)) {
					player.chokeOnly(n.voice, note);
					continue;
				}
				const key = `n${next}`;
				player.noteOn(key, n.voice, note);
				player.noteOff(key, t0 + tm.seconds(n.tick + n.duration));
			} else if (needed.has(e.voice)) req.onControl?.(e, t, mixer);
		}
	};
	const quantum = 128 / sr;
	const chunk = Math.max(quantum * 4, Math.floor((req.chunkSeconds ?? 2) / quantum) * quantum);
	const total = length / sr;
	schedule(chunk);
	for (let T = chunk; T < total - quantum; T += chunk) {
		const at = T;
		ctx.suspend(at).then(() => {
			if (req.signal?.aborted && !cancelled) {
				cancelled = true;
				mixer.output.disconnect();
				masterOut.disconnect();
				for (const o of group) if (o.kind === "stem") (o.processed ? mixer.processedTap(o.voice) : mixer.dryTap(o.voice)).disconnect();
			}
			schedule(at + chunk);
			progress(Math.min(1, at / total));
			ctx.resume();
		});
	}
	const buf = await ctx.startRendering();
	mixer.dispose();
	if (cancelled || req.signal?.aborted) throw new RenderCancelled();
	return {
		processed: fxAvailable,
		outputs: group.map((o, k) => {
			const from = pre + (o.kind === "master" ? latency : 0);
			return {
				...o,
				channels: [buf.getChannelData(2 * k).slice(from, from + frames), buf.getChannelData(2 * k + 1).slice(from, from + frames)]
			};
		})
	};
}
//#endregion
export { renderLength as a, planRenders as i, MAX_RENDER_SECONDS as n, renderTimeline as o, RenderCancelled as r, EXPORT_SAMPLE_RATE as t };
