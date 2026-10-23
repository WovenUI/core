// Shared helpers for the core test scripts: Sass compilation, theme block parsing, var() resolution and WCAG contrast.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as sass from 'sass';

export const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
export const CORE_DIR = path.resolve(TEST_DIR, '..');
export const STYLES_DIR = path.join(CORE_DIR, 'src', 'styles');
export const BUILD_FILE = path.join(STYLES_DIR, 'build.scss');
export const INDEX_FILE = path.join(STYLES_DIR, 'index.scss');

// Custom property prefix, the value of $prefix in src/styles/config/_constants.scss; P is the lead of every name (--wu-)
export const PREFIX = 'wu';
export const P = `--${PREFIX}-`;

// Fixed tokens (palette, basic colors, scales) live in a :root-only block; the light block holds theme tokens only
export const ROOT_SELECTOR = ':root';
export const LIGHT_SELECTOR = ':root, [data-theme=light]';
// data-theme="inverse" shares the dark block; under a dark page it takes the light values
export const DARK_SELECTOR = '[data-theme=dark], [data-theme=inverse]';
export const DARK_FALLBACK_SELECTOR = ':root:not([data-theme])';
// One level of inverse nesting flips back: inverse inside inverse takes the page values again
export const INVERSE_LIGHT_SELECTOR =
    '[data-theme=dark] [data-theme=inverse], [data-theme=inverse] [data-theme=inverse]';
export const INVERSE_DARK_SELECTOR =
    '[data-theme=dark] [data-theme=inverse] [data-theme=inverse]';
export const INVERSE_DARK_FALLBACK_SELECTOR =
    ':root:not([data-theme]) [data-theme=inverse] [data-theme=inverse]';
export const INVERSE_LIGHT_FALLBACK_SELECTOR =
    ':root:not([data-theme]) [data-theme=inverse]';

export const ROLES = ['brand', 'success', 'danger', 'warning', 'info'];
export const ROLE_STATES = ['default', 'hover', 'active', 'subtle', 'border'];
// Token name of a role state: the bare role name for the default state (brand), else {role}-{state}
export const roleToken = (role, state) =>
    state === 'default' ? role : `${role}-${state}`;
export const BASIC = ['black', 'white', 'transparent'];

// Non-color scale families in emission order: token prefix (without the trailing -) and heading
export const SCALE_FAMILIES = [
    ['space', 'Spacing'],
    ['radius', 'Radius'],
    ['border-width', 'Border width'],
    ['font-family', 'Font family'],
    ['font-size', 'Font size'],
    ['font-weight', 'Font weight'],
    ['line-height', 'Line height'],
    ['shadow', 'Shadow'],
    ['opacity', 'Opacity'],
    ['z', 'Z-index levels'],
    ['duration', 'Duration'],
    ['ease', 'Easing'],
    ['control-height', 'Control height'],
    ['control-padding-inline', 'Control inline padding'],
];
export const STOPS = [
    '50',
    '100',
    '200',
    '300',
    '400',
    '500',
    '600',
    '700',
    '800',
    '900',
    '950',
];

// Returns { css, warnings }. Warnings are collected instead of printed.
function withLogger(fn) {
    const warnings = [];
    const logger = {
        warn(message, options) {
            const span = options.span;
            const where =
                span && span.url
                    ? `${path.relative(CORE_DIR, fileURLToPath(span.url))}:${span.start.line + 1}`
                    : '';
            warnings.push({
                message,
                where,
                stack: options.stack || '',
                deprecation: options.deprecation,
            });
        },
        debug() {},
    };
    const result = fn(logger);
    return { css: result.css, warnings };
}

export function compileFile(file, style = 'expanded') {
    return withLogger((logger) => sass.compile(file, { style, logger }));
}

// Compiles SCSS source as if it were a file in test/, so `@use "../src/styles/index"` resolves.
// The styles directory is also a load path, so `@use "index"` works.
export function compileSource(source, style = 'expanded') {
    return withLogger((logger) =>
        sass.compileString(source, {
            style,
            logger,
            url: pathToFileURL(path.join(TEST_DIR, 'virtual.scss')),
            loadPaths: [STYLES_DIR],
        })
    );
}

