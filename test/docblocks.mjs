// Doc block checker: every public item has a valid SassDoc block, every file poster is valid, and every @example compiles.
//
// Usage: node test/docblocks.mjs [file ...] [--no-compile]
//   file          paths relative to src/styles, such as utilities/_spacing.scss (default: every file); only problems
//                 in these files are reported, but every file is parsed so @see references resolve
//   --no-compile  check the format only
//
// Format: docs/DOC-BLOCKS.md. Public items are the mixins, functions and variables that index.scss exports (read with
// sass:meta), except the apply() registry functions of mixins-map.scss, which stand for the mixins of the same name.
// SassDoc (sassdoc.Parser) parses every file; any SassDoc warning is a problem. A raw line scan checks the layout
// rules SassDoc does not enforce. Examples are compiled after `@use "index" as *;` and must not warn; examples of
// deprecated items may raise their deprecation warning. Exits with code 1 on any problem.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as sass from 'sass';
import { CORE_DIR, STYLES_DIR, compileSource } from './helpers.mjs';
import { buildSassdocData } from '../scripts/sassdoc-json.mjs';

const require = createRequire(import.meta.url);
const sassdoc = require('sassdoc');

const args = process.argv.slice(2);
const noCompile = args.includes('--no-compile');
const only = args.filter((arg) => !arg.startsWith('--'));

// Entry files hold no items; a poster there uses the group "entry"
const ENTRY_FILES = ['index.scss', 'mixins/index.scss', 'build.scss'];
// Tags allowed in an item block, in the required order, and the item kinds that may use them
const TAG_ORDER = [
    'type',
    'param',
    'content',
    'return',
    'output',
    'example',
    'deprecated',
    'link',
    'see',
];
const TAG_KINDS = {
    type: ['variable'],
    param: ['mixin', 'function'],
    content: ['mixin'],
    return: ['function'],
    output: ['mixin'],
    example: ['mixin', 'function', 'variable'],
    deprecated: ['mixin', 'function', 'variable'],
    link: ['mixin'],
    see: ['mixin', 'function', 'variable'],
};
const PARAM_TYPES = [
    'Number',
    'String',
    'Length',
    'Color',
    'Map',
    'List',
    'Boolean',
    'Null',
    'Any',
    'Duration',
    'Percentage',
    'Calculation',
];
const VARIABLE_TYPES = [
    'Map',
    'List',
    'Number',
    'Length',
    'Color',
    'Boolean',
    'String',
];
const STALE = /todo: doc|SKIP Documentation|todo: add to doc|Removal in v2/i;
const BANNED = /[—→\u{1F680}]/u;
const ITEM_LINE = /^(?:@(mixin|function)\s+([\w-]+)|\$([\w-]+)\s*:)/;

const problems = [];
const stats = { public: 0, documented: 0, examples: 0, failed: 0 };

function report(file, text) {
    if (file && only.length && !only.includes(file)) {
        return;
    }
    if (!file && only.length) {
        return;
    }
    problems.push({ file, text });
}

// Public mixin, function and variable names exported by index.scss
function publicNames() {
    const found = {};
    sass.compileString(
        '@use "sass:map";\n@use "sass:meta";\n@use "index" as nu;\n' +
            '@debug "MIXINS " + meta.inspect(map.keys(meta.module-mixins("nu")));\n' +
            '@debug "FUNCTIONS " + meta.inspect(map.keys(meta.module-functions("nu")));\n' +
            '@debug "VARIABLES " + meta.inspect(map.keys(meta.module-variables("nu")));\n',
        {
            loadPaths: [STYLES_DIR],
            logger: {
                debug(message) {
                    const [kind, ...rest] = message.split(' ');
                    found[kind] = rest
                        .join(' ')
                        .split(', ')
                        .map((name) => name.trim().replace(/^"|"$/g, ''));
                },
                warn() {},
            },
        }
    );
    const registry = fs.readFileSync(
        path.join(STYLES_DIR, 'mixins-map.scss'),
        'utf8'
    );
    const wrappers = new Set(
        [...registry.matchAll(/@function ([\w-]+)\(\$a\.\.\.\)/g)].map(
            (match) => match[1]
        )
    );
    return {
        mixin: new Set(found.MIXINS),
        function: new Set(
            found.FUNCTIONS.filter((name) => !wrappers.has(name))
        ),
        variable: new Set(found.VARIABLES),
    };
}

