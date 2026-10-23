// Generates dist/sassdoc.json: the SassDoc data of src/styles, shipped so editor tooling can read it from node_modules.
//
// Usage: node scripts/sassdoc-json.mjs           (or: npm run build:sassdoc) writes dist/sassdoc.json
//
// Same data as `npm run docs:sassdoc`. Items are sorted by file and line, and file paths are relative to src/styles,
// so the output is deterministic and holds no absolute paths.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CORE_DIR, STYLES_DIR } from '../test/helpers.mjs';

const require = createRequire(import.meta.url);
const sassdoc = require('sassdoc');

const OUT_FILE = path.join(CORE_DIR, 'dist', 'sassdoc.json');

// Parses src/styles with the SassDoc Node API and returns the sorted items
export async function buildSassdocData() {
    const logger = { log() {}, debug() {}, warn() {}, error() {} };
    const env = sassdoc.ensureEnvironment({
        logger,
        package: JSON.parse(
            fs.readFileSync(path.join(CORE_DIR, 'package.json'), 'utf8')
        ),
    });
    const data = await sassdoc.parse(STYLES_DIR, env);
    for (const item of data) {
        const rel = path
            .relative(STYLES_DIR, path.resolve(STYLES_DIR, item.file.path))
            .split(path.sep)
            .join('/');
        item.file = { path: rel, name: path.basename(rel) };
    }
    return data.sort(
        (a, b) =>
            a.file.path.localeCompare(b.file.path, 'en') ||
            a.context.line.start - b.context.line.start
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const data = await buildSassdocData();
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2) + '\n');
    console.log(
        `sassdoc-json: wrote ${path.relative(CORE_DIR, OUT_FILE)} (${data.length} items)`
    );
}