// Compiles SCSS source that must fail. Returns the Sass error message, or null when it compiled.
export function compileError(source) {
    try {
        compileSource(source);
        return null;
    } catch (error) {
        return error.sassMessage ?? error.message;
    }
}

// Parses flat rule blocks (no nested braces inside) into selector to { name: value } of --wu- declarations.
// Blocks with the same selector are merged in source order.
export function parseBlocks(css) {
    const blocks = new Map();
    const re = /([^{};]+)\{([^{}]*)\}/g;
    let match;
    while ((match = re.exec(css)) !== null) {
        const selector = match[1]
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\s+/g, ' ')
            .replace(/\s*,\s*/g, ', ')
            .trim();
        const decls = blocks.get(selector) || {};
        for (const decl of match[2].split(';')) {
            const declaration = decl.match(
                new RegExp(
                    String.raw`^\s*${P}([a-zA-Z0-9_-]+)\s*:\s*([\s\S]*?)\s*$`
                )
            );
            if (declaration) {
                decls[declaration[1]] = declaration[2];
            }
        }
        blocks.set(selector, decls);
    }
    return blocks;
}

// light is what a light element resolves: the :root fixed tokens merged with the light block (lightBlock)
export function themeBlocks(css) {
    const blocks = parseBlocks(css);
    // Component variables (--wu-tooltip--Background) also sit on :root; they are not tokens
    const root = Object.fromEntries(
        Object.entries(blocks.get(ROOT_SELECTOR) || {}).filter(
            ([name]) => !name.includes('--')
        )
    );
    const lightBlock = blocks.get(LIGHT_SELECTOR);
    const dark = blocks.get(DARK_SELECTOR);
    if (!lightBlock) {
        throw new Error(
            `No "${LIGHT_SELECTOR}" block found in the compiled CSS.`
        );
    }
    if (!dark) {
        throw new Error(
            `No "${DARK_SELECTOR}" block found in the compiled CSS.`
        );
    }
    return {
        light: { ...root, ...lightBlock },
        lightBlock,
        root,
        dark,
        fallback: blocks.get(DARK_FALLBACK_SELECTOR),
        all: blocks,
    };
}

// Resolves --wu-{name} through var() references. Layers are searched first to last at every step,
// matching the cascade where a theme block overrides :root and inherits the rest.
export function resolveToken(name, layers, seen = []) {
    if (seen.includes(name)) {
        throw new Error(
            `Circular var() reference: ${[...seen, name].join(' > ')}`
        );
    }
    const layer = layers.find((candidate) =>
        Object.prototype.hasOwnProperty.call(candidate, name)
    );
    if (!layer) {
        throw new Error(`${P}${name} is not defined`);
    }
    const value = layer[name];
    const ref = value.match(
        new RegExp(String.raw`^var\(\s*${P}([a-zA-Z0-9_-]+)\s*\)$`)
    );
    return ref ? resolveToken(ref[1], layers, [...seen, name]) : value;
}

const NAMED = {
    black: [0, 0, 0, 1],
    white: [255, 255, 255, 1],
    transparent: [0, 0, 0, 0],
};

// Parses hex, rgb()/rgba() and a few named colors to [r, g, b, a]. Returns null when unknown.
export function parseColor(value) {
    const text = value.trim().toLowerCase();
    if (NAMED[text]) {
        return NAMED[text];
    }
    let match = text.match(/^#([0-9a-f]{3,8})$/);
    if (match) {
        let hex = match[1];
        if (hex.length === 3 || hex.length === 4) {
            hex = [...hex].map((digit) => digit + digit).join('');
        }
        if (hex.length !== 6 && hex.length !== 8) {
            return null;
        }
        const byte = (start) => parseInt(hex.slice(start, start + 2), 16);
        return [
            byte(0),
            byte(2),
            byte(4),
            hex.length === 8 ? byte(6) / 255 : 1,
        ];
    }
    match = text.match(/^rgba?\(([^)]+)\)$/);
    if (match) {
        const parts = match[1].split(/[\s,/]+/).filter(Boolean);
        const channel = (part) =>
            part.endsWith('%')
                ? (parseFloat(part) * 255) / 100
                : parseFloat(part);
        const alpha =
            parts[3] === undefined
                ? 1
                : parts[3].endsWith('%')
                  ? parseFloat(parts[3]) / 100
                  : parseFloat(parts[3]);
        return [channel(parts[0]), channel(parts[1]), channel(parts[2]), alpha];
    }
    return null;
}

