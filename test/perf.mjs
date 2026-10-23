// apply() compile time guard, measured against a released baseline live.
//
// Usage: node test/perf.mjs (npm run test:perf)
//
// Baseline checks. The baseline sources (BASELINE_VERSION, commit BASELINE_COMMIT: the last release) are extracted
// from git into a temporary directory at run time and removed at the end. Each fixture is compiled against the
// baseline and the working tree in this process, interleaved: after WARMUP rounds, PAIRS pairs, each compiling both
// sides' empty entries and fixtures (baseline first in even pairs, current first in odd pairs). The empty entry is the
// fixture's `@use` line with no rules; each side's median empty entry time (package load) is subtracted from that
// side's fixture times.
// The pair ratio is current cost per call over baseline cost per call; the guard uses the median pair ratio. Above
// FAIL_RATIO the fixture is measured again, up to ATTEMPTS times in all, and fails only if every attempt is above
// FAIL_RATIO. Above WARN_RATIO it prints a warning and passes. Without git or the baseline commit (a tarball install)
// the baseline checks are skipped with a notice.
//
// After a release, set BASELINE_COMMIT and BASELINE_VERSION to that release. Fixtures must use names the baseline
// also compiles.
//
//   as * identical, as * varied, as * modifiers   `@use "mixins-map" as *` with apply(): items are real mixin calls.
//                One item list in every rule; spacing keys, palette colors and shades cycled; the same items with
//                state and breakpoint modifiers.
//   namespaced keys    the varied items through `WovenUI.apply()`, where items arrive as text and are parsed.
//   repeated as *, repeated namespaced    raw values drawn from small pools (lengths, percentages, hex colors, hex
//                colors at a shade), so every value repeats across rules, as in a real stylesheet.
//   large-app    the first LARGE_APP_RULES rules of test/fixtures/large-app.scss (namespaced, 10 items per call).
//
// Self-relative checks (no baseline needed):
//   get-color    GET_COLOR_RULES get-color() calls on 24 repeated hex colors at a shade must cost at most
//                GET_COLOR_LIMIT times the same calls on palette names (uncached raw colors cost about 4 times as much).
//   unique       namespaced rules whose items hold values no other rule repeats; the cost per call at UNIQUE_RULES may
//                not exceed MAX_GROWTH times the cost at a quarter of the rules (a cache that grows with every unique
//                value makes the cost per call grow with the rule count). The growth is the median of GROWTH_PAIRS
//                interleaved pairs (each pair compiles both sizes, alternating the order), so one slow compile does
//                not decide it. Measured 2026-10-13: about 1.0 normally, 1.7 to 3.5 with the raw cache cap removed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as sass from 'sass';
import { BUILD_FILE, CORE_DIR, STYLES_DIR, TEST_DIR, pad } from './helpers.mjs';

const BASELINE_COMMIT = '3cf0693';
const BASELINE_VERSION = '2.0.0';

const WARMUP = 3;
const PAIRS = 7;
const ATTEMPTS = 3;
const FAIL_RATIO = 1.25;
const WARN_RATIO = 1.1;

const RUNS = 3;
const GET_COLOR_RULES = 3000;
const GET_COLOR_LIMIT = 2;
const UNIQUE_RULES = 4000;
const MAX_GROWTH = 1.4;
const GROWTH_PAIRS = 5;

const RULES = 1000;
const COLORS = ['red', 'blue', 'green', 'gray', 'yellow', 'purple'];
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const KEYS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12];
const VARIED = (i) =>
    `p(${KEYS[i % 10]}), m(${KEYS[(i * 3) % 10]}), bg(${COLORS[i % 6]}, ${SHADES[(i >> 1) % 10]}), text-color(${COLORS[(i + 2) % 6]}, ${SHADES[(i * 7) % 10]}), border-color(${COLORS[(i + 4) % 6]}), flex, x-center, rounded(md)`;
const REPEATED_HEX = Array.from(
    { length: 24 },
    (_, k) => `#${(0x203040 + k * 0x050709).toString(16)}`
);
const REPEATED = (i) =>
    `p(${(i % 24) + 1}px), mt(${(i % 16) / 4 + 0.25}rem), max-width(${(i % 20) * 10 + 200}px), width(${(i % 12) * 5 + 40}%), bg(${REPEATED_HEX[i % 24]}), text-color(${REPEATED_HEX[(i * 5) % 24]}, ${[600, 700][i % 2]}), border-color(${REPEATED_HEX[(i * 7) % 24]})`;

