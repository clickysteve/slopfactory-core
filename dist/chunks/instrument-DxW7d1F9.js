//#region src/audio/instrument.ts
/**
* A record of what was scheduled on a gain AudioParam (jumps and linear ramps), so the level at
* any time can be computed. The browser cannot be asked for a future automation value, and
* `cancelAndHoldAtTime` only inserts a hold point when a ramp is in progress, so a fade
* scheduled ahead needs to know where to start from.
*/
var GainEnvelope = class {
	pts = [];
	/** As `setValueAtTime(v, t)`. */
	set(t, v) {
		this.pts.push({
			t,
			v,
			ramp: false
		});
		return this;
	}
	/** As `linearRampToValueAtTime(v, t)`. */
	ramp(t, v) {
		this.pts.push({
			t,
			v,
			ramp: true
		});
		return this;
	}
	/** As `cancelScheduledValues(t)`: forget everything at or after `t`. */
	cancel(t) {
		this.pts = this.pts.filter((p) => p.t < t);
		return this;
	}
	/** The scheduled level at time `t` (0 before anything was scheduled). */
	at(t) {
		let i = -1;
		for (let k = 0; k < this.pts.length && this.pts[k].t <= t; k++) i = k;
		const next = this.pts[i + 1];
		if (i < 0) return next?.ramp ? 0 : 0;
		const a = this.pts[i];
		if (next && next.ramp && next.t > a.t) return a.v + (next.v - a.v) * (t - a.t) / (next.t - a.t);
		return a.v;
	}
};
/**
* Ramp a gain to zero, linearly over `seconds`, starting at `time` from the level it has then.
* `level` is either that level or the note's GainEnvelope (which is updated to include the
* fade). The fade is anchored with an explicit value at `time`, so it starts at `time` even when
* it is scheduled long in advance.
*/
function fadeOut(param, time, seconds, level) {
	const v = typeof level === "number" ? level : level.at(time);
	const end = time + Math.max(.001, seconds);
	const p = param;
	if (typeof p.cancelAndHoldAtTime === "function") p.cancelAndHoldAtTime(time);
	else param.cancelScheduledValues(time);
	param.setValueAtTime(v, time);
	param.linearRampToValueAtTime(0, end);
	if (typeof level !== "number") level.cancel(time).set(time, v).ramp(end, 0);
}
//#endregion
export { fadeOut as n, GainEnvelope as t };