function scssFiles(dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...scssFiles(full));
        } else if (entry.name.endsWith('.scss')) {
            files.push(full);
        }
    }
    return files.sort();
}

// Group a file's poster must name
function expectedGroup(rel) {
    if (ENTRY_FILES.includes(rel)) {
        return 'entry';
    }
    if (rel === 'mixins-map.scss') {
        return 'apply';
    }
    const [folder] = rel.split('/');
    const base = path.basename(rel, '.scss').replace(/^_/, '');
    return (
        {
            config: 'config',
            functions: 'functions',
            themes: 'themes',
            base: 'base',
        }[folder] ?? base
    );
}

// Top-level parameters ({ name, default }) of a signature that may span several lines
function signatureParams(text) {
    const open = text.indexOf('(');
    const brace = text.indexOf('{');
    if (open < 0 || (brace >= 0 && brace < open)) {
        return [];
    }
    const params = [];
    let depth = 0;
    let current = '';
    for (let i = open + 1; i < text.length; i++) {
        const char = text[i];
        if (char === '(') {
            depth++;
        } else if (char === ')') {
            if (depth === 0) {
                params.push(current);
                break;
            }
            depth--;
        } else if (char === ',' && depth === 0) {
            params.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    return params
        .map((param) => {
            const match = param
                .trim()
                .match(/^(\$[\w-]+)(?:\.\.\.)?(?:\s*:\s*([\s\S]+))?$/);
            return match
                ? {
                      name: match[1],
                      default: match[2]?.replace(/\s+/g, ' ').trim(),
                  }
                : null;
        })
        .filter(Boolean);
}

// Text of a top-level variable declaration, up to its closing semicolon
function declaration(lines, index) {
    let text = '';
    let depth = 0;
    for (let j = index; j < lines.length; j++) {
        const line = lines[j].replace(/\s\/\/.*$/, '');
        text += `${line}\n`;
        depth += (line.match(/\(/g) || []).length;
        depth -= (line.match(/\)/g) || []).length;
        if (depth <= 0 && /;\s*$/.test(line)) {
            break;
        }
    }
    return text;
}

// Splits a block line into its body: null for a bare `///`
function body(line) {
    return line === '///' ? null : line.slice(4);
}

// Description lines (item blocks and posters): paragraphs separated by one bare line; each paragraph is one line,
// or a markdown list (lines starting with "- "), or a fenced code block
function checkParagraphs(lines, where, rel) {
    let fenced = false;
    let previous = null;
    for (const text of lines) {
        if (text !== null && /^```/.test(text)) {
            fenced = !fenced;
        }
        if (fenced || (text !== null && /^```/.test(text))) {
            previous = text ?? '';
            continue;
        }
        if (text === null) {
            if (previous === null) {
                report(rel, `${where}: two bare comment lines in a row`);
            }
        } else if (
            previous !== null &&
            previous !== '' &&
            !(/^- /.test(text) && /^- /.test(previous)) &&
            !/^```/.test(previous)
        ) {
            report(
                rel,
                `${where}: a paragraph is one line (or a "- " list); separate paragraphs with a bare comment line: "${text}"`
            );
        }
        previous = text;
    }
    if (fenced) {
        report(rel, `${where}: unclosed fenced code block`);
    }
}

// Checks the poster run (lines start..end inclusive)
function checkPoster(lines, start, end, rel, hasPublic) {
    const where = `${rel}:${start + 1} poster`;
    const group = expectedGroup(rel);
    if (!hasPublic && !ENTRY_FILES.includes(rel)) {
        report(
            rel,
            `${where}: a file without public items has no poster (use // comments)`
        );
        return;
    }
    if (lines[start] !== '////' || lines[end] !== '////' || end - start < 2) {
        report(
            rel,
            `${where}: a poster opens and closes with a bare //// line`
        );
        return;
    }
    if (lines[start + 1] !== `//// @group ${group}`) {
        report(
            rel,
            `${where}: second line must be "//// @group ${group}" (got "${lines[start + 1]}")`
        );
    }
    const text = [];
    for (let j = start + 2; j < end; j++) {
        const line = lines[j];
        if (line !== '////' && !line.startsWith('//// ')) {
            report(
                rel,
                `${rel}:${j + 1}: poster lines are "////" or "//// text"`
            );
            continue;
        }
        const content = line === '////' ? null : line.slice(5);
        if (content !== null && content.startsWith('@')) {
            report(
                rel,
                `${rel}:${j + 1}: tag or unindented @ line in the poster (only @group is allowed; indent code lines): ${line}`
            );
        }
        text.push(content);
    }
    if (!text.length || text[0] === null) {
        report(
            rel,
            `${where}: the group description starts on the line after @group`
        );
    }
    if (text.length && text[text.length - 1] === null) {
        report(rel, `${where}: bare //// line before the closing line`);
    }
    checkParagraphs(text, where, rel);
}

// Parses an item block into description lines and tags; reports layout problems
function parseBlock(block, kind, where, rel) {
    const description = [];
    const tags = [];
    let current = null;
    block.forEach((line, i) => {
        const text = body(line);
        const next = i + 1 < block.length ? body(block[i + 1]) : undefined;
        if (text !== null && text.startsWith('@')) {
            const match = text.match(/^@([a-z-]+)\b ?(.*)$/);
            current = {
                tag: match ? match[1] : text,
                text: match ? match[2] : '',
                lines: [],
            };
            tags.push(current);
            const inExample =
                tags.length > 1 && tags[tags.length - 2].tag === 'example';
            if (!TAG_ORDER.includes(current.tag) && inExample) {
                report(
                    rel,
                    `${where}: example code line not indented two spaces, read as tag @${current.tag}: ${line}`
                );
            } else if (!TAG_ORDER.includes(current.tag)) {
                report(
                    rel,
                    `${where}: forbidden tag @${current.tag} (allowed: ${TAG_ORDER.map((tag) => `@${tag}`).join(', ')})`
                );
            } else if (!TAG_KINDS[current.tag].includes(kind)) {
                report(
                    rel,
                    `${where}: @${current.tag} is not allowed on a ${kind}`
                );
            }
            return;
        }
        if (!current) {
            if (i === 0 && text === null) {
                report(
                    rel,
                    `${where}: the block starts with the description, not a bare line`
                );
            }
            if (
                text === null &&
                next !== undefined &&
                next !== null &&
                next.startsWith('@')
            ) {
                report(rel, `${where}: bare line before a tag`);
            }
            description.push(text);
            return;
        }
        if (current.tag === 'example') {
            if (text === null) {
                if (
                    next === undefined ||
                    next === null ||
                    !next.startsWith('  ')
                ) {
                    report(
                        rel,
                        `${where}: bare line inside an example must sit between code lines`
                    );
                }
                current.lines.push('');
            } else if (!text.startsWith('  ')) {
                report(
                    rel,
                    `${where}: example code line not indented two spaces ("///   code"): ${line}`
                );
            } else {
                current.lines.push(text.slice(2));
            }
            return;
        }
        report(
            rel,
            `${where}: continuation line under @${current.tag} (tags are one line): ${line}`
        );
    });
    if (
        !description.length ||
        description[0] === null ||
        !description[0].trim()
    ) {
        report(rel, `${where}: needs a description as the first line`);
    } else {
        checkParagraphs(description, where, rel);
        if (/[.!?]\s+[A-Z]/.test(description[0].replace(/`[^`]*`/g, ''))) {
            report(
                rel,
                `${where}: the first line is one sentence; move the next sentence to its own paragraph: "${description[0]}"`
            );
        }
    }
    return { description, tags };
}

function checkTags(item, tags, signature, where, rel, names) {
    const { kind } = item;
    const order = tags
        .map((tag) => tag.tag)
        .filter((tag) => TAG_ORDER.includes(tag));
    for (let i = 1; i < order.length; i++) {
        if (TAG_ORDER.indexOf(order[i]) < TAG_ORDER.indexOf(order[i - 1])) {
            report(
                rel,
                `${where}: tag order (${order.join(', ')}); want ${TAG_ORDER.join(', ')}`
            );
            break;
        }
    }
    const of = (name) => tags.filter((tag) => tag.tag === name);
    for (const tag of tags) {
        if (
            ['param', 'return', 'prop', 'type'].includes(tag.tag) &&
            /[{}]/.test(tag.text.replace(/^\{[^}]*\}/, ''))
        ) {
            report(
                rel,
                `${where}: @${tag.tag} text has a brace after the type (SassDoc reads the type up to the last }): ${tag.text}`
            );
        }
    }
    const validType = (text, allowed) =>
        text.split('|').every((type) => allowed.includes(type));

    if (kind === 'variable') {
        const types = of('type');
        if (types.length !== 1) {
            report(rel, `${where}: needs exactly one @type`);
        } else if (!validType(types[0].text, VARIABLE_TYPES)) {
            report(
                rel,
                `${where}: @type "${types[0].text}" (want ${VARIABLE_TYPES.join(', ')}, combined with |)`
            );
        }
    } else {
        const documented = of('param')
            .map((tag) => {
                const match = tag.text.match(
                    /^\{([^}]+)\} (\$[\w-]+)(?: \[([^\]]*)\])? - (.+)$/
                );
                if (!match) {
                    report(
                        rel,
                        `${where}: malformed @param "${tag.text}" (want {Type} $name [default] - Description)`
                    );
                    return null;
                }
                if (!validType(match[1], PARAM_TYPES)) {
                    report(
                        rel,
                        `${where}: @param type "${match[1]}" (want ${PARAM_TYPES.join(', ')}, combined with |)`
                    );
                }
                return { name: match[2], default: match[3] };
            })
            .filter(Boolean);
        const params = signatureParams(signature);
        if (
            params.map((p) => p.name).join(',') !==
            documented.map((p) => p.name).join(',')
        ) {
            report(
                rel,
                `${where}: parameters [${params.map((p) => p.name).join(', ')}] in the signature, [${documented.map((p) => p.name).join(', ')}] in the block`
            );
        } else {
            params.forEach((param, i) => {
                if (param.default !== documented[i].default) {
                    report(
                        rel,
                        `${where}: @param ${param.name} default must be ${param.default === undefined ? 'omitted' : `[${param.default}]`} as in the signature`
                    );
                }
            });
        }
        if (kind === 'mixin' || kind === 'function') {
            if (!of('example').length) {
                report(rel, `${where}: no @example`);
            }
        }
    }

    const returns = of('return');
    if (kind === 'function' && returns.length !== 1) {
        report(rel, `${where}: a function needs exactly one @return`);
    }
    for (const tag of returns) {
        if (!/^\{[^}]+\} - .+/.test(tag.text)) {
            report(
                rel,
                `${where}: malformed @return "${tag.text}" (want {Type} - Description)`
            );
        }
    }
    for (const name of ['content', 'output', 'deprecated']) {
        const list = of(name);
        if (list.length > 1) {
            report(rel, `${where}: more than one @${name}`);
        }
        for (const tag of list) {
            if (!tag.text.trim()) {
                report(rel, `${where}: empty @${name}`);
            }
        }
    }
    for (const tag of of('deprecated')) {
        if (!/^Use `[^`]+` instead\.$/.test(tag.text)) {
            report(
                rel,
                `${where}: @deprecated text must be "Use \`name\` instead."`
            );
        }
    }
    for (const tag of of('example')) {
        if (tag.text !== 'scss') {
            report(rel, `${where}: example line must be "/// @example scss"`);
        }
        if (!tag.lines.length) {
            report(rel, `${where}: empty @example`);
        }
    }
    const links = of('link');
    if (links.length > 1) {
        report(rel, `${where}: more than one @link`);
    }
    for (const tag of links) {
        const match = tag.text.match(
            /^https:\/\/developer\.mozilla\.org\/en-US\/docs\/Web\/CSS\/([a-z-]+) ([a-z-]+) on MDN$/
        );
        if (!match || match[1] !== match[2]) {
            report(
                rel,
                `${where}: @link must be "https://developer.mozilla.org/en-US/docs/Web/CSS/<property> <property> on MDN"`
            );
        } else {
            const props = directProperties(item.code ?? '');
            const others = [...props].filter((name) => name !== match[1]);
            if (!props.has(match[1])) {
                report(
                    rel,
                    `${where}: @link names ${match[1]}, which the mixin does not write directly on the including selector`
                );
            } else if (others.length) {
                report(
                    rel,
                    `${where}: @link names ${match[1]}, but the mixin also writes ${others.join(', ')} (remove the link)`
                );
            }
        }
    }
    for (const tag of of('see')) {
        const match = tag.text.match(
            /^\{(mixin|function|variable)\} ([\w-]+)$/
        );
        if (!match) {
            report(
                rel,
                `${where}: malformed @see "${tag.text}" (want {mixin|function|variable} name, one per line)`
            );
        } else if (!names[match[1]].has(match[2])) {
            report(
                rel,
                `${where}: @see {${match[1]}} ${match[2]} is not a public ${match[1]}`
            );
        }
    }
}

// Mixin bodies of src/styles by name (without the outer braces), for following @include of a helper
let mixinBodies = null;
function bodyOf(name) {
    if (!mixinBodies) {
        mixinBodies = new Map();
        for (const file of scssFiles(STYLES_DIR)) {
            const text = fs.readFileSync(file, 'utf8');
            for (const match of text.matchAll(/^@mixin ([\w-]+)/gm)) {
                let i = text.indexOf('{', match.index);
                const start = i + 1;
                for (let depth = 0; i < text.length; i++) {
                    depth += text[i] === '{' ? 1 : text[i] === '}' ? -1 : 0;
                    if (depth === 0) {
                        break;
                    }
                }
                mixinBodies.set(match[1], text.slice(start, i));
            }
        }
    }
    return mixinBodies.get(name);
}

// CSS properties a mixin body (without the outer braces) declares on the including selector, followed through
// @include. Blocks opened by control flow, @media or @supports are transparent; any other block (a nested selector,
// @at-root, @keyframes, an @include content block) is skipped.
function directProperties(code, seen = new Set()) {
    const text = code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/"[^"]*"|'[^']*'/g, '""');
    const props = new Set();
    const stack = [];
    let statement = '';
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '#' && text[i + 1] === '{') {
            i = text.indexOf('}', i);
            statement += '_';
        } else if (char === '{') {
            const head = statement.trim();
            stack.push(
                /^@(if|else|each|for|while|media|supports)\b/.test(head)
            );
            statement = '';
        } else if (char === '}') {
            stack.pop();
            statement = '';
        } else if (char === ';') {
            const head = statement.trim();
            const include = head.match(/^@include\s+(?:[\w-]+\.)?([\w-]+)/);
            const declared = head.match(/^([a-z-]+)\s*:/);
            if (stack.every(Boolean)) {
                if (declared) {
                    props.add(declared[1]);
                } else if (include && !seen.has(include[1])) {
                    const helper = bodyOf(include[1]);
                    if (helper) {
                        for (const name of directProperties(
                            helper,
                            new Set([...seen, include[1]])
                        )) {
                            props.add(name);
                        }
                    }
                }
            }
            statement = '';
        } else {
            statement += char;
        }
    }
    return props;
}

