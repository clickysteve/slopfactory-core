//#region src/events/timeline.ts
function constantTempo(bpm, ppq) {
	return {
		ppq,
		changes: [{
			tick: 0,
			bpm
		}]
	};
}
/** Validate and normalise a tempo map (sorted, starting at 0, positive tempos). */
function normaliseTempo(map) {
	if (!(map.ppq > 0) || !Number.isFinite(map.ppq)) throw new RangeError("ppq must be a positive number");
	const changes = map.changes.filter((c) => Number.isFinite(c.tick) && Number.isFinite(c.bpm) && c.bpm > 0).map((c) => ({
		tick: Math.max(0, Math.round(c.tick)),
		bpm: c.bpm
	})).sort((a, b) => a.tick - b.tick);
	if (!changes.length) throw new RangeError("a tempo map needs at least one tempo");
	if (changes[0].tick !== 0) changes.unshift({
		tick: 0,
		bpm: changes[0].bpm
	});
	const out = [];
	for (const c of changes) if (out.length && out[out.length - 1].tick === c.tick) out[out.length - 1] = c;
	else out.push(c);
	return {
		ppq: map.ppq,
		changes: out
	};
}
/**
* Converts ticks to seconds and frames for one tempo map. Segment start times are computed
* once from exact tick differences; each conversion is then a single multiply-add.
*/
var TimeMap = class {
	tempo;
	starts;
	constructor(tempo) {
		this.tempo = normaliseTempo(tempo);
		const ch = this.tempo.changes;
		this.starts = [0];
		for (let i = 1; i < ch.length; i++) this.starts.push(this.starts[i - 1] + (ch[i].tick - ch[i - 1].tick) * this.secondsPerTick(i - 1));
	}
	secondsPerTick(i) {
		return 60 / (this.tempo.changes[i].bpm * this.tempo.ppq);
	}
	segment(tick) {
		const ch = this.tempo.changes;
		let lo = 0;
		let hi = ch.length - 1;
		while (lo < hi) {
			const mid = lo + hi + 1 >> 1;
			if (ch[mid].tick <= tick) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	}
	seconds(tick) {
		const i = this.segment(tick);
		return this.starts[i] + (tick - this.tempo.changes[i].tick) * this.secondsPerTick(i);
	}
	/** Sample frame of a tick (rounded to the nearest frame). */
	frame(tick, sampleRate) {
		return Math.round(this.seconds(tick) * sampleRate);
	}
	/** The tick at a time (fractional). */
	tick(seconds) {
		let i = this.starts.length - 1;
		while (i > 0 && this.starts[i] > seconds) i--;
		return this.tempo.changes[i].tick + (seconds - this.starts[i]) / this.secondsPerTick(i);
	}
	bpmAt(tick) {
		return this.tempo.changes[this.segment(tick)].bpm;
	}
};
var TYPE_ORDER = {
	control: 0,
	note: 1
};
/**
* Canonical order: by tick, then controls before notes at the same tick, then by voice id,
* then pitch. Stable, so events that compare equal keep their input order.
*/
function sortEvents(events) {
	return events.map((e, i) => ({
		e,
		i
	})).sort((a, b) => a.e.tick - b.e.tick || TYPE_ORDER[a.e.type] - TYPE_ORDER[b.e.type] || (a.e.voice < b.e.voice ? -1 : a.e.voice > b.e.voice ? 1 : 0) || ("pitch" in a.e && "pitch" in b.e ? a.e.pitch - b.e.pitch : 0) || a.i - b.i).map((x) => x.e);
}
/** Problems that would make a timeline unrenderable (empty list = fine). */
function validateTimeline(t) {
	const out = [];
	const voices = new Set(t.voices.map((v) => v.id));
	if (voices.size !== t.voices.length) out.push({
		index: -1,
		message: "voice ids must be unique"
	});
	try {
		normaliseTempo(t.tempo);
	} catch (e) {
		out.push({
			index: -1,
			message: e.message
		});
	}
	if (!Number.isInteger(t.length) || t.length < 0) out.push({
		index: -1,
		message: "length must be a whole number of ticks"
	});
	t.events.forEach((e, i) => {
		if (!Number.isInteger(e.tick) || e.tick < 0) out.push({
			index: i,
			message: "tick must be a whole number >= 0"
		});
		if (!voices.has(e.voice)) out.push({
			index: i,
			message: `unknown voice "${e.voice}"`
		});
		if (i > 0 && e.tick < t.events[i - 1].tick) out.push({
			index: i,
			message: "events are not sorted"
		});
		if (e.type === "note") {
			if (!Number.isInteger(e.duration) || e.duration < 1) out.push({
				index: i,
				message: "duration must be a whole number >= 1"
			});
			if (!(e.pitch >= 0 && e.pitch <= 127)) out.push({
				index: i,
				message: "pitch out of range"
			});
			if (!(e.velocity >= 1 && e.velocity <= 127)) out.push({
				index: i,
				message: "velocity out of range"
			});
		} else if (!(e.value >= 0 && e.value <= 127) || !(e.controller >= 0 && e.controller <= 127)) out.push({
			index: i,
			message: "controller or value out of range"
		});
	});
	return out;
}
/** The last tick anything sounds until (note ends included). */
function lastTick(t) {
	let end = t.length;
	for (const e of t.events) end = Math.max(end, e.type === "note" ? e.tick + e.duration : e.tick);
	return end;
}
/** Events of selected voices only (for rendering one stem). */
function eventsForVoices(t, voices) {
	return t.events.filter((e) => voices.has(e.voice));
}
/**
* Turns a MIDI-style stream of note-ons and note-offs into notes with durations, with MIDI
* pairing semantics: a note-off ends the most recent note-on with the same pairing key
* (normally channel and pitch), and a note-on for a key that is still sounding first ends
* the sounding note. Notes still open when `close(tick)` is called end there.
*/
var NotePairer = class {
	open = /* @__PURE__ */ new Map();
	notes = [];
	on(key, note) {
		this.off(key, note.tick);
		const n = {
			type: "note",
			duration: 1,
			...note
		};
		this.open.set(key, n);
		this.notes.push(n);
	}
	off(key, tick) {
		const n = this.open.get(key);
		if (!n) return;
		this.open.delete(key);
		n.duration = Math.max(1, tick - n.tick);
	}
	close(tick) {
		for (const key of [...this.open.keys()]) this.off(key, tick);
		return this.notes;
	}
};
//#endregion
export { lastTick as a, validateTimeline as c, eventsForVoices as i, TimeMap as n, normaliseTempo as o, constantTempo as r, sortEvents as s, NotePairer as t };
