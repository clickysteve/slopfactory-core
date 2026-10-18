/** Core's chain worklet (built to dist/chain-worklet.js): the processor with the built-in engines. */
import { BUILTIN_AUDIO_ENGINES } from './builtin';
import { registerChainProcessor } from './processor';

registerChainProcessor(BUILTIN_AUDIO_ENGINES);
