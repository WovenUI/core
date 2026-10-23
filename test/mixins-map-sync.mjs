// Checks that src/styles/mixins-map.scss and mixins-map.json match a fresh run of the generator.
//
// Usage: node test/mixins-map-sync.mjs
//
// The generator is build.js in the WovenUI tools repository, checked out next to core (../tools/build.js). It writes
// next to the styles it scans, so it runs on a temporary copy of src/styles and the repository files are never
// overwritten. Exits with code 1 when either file differs; re-generate with `node ../tools/build.js`. Without the
// tools checkout (a standalone clone or CI) the check is skipped with a notice and exits with code 0.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CORE_DIR, STYLES_DIR } from './helpers.mjs';

const GENERATOR = path.resolve(CORE_DIR, '..', 'tools', 'build.js');
const FILES = ['mixins-map.scss', 'mixins-map.json'];

if (!fs.existsSync(GENERATOR)) {
    console.log(
        `skip  mixins-map: generator not found at ${GENERATOR} (check out the WovenUI tools repository next to core to run this check)`
    );
    process.exit(0);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wovenui-mixins-map-'));
let failed = false;
try {
    // Same layout as the workspace: the generator resolves ../core/src/styles from its own directory
    const styles = path.join(temp, 'core', 'src', 'styles');
    fs.cpSync(STYLES_DIR, styles, { recursive: true });
    fs.mkdirSync(path.join(temp, 'tools'));
    const generator = path.join(temp, 'tools', 'build.js');
    fs.copyFileSync(GENERATOR, generator);
    // Generator errors go to stderr, so a crash is visible instead of a bare file mismatch
    execFileSync(process.execPath, [generator], {
        stdio: ['ignore', 'ignore', 'inherit'],
    });

    for (const file of FILES) {
        const expected = fs.readFileSync(path.join(styles, file), 'utf8');
        const actual = fs.readFileSync(path.join(STYLES_DIR, file), 'utf8');
        if (expected !== actual) {
            failed = true;
            console.log(
                `FAIL  src/styles/${file} differs from the generator output; run node ../tools/build.js`
            );
        } else {
            console.log(`pass  src/styles/${file} matches the generator`);
        }
    }
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}

if (failed) {
    process.exit(1);
}
console.log('mixins-map: in sync');
