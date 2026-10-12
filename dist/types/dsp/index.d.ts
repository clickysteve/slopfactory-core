/** Output processing (continuous, live and offline) and sample transformations (whole-sample). */
export { cleanFx, DRIVE_SHAPES, FX_PRESETS, fxLabel, isClean, matchPreset, OUTPUT_STAGE_MODES, repairFx } from './output/settings';
export type { CrunchSettings, DriveSettings, FxPreset, OutputFxSettings, OutputStageSettings, ToneSettings } from './output/settings';
export { createChain, OutputFxStream, processBuffers, SETTINGS_FADE } from './output/stream';
export { createOutputFxNode, loadOutputFx, outputFxAvailable } from './output/node';
export type { OutputFxNode } from './output/node';
export { OUTPUT_FX_PROCESSOR } from './output/constants';
export { identityTransform, isIdentity, MACRO_INFO, repairTransform, stretchCharacters, toRecipe, transformKey } from './transform/settings';
export type { ReverseMode, SampleTransform } from './transform/settings';
export { applyTransform } from './transform/transform';
export type { AudioData } from './transform/transform';
export { syncRunner, TransformCache, WorkerTransformRunner } from './transform/cache';
export type { TransformRunner } from './transform/cache';