// Raw line scan of one file. Returns the item blocks found, keyed by the 1-based item line
function scanFile(rel, lines, names) {
    const blocks = [];
    const hasPublic = lines.some((line) => {
        const match = line.match(ITEM_LINE);
        if (!match) {
            return false;
        }
        if (match[1]) {
            return names[match[1]].has(match[2]);
        }
        return names.variable.has(match[3]);
    });

    // Poster: the first ////-run must start at the first non-blank line; only one run per file
    const posterRuns = [];
    lines.forEach((line, index) => {
        if (
            /^\s*\/{4}/.test(line) &&
            !/^\s*\/{4}/.test(lines[index - 1] ?? '')
        ) {
            let end = index;
            while (end + 1 < lines.length && /^\s*\/{4}/.test(lines[end + 1])) {
                end++;
            }
            posterRuns.push([index, end]);
        }
    });
    const firstLine = lines.findIndex((line) => line.trim() !== '');
    if (posterRuns.length > 1) {
        report(
            rel,
            `${rel}: more than one poster (//// block): lines ${posterRuns.map(([s]) => s + 1).join(', ')}`
        );
    }
    if (posterRuns.length && posterRuns[0][0] !== firstLine) {
        report(
            rel,
            `${rel}:${posterRuns[0][0] + 1}: the poster must be the first lines of the file`
        );
    }
    if (posterRuns.length) {
        const [start, end] = posterRuns[0];
        if (/^\s/.test(lines[start])) {
            report(rel, `${rel}:${start + 1}: indented poster line`);
        }
        checkPoster(lines, start, end, rel, hasPublic);
        if (lines[end + 1] !== undefined && lines[end + 1].trim() !== '') {
            report(
                rel,
                `${rel}:${end + 2}: blank line required after the poster`
            );
        }
    } else if (hasPublic) {
        report(
            rel,
            `${rel}: no poster (a //// block with @group ${expectedGroup(rel)} at the top)`
        );
    }

    lines.forEach((line, index) => {
        const at = `${rel}:${index + 1}`;
        if (/^\s*\/\//.test(line)) {
            if (STALE.test(line)) {
                report(rel, `${at}: stale marker: ${line.trim()}`);
            }
            if (BANNED.test(line)) {
                report(rel, `${at}: banned character`);
            }
            const slashes = line.trim().match(/^\/+/)[0].length;
            if (slashes > 4) {
                report(rel, `${at}: more than four slashes`);
            }
            if (slashes === 3 && /^\s+/.test(line)) {
                report(
                    rel,
                    `${at}: /// inside a body; use // for code comments`
                );
            }
            if (slashes >= 3 && !/^\s*\/{3,4}( |$)/.test(line)) {
                report(
                    rel,
                    `${at}: a doc comment needs one space after the slashes`
                );
            }
        } else if (
            /(^|[^:/])\/\/\/(?!\/)/.test(line) &&
            !/^\s*\/\//.test(line)
        ) {
            report(rel, `${at}: trailing /// comment; use //`);
        }
    });

    // Doc block runs: consecutive top-level /// lines
    for (let index = 0; index < lines.length; index++) {
        if (!/^\/{3}( |$)/.test(lines[index])) {
            continue;
        }
        const start = index;
        while (
            index + 1 < lines.length &&
            /^\/{3}( |$)/.test(lines[index + 1])
        ) {
            index++;
        }
        const next = lines[index + 1] ?? '';
        const match = next.match(ITEM_LINE);
        if (!match) {
            report(
                rel,
                `${rel}:${start + 1}: /// block not attached to an item (the item line must follow directly; use // for other comments)`
            );
            continue;
        }
        if (/^\s*\/\//.test(lines[start - 1] ?? '')) {
            report(
                rel,
                `${rel}:${start}: // comment directly above a /// block`
            );
        }
        const kind = match[1] ?? 'variable';
        const name = match[2] ?? match[3];
        const isPublic = names[kind].has(name);
        if (!isPublic) {
            report(
                rel,
                `${rel}:${start + 1}: /// block on non-public ${kind} ${name}; use // for private and internal items`
            );
            continue;
        }
        blocks.push({
            kind,
            name,
            line: index + 2,
            block: lines.slice(start, index + 1),
        });
    }

    // Items without a block
    const blockLines = new Set(blocks.map((block) => block.line));
    lines.forEach((line, index) => {
        const match = line.match(ITEM_LINE);
        if (!match || blockLines.has(index + 1)) {
            return;
        }
        const kind = match[1] ?? 'variable';
        const name = match[2] ?? match[3];
        const where = `${rel}:${index + 1} ${kind} ${name}`;
        const above = lines[index - 1] ?? '';
        if (/^\/{3}( |$)/.test(above)) {
            return; // non-public, already reported
        }
        if (kind === 'variable') {
            if (
                names.variable.has(name) &&
                /!default/.test(declaration(lines, index))
            ) {
                stats.public++;
                report(
                    rel,
                    `${where}: public configuration variable without a /// block`
                );
            }
            return;
        }
        if (names[kind].has(name)) {
            stats.public++;
            report(
                rel,
                /^\s*\/\//.test(above)
                    ? `${where}: doc block uses //; public items use ///`
                    : `${where}: no doc block`
            );
        } else if (name.startsWith('-') && !/^\/\/ /.test(above)) {
            report(
                rel,
                `${where}: private helper without a one-line // comment`
            );
        }
    });
    return blocks;
}

