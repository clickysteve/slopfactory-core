//#region src/dsp/output/constants.ts
/** The AudioWorklet processor name registered by worklet.ts. */
var OUTPUT_FX_PROCESSOR = "slopfactory-output-fx";
//#endregion
//#region src/dsp/output/node.ts
/**
* Output-processor nodes for any BaseAudioContext (live or offline).
*
* `loadOutputFx(ctx, moduleUrl)` registers the worklet once per context. The module URL comes
* from the application's bundler (for Vite: `import url from '.../worklet.ts?worker&url'`), so
* Core itself makes no assumption about how it is served.
*
* Without AudioWorklet (an insecure context or an old browser) `createOutputFxNode` returns a
* plain stereo pass-through and reports `processing: false`, so audio still plays, unprocessed.
*/
var loaded = /* @__PURE__ */ new WeakMap();
function loadOutputFx(ctx, moduleUrl) {
	let p = loaded.get(ctx);
	if (!p) {
		p = (async () => {
			try {
				if (!ctx.audioWorklet) return false;
				await ctx.audioWorklet.addModule(moduleUrl);
				return true;
			} catch {
				return false;
			}
		})();
		loaded.set(ctx, p);
	}
	return p;
}
async function outputFxAvailable(ctx) {
	return await loaded.get(ctx) ?? false;
}
/**
* `available` must be the resolved result of loadOutputFx for this context. `resetAt` (context
* seconds) restarts the processor's state at that time; given here it is part of the node's
* construction, so it cannot arrive late the way a `reset()` message can in a fast offline
* render.
*/
function createOutputFxNode(ctx, settings, seed, available, resetAt) {
	if (available && typeof AudioWorkletNode !== "undefined") {
		const node = new AudioWorkletNode(ctx, OUTPUT_FX_PROCESSOR, {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			outputChannelCount: [2],
			channelCount: 2,
			channelCountMode: "explicit",
			channelInterpretation: "speakers",
			processorOptions: {
				settings,
				seed,
				...resetAt !== void 0 ? { resetAt } : {}
			}
		});
		const h = {
			node,
			processing: true,
			settings,
			set(s) {
				h.settings = s;
				node.port.postMessage({
					type: "settings",
					settings: s
				});
			},
			reset(at) {
				node.port.postMessage({
					type: "reset",
					at
				});
			},
			dispose() {
				node.disconnect();
				node.port.close();
			}
		};
		return h;
	}
	const g = ctx.createGain();
	g.channelCount = 2;
	g.channelCountMode = "explicit";
	g.channelInterpretation = "speakers";
	return {
		node: g,
		processing: false,
		settings,
		set(s) {
			this.settings = s;
		},
		reset() {},
		dispose() {
			g.disconnect();
		}
	};
}
//#endregion
export { OUTPUT_FX_PROCESSOR as i, loadOutputFx as n, outputFxAvailable as r, createOutputFxNode as t };
