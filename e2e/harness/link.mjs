// Link node_modules/@slopfactory/core to this repository so the harness resolves the package
// through its package.json "exports", as an installed dependency would.
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scope = join(here, 'node_modules/@slopfactory');
mkdirSync(scope, { recursive: true });
rmSync(join(scope, 'core'), { recursive: true, force: true });
symlinkSync('../../../..', join(scope, 'core'), 'dir');