const AS_STAR = '@use "mixins-map" as *;';
const NAMESPACED = '@use "mixins-map" as WovenUI;';

// [name, use line, apply name, items of rule i]
const GENERATED = [
    [
        'as * identical',
        AS_STAR,
        'apply',
        () =>
            'p(4), m(2), flex, x-center, bg(red), text-color(white), rounded, shadow(md)',
    ],
    ['as * varied', AS_STAR, 'apply', VARIED],
    [
        'as * modifiers',
        AS_STAR,
        'apply',
        (i) =>
            `p(${KEYS[i % 10]}) md, m(${KEYS[(i * 3) % 10]}) lg, bg(${COLORS[i % 6]}, ${SHADES[(i >> 1) % 10]}) hover, text-color(${COLORS[(i + 2) % 6]}) focus, border-color(${COLORS[(i + 4) % 6]}) hover md, flex md, rounded(md) hover, shadow(md) hover lg`,
    ],
    ['namespaced keys', NAMESPACED, 'WovenUI.apply', VARIED],
    ['repeated as *', AS_STAR, 'apply', REPEATED],
    ['repeated namespaced', NAMESPACED, 'WovenUI.apply', REPEATED],
];

const LARGE_APP = path.join(TEST_DIR, 'fixtures', 'large-app.scss');
const LARGE_APP_RULES = 1500;

function time(fn) {
    const start = process.hrtime.bigint();
    fn();
    return Number(process.hrtime.bigint() - start) / 1e6;
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function compiler(stylesDir) {
    return (source) =>
        sass.compileString(source, {
            loadPaths: [stylesDir],
            logger: sass.Logger.silent,
        });
}

const compileCurrent = compiler(STYLES_DIR);

// Median compile time in ms after one warm-up compile
function measure(compile) {
    compile();
    const times = [];
    for (let i = 0; i < RUNS; i++) {
        times.push(time(compile));
    }
    return median(times);
}

function git(args, options = {}) {
    const result = spawnSync('git', ['-C', CORE_DIR, ...args], {
        maxBuffer: 256 * 1024 * 1024,
        ...options,
    });
    return result.error || result.status !== 0 ? null : result.stdout;
}

// Extracts the baseline sources into a new temporary directory; returns it, or null with the reason
function extractBaseline() {
    const pkg = git(['show', `${BASELINE_COMMIT}:package.json`], {
        encoding: 'utf8',
    });
    if (pkg === null) {
        return [null, `git or commit ${BASELINE_COMMIT} is not available`];
    }
    const version = JSON.parse(pkg).version;
    if (version !== BASELINE_VERSION) {
        return [
            null,
            `commit ${BASELINE_COMMIT} is version ${version}, not ${BASELINE_VERSION}`,
        ];
    }
    const archive = git(['archive', '--format=tar', BASELINE_COMMIT, 'src']);
    if (archive === null) {
        return [null, `git archive ${BASELINE_COMMIT} failed`];
    }
    const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'wovenui-perf-baseline-')
    );
    const tar = spawnSync('tar', ['-x', '-C', dir], { input: archive });
    if (tar.error || tar.status !== 0) {
        fs.rmSync(dir, { recursive: true, force: true });
        return [null, 'extracting the baseline sources failed'];
    }
    return [dir, null];
}

function generated([name, use, applyName, items]) {
    const lines = [use];
    for (let i = 1; i <= RULES; i++) {
        lines.push(`.r-${i} { @include ${applyName}(${items(i)}); }`);
    }
    const source = lines.join('\n');
    return {
        name,
        calls: RULES,
        baseline: [use, source],
        current: [use, source],
    };
}

function largeApp() {
    const lines = fs
        .readFileSync(LARGE_APP, 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('.c-'))
        .slice(0, LARGE_APP_RULES);
    const source = [NAMESPACED, ...lines].join('\n');
    return {
        name: 'large-app',
        calls: lines.length,
        baseline: [NAMESPACED, source],
        current: [NAMESPACED, source],
    };
}