// Compiles one example; returns null or the problem
function compileExample(code, deprecated) {
    try {
        const { warnings } = compileSource(`@use "index" as *;\n${code}\n`);
        const unexpected = warnings.filter(
            (warning) => !(deprecated && /deprecated/i.test(warning.message))
        );
        return unexpected.length
            ? `warning: ${unexpected[0].message.split('\n')[0]}`
            : null;
    } catch (error) {
        return (error.sassMessage ?? error.message).split('\n')[0];
    }
}

// Compiles every example of non-deprecated items in one stylesheet (sass: modules hoisted). On any error or
// warning each example is compiled alone, so the failure is attributed
function compileExamples(entries) {
    const batch = entries.filter((entry) => !entry.deprecated);
    const uses = new Set();
    const bodies = batch.map((entry) =>
        entry.code
            .split('\n')
            .filter((line) => {
                if (/^@use "sass:\w+";$/.test(line.trim())) {
                    uses.add(line.trim());
                    return false;
                }
                return true;
            })
            .join('\n')
    );
    // The batch hoists every sass: module, so an example that calls list.nth() without its own @use "sass:list"
    // would pass there; each example must declare the built-in modules it calls
    for (const entry of entries) {
        const declared = new Set(
            [...entry.code.matchAll(/@use "sass:(\w+)"/g)].map((m) => m[1])
        );
        const called = new Set(
            [
                ...entry.code
                    .replace(/\/\/.*$/gm, '')
                    .matchAll(
                        /(?<![\w$.-])(color|list|map|math|meta|selector|string)\.[a-z]/g
                    ),
            ].map((m) => m[1])
        );
        const missing = [...called].filter((name) => !declared.has(name));
        if (missing.length) {
            stats.failed++;
            report(
                entry.file,
                `${entry.where}: example calls ${missing.map((name) => `${name}.*`).join(', ')} without @use "sass:${missing[0]}"\n${entry.code.replace(/^/gm, '      | ')}`
            );
        }
    }

    let batchClean = false;
    if (batch.length) {
        try {
            const { warnings } = compileSource(
                `${[...uses].join('\n')}\n@use "index" as *;\n${bodies.join('\n')}\n`
            );
            batchClean = warnings.length === 0;
        } catch {
            batchClean = false;
        }
    }
    for (const entry of entries) {
        if (entry.deprecated || !batchClean) {
            const problem = compileExample(entry.code, entry.deprecated);
            if (problem) {
                stats.failed++;
                report(
                    entry.file,
                    `${entry.where}: example fails: ${problem}\n${entry.code.replace(/^/gm, '      | ')}`
                );
            }
        }
    }
}