function luminance([r, g, b]) {
    const lin = (channel) => {
        const srgb = channel / 255;
        return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// WCAG 2.x contrast ratio. A translucent foreground is composited over the background first.
export function contrast(fg, bg) {
    const over =
        fg[3] < 1
            ? fg
                  .slice(0, 3)
                  .map(
                      (channel, index) =>
                          channel * fg[3] + bg[index] * (1 - fg[3])
                  )
            : fg;
    const front = luminance(over);
    const back = luminance(bg);
    return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05);
}

// Palette names: names with every shade stop emitted (roles and hues).
export function paletteNames(light) {
    return Object.keys(light)
        .filter((name) => name.endsWith('-500'))
        .map((name) => name.slice(0, -4))
        .filter((name) => STOPS.every((stop) => `${name}-${stop}` in light));
}

// Palette hue names: palette names that are not roles.
export function paletteHues(light) {
    return paletteNames(light).filter((name) => !ROLES.includes(name));
}

// True for a palette shade token ({name}-{stop}) of one of the given palette names.
export function isPalette(name, palettes) {
    return palettes.some((palette) =>
        STOPS.some((stop) => name === `${palette}-${stop}`)
    );
}

// True for a non-color scale token (space-4, z-modal) or a single-token family (font-family).
export function isScale(name) {
    return SCALE_FAMILIES.some(([prefix]) => inFamily(name, prefix));
}

// True when a token name belongs to the scale family with the given prefix.
export function inFamily(name, prefix) {
    return name === prefix || name.startsWith(`${prefix}-`);
}

export function pad(value, width) {
    const text = String(value);
    return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

// Splits text at top-level occurrences of a separator character (outside parentheses and brackets)
function splitTopLevel(text, separator) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const char of text) {
        if (char === '(' || char === '[') {
            depth++;
        } else if (char === ')' || char === ']') {
            depth--;
        }
        if (depth === 0 && separator.test(char)) {
            if (current.trim()) {
                parts.push(current.trim());
            }
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) {
        parts.push(current.trim());
    }
    return parts;
}

// Parses one complex selector of the theme grammar: compounds of :root, *, .class, [attr=value], :not(...) and
// :is(...) joined by descendant combinators. Returns { compounds, specificity } or null for other syntax
function parseComplex(text) {
    const compounds = [];
    for (const part of splitTopLevel(text, /\s/)) {
        const simples = [];
        let rest = part;
        while (rest) {
            let match = rest.match(/^(:root|\*|\.[\w\\.-]+|\[[^\]]+\])/);
            if (match) {
                simples.push({
                    kind: match[1],
                    specificity: match[1] === '*' ? 0 : 1,
                });
                rest = rest.slice(match[1].length);
                continue;
            }
            match = rest.match(/^:(not|is)\(/);
            if (!match) {
                return null;
            }
            let depth = 0;
            let end = match[0].length - 1;
            for (; end < rest.length; end++) {
                depth += rest[end] === '(' ? 1 : rest[end] === ')' ? -1 : 0;
                if (depth === 0) {
                    break;
                }
            }
            const inner = splitTopLevel(
                rest.slice(match[0].length, end),
                /,/
            ).map(parseComplex);
            if (inner.includes(null)) {
                return null;
            }
            simples.push({
                kind: match[1],
                inner,
                specificity: Math.max(
                    ...inner.map((selector) => selector.specificity)
                ),
            });
            rest = rest.slice(end + 1);
        }
        compounds.push(simples);
    }
    const specificity = compounds
        .flat()
        .reduce((sum, simple) => sum + simple.specificity, 0);
    return { compounds, specificity };
}

function matchesSimple(simple, element) {
    if (simple.kind === '*') {
        return true;
    }
    if (simple.kind === ':root') {
        return !element.parent;
    }
    if (simple.kind.startsWith('.')) {
        return (element.classes || []).includes(simple.kind.slice(1));
    }
    if (simple.kind === 'not') {
        return !simple.inner.some((selector) =>
            matchesComplex(selector, element)
        );
    }
    if (simple.kind === 'is') {
        return simple.inner.some((selector) =>
            matchesComplex(selector, element)
        );
    }
    const [name, value] = simple.kind.slice(1, -1).split('=');
    const actual = (element.attrs || {})[name];
    return value === undefined
        ? actual !== undefined
        : actual === value.replace(/^["']|["']$/g, '');
}

function matchesFrom(compounds, index, element) {
    if (!compounds[index].every((simple) => matchesSimple(simple, element))) {
        return false;
    }
    if (index === 0) {
        return true;
    }
    for (let ancestor = element.parent; ancestor; ancestor = ancestor.parent) {
        if (matchesFrom(compounds, index - 1, ancestor)) {
            return true;
        }
    }
    return false;
}

function matchesComplex(selector, element) {
    return matchesFrom(
        selector.compounds,
        selector.compounds.length - 1,
        element
    );
}

// Rules carrying --wu- declarations whose selectors name :root or data-theme, in source order:
// { selectors: [parsed complex selectors], media: null | 'dark' | 'light', decls }.
// Other at-rules are skipped; a prefers-color-scheme media block is entered
export function themeRules(css) {
    const rules = [];
    const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const walk = (source, media) => {
        let index = 0;
        while (index < source.length) {
            const open = source.indexOf('{', index);
            if (open === -1) {
                return;
            }
            const prelude = source.slice(index, open).trim();
            let depth = 0;
            let close = open;
            for (; close < source.length; close++) {
                depth +=
                    source[close] === '{' ? 1 : source[close] === '}' ? -1 : 0;
                if (depth === 0) {
                    break;
                }
            }
            const body = source.slice(open + 1, close);
            const scheme = prelude.match(
                /^@media \(prefers-color-scheme: (dark|light)\)$/
            );
            if (scheme) {
                walk(body, scheme[1]);
            } else if (
                !prelude.startsWith('@') &&
                /:root|data-theme/.test(prelude)
            ) {
                const selectors = splitTopLevel(prelude, /,/).map(parseComplex);
                const decls = parseBlocks(`x{${body}}`).get('x') || {};
                // A theme selector the matcher cannot parse would silently drop a rule from the cascade
                if (selectors.includes(null) && Object.keys(decls).length > 0) {
                    throw new Error(
                        `themeRules: cannot parse the selector of a token rule: ${prelude.replace(/\s+/g, ' ')}`
                    );
                }
                if (Object.keys(decls).length > 0) {
                    rules.push({
                        prelude: prelude.replace(/\s+/g, ' '),
                        selectors,
                        media,
                        decls,
                    });
                }
            }
            index = close + 1;
        }
    };
    walk(text, null);
    return rules;
}

// Builds an element chain from the root down: [{ attrs, classes }, ...]; returns the last element
export function elementChain(specs) {
    let parent = null;
    for (const spec of specs) {
        parent = { ...spec, parent };
    }
    return parent;
}

// Computed value of --wu-{name} on an element: the declaration of the matching rule with the highest specificity,
// later rules winning ties, else the parent's value (custom properties inherit). scheme is 'dark' or 'light'
export function cascadeValue(rules, element, name, scheme) {
    let best = null;
    rules.forEach((rule, order) => {
        if (!(name in rule.decls) || (rule.media && rule.media !== scheme)) {
            return;
        }
        const matching = rule.selectors.filter((selector) =>
            matchesComplex(selector, element)
        );
        if (matching.length === 0) {
            return;
        }
        const specificity = Math.max(
            ...matching.map((selector) => selector.specificity)
        );
        if (
            !best ||
            specificity > best.specificity ||
            (specificity === best.specificity && order > best.order)
        ) {
            best = { specificity, order, value: rule.decls[name] };
        }
    });
    if (best) {
        return best.value;
    }
    return element.parent
        ? cascadeValue(rules, element.parent, name, scheme)
        : undefined;
}