// One interleaved measurement: median pair ratio, its spread, and each side's median µs per call. Each pair compiles
// both sides' empty entries and fixtures, baseline first in even pairs and current first in odd pairs so drift in machine speed
// hits both sides alike; each side's empty entry time is the median over the pairs
function attempt(fixture, compileBaseline) {
    const sides = [
        [compileBaseline, ...fixture.baseline],
        [compileCurrent, ...fixture.current],
    ];
    const timeSide = ([compile, empty, source]) => [
        time(() => compile(empty)),
        time(() => compile(source)),
    ];
    for (let i = 0; i < WARMUP; i++) {
        sides.forEach(timeSide);
    }
    const runs = [[], []];
    for (let i = 0; i < PAIRS; i++) {
        const order = i % 2 ? [1, 0] : [0, 1];
        for (const side of order) {
            runs[side].push(timeSide(sides[side]));
        }
    }
    const [baseline, current] = runs.map((pairs) => {
        const emptyMs = median(pairs.map(([empty]) => empty));
        return pairs.map(
            ([, full]) => ((full - emptyMs) / fixture.calls) * 1000
        );
    });
    const ratios = current.map((cost, i) => cost / baseline[i]);
    return {
        baseline: median(baseline),
        current: median(current),
        ratio: median(ratios),
        spread: `${Math.min(...ratios).toFixed(2)}-${Math.max(...ratios).toFixed(2)}`,
    };
}

function checkAgainstBaseline(compileBaseline, problems) {
    const fixtures = [...GENERATED.map(generated), largeApp()];
    console.log(
        `baseline ${BASELINE_VERSION} (${BASELINE_COMMIT}) measured live: ${PAIRS} interleaved pairs per fixture after ${WARMUP} warm-up rounds; fail above ${FAIL_RATIO}x baseline on all of ${ATTEMPTS} attempts, warn above ${WARN_RATIO}x\n`
    );
    const widths = [22, 17, 17, 8, 11, 0];
    const row = (cells) =>
        cells.map((cell, k) => pad(cell, widths[k])).join('');
    console.log(
        row([
            'fixture',
            'baseline µs/call',
            'current µs/call',
            'ratio',
            'spread',
            'result',
        ])
    );
    for (const fixture of fixtures) {
        let result;
        let attempts = 0;
        do {
            result = attempt(fixture, compileBaseline);
            attempts++;
        } while (result.ratio > FAIL_RATIO && attempts < ATTEMPTS);
        let status = 'pass';
        if (result.ratio > FAIL_RATIO) {
            status = 'FAIL';
            problems.push(
                `${fixture.name}: ${result.ratio.toFixed(2)}x the baseline cost per apply() on all ${attempts} attempts (limit ${FAIL_RATIO})`
            );
        } else if (result.ratio > WARN_RATIO) {
            status = `warn (above ${WARN_RATIO})`;
        }
        if (attempts > 1) {
            status += `, attempt ${attempts}`;
        }
        console.log(
            row([
                fixture.name,
                result.baseline.toFixed(1),
                result.current.toFixed(1),
                result.ratio.toFixed(2),
                result.spread,
                status,
            ])
        );
    }
    console.log('');
}

// GET_COLOR_RULES rules of one get-color() call each, on the repeated hex colors or on palette names
function getColorSource(raw, rules = GET_COLOR_RULES) {
    const lines = ['@use "index" as *;'];
    for (let i = 1; i <= rules; i++) {
        const color = raw ? REPEATED_HEX[i % 24] : COLORS[i % 6];
        lines.push(
            `.g-${i} { color: get-color(${color}, ${[600, 700][i % 2]}); }`
        );
    }
    return lines.join('\n');
}

// A hex color no other rule uses (never pure black or white, which cannot be shaded)
function uniqueHex(i, salt) {
    const value = ((i * 2654435761 + salt) >>> 0) % 0xfffffe;
    return `#${(value + 1).toString(16).padStart(6, '0')}`;
}

function uniqueSource(rules) {
    const lines = [NAMESPACED];
    for (let i = 1; i <= rules; i++) {
        lines.push(
            `.u-${i} { @include WovenUI.apply(p(${i}px), mt(${(i / 100).toFixed(2)}rem), max-width(${i + 7}px), ml(calc(${i}px + 1rem)), bg(${uniqueHex(i, 17)}), text-color(${uniqueHex(i, 91)}, 600), border-color(${uniqueHex(i, 53)}, 300)); }`
        );
    }
    return lines.join('\n');
}