// Parses every file with SassDoc, as `sassdoc src/styles` does. Returns the items and the warnings, each warning
// with the file it names (parse warnings carry the file id, resolve warnings name the item)
async function parseSassdoc(files) {
    const warnings = [];
    const logger = {
        log() {},
        debug() {},
        warn: (...parts) => warnings.push(parts.join(' ')),
        error: (...parts) => warnings.push(parts.join(' ')),
    };
    const env = sassdoc.ensureEnvironment({
        logger,
        package: JSON.parse(
            fs.readFileSync(path.join(CORE_DIR, 'package.json'), 'utf8')
        ),
    });
    const parser = new sassdoc.Parser(env, env.theme && env.theme.annotations);
    const items = [];
    for (const file of files) {
        const rel = path.relative(STYLES_DIR, file);
        for (const item of parser.parse(fs.readFileSync(file, 'utf8'), rel)) {
            item.file = { path: rel, name: path.basename(rel) };
            items.push(item);
        }
    }
    const data = await parser.postProcess(
        items.filter((item) => item.context.type !== 'unknown')
    );
    const located = warnings.map((message) => {
        const text = message.replace(/^\s*(»\s*)?(\[WARNING\]\s*)?/, '');
        const location = text.match(/Location: `([^`:]+):/);
        if (location) {
            return { file: location[1], text };
        }
        const owner = text.match(/^Item `([^`]+)`/);
        const item =
            owner && data.find((entry) => entry.context.name === owner[1]);
        return { file: item ? item.file.path : null, text };
    });
    return { data, warnings: located };
}

// Data written to dist/sassdoc.json (scripts/sassdoc-json.mjs): valid JSON, every public mixin and function, no absolute paths
async function checkSassdocJson(names) {
    const text = JSON.stringify(await buildSassdocData());
    const data = JSON.parse(text);
    for (const kind of ['mixin', 'function']) {
        const documented = new Set(
            data
                .filter((item) => item.context.type === kind)
                .map((item) => item.context.name)
        );
        for (const name of names[kind]) {
            if (!documented.has(name)) {
                report(null, `sassdoc.json: ${kind} ${name} is missing`);
            }
        }
    }
    if (
        text.includes(CORE_DIR) ||
        data.some((item) => path.isAbsolute(item.file.path))
    ) {
        report(null, 'sassdoc.json: contains an absolute path');
    }
}

async function run() {
    const names = publicNames();
    const allFiles = scssFiles(STYLES_DIR);
    const { data, warnings } = await parseSassdoc(allFiles);
    for (const warning of warnings) {
        report(
            warning.file,
            `${warning.file ?? 'sassdoc'}: sassdoc warning: ${warning.text}`
        );
    }
    const parsed = new Map(
        data.map((item) => [
            `${item.file.path}:${item.context.line.start}`,
            item,
        ])
    );

    const seen = { mixin: new Set(), function: new Set() };
    const examples = [];
    const files = allFiles.filter(
        (file) => !only.length || only.includes(path.relative(STYLES_DIR, file))
    );
    for (const name of only) {
        if (
            !allFiles.some((file) => path.relative(STYLES_DIR, file) === name)
        ) {
            problems.push({
                file: name,
                text: `${name}: no such file under src/styles`,
            });
        }
    }

    for (const file of allFiles) {
        const rel = path.relative(STYLES_DIR, file);
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line) => {
            const match = line.match(/^@(mixin|function)\s+([\w-]+)/);
            if (match && names[match[1]].has(match[2])) {
                seen[match[1]].add(match[2]);
            }
        });
        if (!files.includes(file)) {
            continue;
        }
        for (const block of scanFile(rel, lines, names)) {
            const where = `${rel}:${block.line} ${block.kind} ${block.name}`;
            stats.public++;
            stats.documented++;
            const item = parsed.get(`${rel}:${block.line}`);
            if (!item || item.context.name !== block.name) {
                report(rel, `${where}: SassDoc did not parse this block`);
                continue;
            }
            const { tags } = parseBlock(block.block, block.kind, where, rel);
            if (!item.description || !item.description.trim()) {
                report(rel, `${where}: SassDoc read an empty description`);
            }
            const signature = lines
                .slice(block.line - 1, block.line + 5)
                .join(' ');
            checkTags(
                { kind: block.kind, code: item.context.code },
                tags,
                signature,
                where,
                rel,
                names
            );
            if (block.kind === 'mixin') {
                const uses = /@content\b/.test(
                    (item.context.code ?? '').replace(/\/\/[^\n]*/g, '')
                );
                const has = tags.some((tag) => tag.tag === 'content');
                if (uses !== has) {
                    report(
                        rel,
                        `${where}: ${uses ? 'uses @content but has no @content tag' : '@content tag but the mixin has no @content'}`
                    );
                }
            }
            for (const example of item.example ?? []) {
                stats.examples++;
                examples.push({
                    file: rel,
                    where,
                    code: example.code,
                    deprecated: item.deprecated !== undefined,
                });
            }
        }
    }

    if (!only.length) {
        for (const kind of ['mixin', 'function']) {
            for (const name of names[kind]) {
                if (!seen[kind].has(name)) {
                    report(
                        null,
                        `${kind} ${name}: public but no top-level definition found`
                    );
                }
            }
        }
    }

    if (!only.length) {
        await checkSassdocJson(names);
    }

    if (!noCompile) {
        compileExamples(examples);
    }

    problems.forEach((problem) => console.log(problem.text));
    console.log(
        `\ndocblocks: ${stats.public} public items, ${stats.documented} with a block, ${stats.examples} examples${noCompile ? ' (not compiled)' : `, ${stats.failed} failing`}`
    );
    if (problems.length) {
        const perFile = {};
        for (const problem of problems) {
            const key = problem.file ?? '(no file)';
            perFile[key] = (perFile[key] ?? 0) + 1;
        }
        for (const [file, count] of Object.entries(perFile).sort()) {
            console.log(`  ${String(count).padStart(4)}  ${file}`);
        }
        console.log(`docblocks: ${problems.length} problem(s)`);
        process.exit(1);
    }
    console.log('docblocks: all checks pass');
}

await run();
