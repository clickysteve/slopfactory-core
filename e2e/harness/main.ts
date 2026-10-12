/**
 * Browser test harness. Imports the built package by its name, exactly as an application
 * does (the build step links node_modules/@slopfactory/core to this repository), and exposes
 * it to Playwright as `window.core`, with the URLs of the two runtime files.
 */
import * as core from '@slopfactory/core';
import * as events from '@slopfactory/core/events';
import * as audio from '@slopfactory/core/audio';
import * as sampler from '@slopfactory/core/sampler';
import * as dsp from '@slopfactory/core/dsp';
import * as render from '@slopfactory/core/render';
import * as exp from '@slopfactory/core/export';
import * as storage from '@slopfactory/core/storage';
import workletUrl from '@slopfactory/core/output-fx-worklet.js?url';
import workerUrl from '@slopfactory/core/transform-worker.js?url';

Object.assign(window, { core, modules: { events, audio, sampler, dsp, render, export: exp, storage }, workletUrl, workerUrl });
document.getElementById('status')!.textContent = 'ready';
