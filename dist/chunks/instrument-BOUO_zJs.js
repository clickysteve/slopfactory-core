//#region src/audio/instrument.ts
/** Ramp a gain to zero from whatever it is doing at `time`. */
function fadeOut(param, time, seconds, holdValue) {
	const p = param;
	if (typeof p.cancelAndHoldAtTime === "function") p.cancelAndHoldAtTime(time);
	else {
		param.cancelScheduledValues(time);
		param.setValueAtTime(holdValue, time);
	}
	param.linearRampToValueAtTime(0, time + Math.max(.001, seconds));
}
//#endregion
export { fadeOut as t };