// Unique fixture growth: median ms per apply() call at UNIQUE_RULES and at a quarter of them, and the median of the
// per-pair ratios, over GROWTH_PAIRS interleaved pairs after one warm-up compile of each size
function uniqueGrowth() {
    const fullRules = UNIQUE_RULES;
    const quarterRules = UNIQUE_RULES / 4;
    const full = uniqueSource(fullRules);
    const quarter = uniqueSource(quarterRules);
    compileCurrent(full);
    compileCurrent(quarter);
    const fulls = [];
    const quarters = [];
    const ratios = [];
    for (let i = 0; i < GROWTH_PAIRS; i++) {
        let fullMs;
        let quarterMs;
        if (i % 2 === 0) {
            fullMs = time(() => compileCurrent(full)) / fullRules;
            quarterMs = time(() => compileCurrent(quarter)) / quarterRules;
        } else {
            quarterMs = time(() => compileCurrent(quarter)) / quarterRules;
            fullMs = time(() => compileCurrent(full)) / fullRules;
        }
        fulls.push(fullMs);
        quarters.push(quarterMs);
        ratios.push(fullMs / quarterMs);
    }
    return {
        unique: median(fulls),
        uniqueQuarter: median(quarters),
        growth: median(ratios),
    };
}

function checkSelfRelative(problems) {
    const getColorEmpty = measure(() =>
        compileCurrent(getColorSource(true, 0))
    );
    const rawColors =
        measure(() => compileCurrent(getColorSource(true))) - getColorEmpty;
    const namedColors =
        measure(() => compileCurrent(getColorSource(false))) - getColorEmpty;
    const getColorRatio = rawColors / namedColors;
    console.log(
        `${pad('repeated get-color', 22)}${((rawColors / GET_COLOR_RULES) * 1000).toFixed(1)} µs per call on hex colors, ${((namedColors / GET_COLOR_RULES) * 1000).toFixed(1)} on palette names (ratio ${getColorRatio.toFixed(2)}, limit ${GET_COLOR_LIMIT})`
    );
    if (getColorRatio > GET_COLOR_LIMIT) {
        problems.push(
            `repeated get-color: hex colors cost ${getColorRatio.toFixed(2)}x palette names (limit ${GET_COLOR_LIMIT}); is the raw color cache working?`
        );
    }

    const { unique, uniqueQuarter, growth } = uniqueGrowth();
    console.log(
        `${pad('unique raw values', 22)}${unique.toFixed(3)} ms per apply() at ${UNIQUE_RULES} rules, ${uniqueQuarter.toFixed(3)} at ${UNIQUE_RULES / 4} (median growth of ${GROWTH_PAIRS} pairs ${growth.toFixed(2)}x, limit ${MAX_GROWTH})`
    );
    if (growth > MAX_GROWTH) {
        problems.push(
            `unique raw values: cost per apply() grew ${growth.toFixed(2)}x with 4x the rules (limit ${MAX_GROWTH})`
        );
    }

    const buildMs = time(() =>
        sass.compile(BUILD_FILE, { logger: sass.Logger.silent })
    );
    console.log(`${pad('build.scss', 22)}${Math.round(buildMs)} ms`);
}

function run() {
    const problems = [];
    const [baselineDir, reason] = extractBaseline();
    try {
        if (baselineDir) {
            checkAgainstBaseline(
                compiler(path.join(baselineDir, 'src', 'styles')),
                problems
            );
        } else {
            console.log(
                `perf: ${reason}; skipping the baseline checks (run from a git checkout of @wovenui/core to include them)\n`
            );
        }
        checkSelfRelative(problems);
    } finally {
        if (baselineDir) {
            fs.rmSync(baselineDir, { recursive: true, force: true });
        }
    }

    if (problems.length) {
        console.log(`\nperf: ${problems.join('; ')}`);
        process.exitCode = 1;
        return;
    }
    console.log(
        `\nperf: ${baselineDir ? `apply() within ${FAIL_RATIO}x baseline on every fixture, ` : ''}get-color cache and unique value growth within limits`
    );
}

run();
