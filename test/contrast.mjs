// WCAG contrast check for the light and dark theme tokens.
//
// Usage:
//   node test/contrast.mjs
//       Compiles src/styles/build.scss with the default configuration.
//   node test/contrast.mjs --with '$brand: #1ab5a5'
//       Compiles src/styles/index.scss with the given with-clause entries (a consumer brand).
//   node test/contrast.mjs --config path/to/brand.scss
//       Same, reading the with-clause entries from a file, e.g. a file containing:
//           $brand: #1ab5a5,
//           $light-theme: ("brand": brand 800)
//
// Checks, per theme (light and dark, and their high-contrast twins when a high-contrast map is set):
//   text-regular, text-muted        >= 4.5 on bg-base and bg-surface
//   text-link, text-link-hover      >= 4.5 on bg-base and bg-surface
//   text-{role}                     >= 4.5 on bg-surface, bg-alternate, bg-raised, bg-hover and bg-disabled
//   text-on-{role}                  >= 4.5 on {role}
//   text-{hue}                      >= 4.5 on bg-surface and on {hue}-subtle
//   border-control                  >= 3   on bg-base, bg-surface, bg-raised and bg-hover (a translucent border is blended over the background)
//   border-focus                    >= 3   on bg-surface
// Also prints, for information, border-control and border-control-hover over every bg-* token.
// Prints a table and exits with code 1 on any failure.
import fs from 'node:fs';
import {
    BUILD_FILE,
    DARK_SELECTOR,
    LIGHT_SELECTOR,
    ROLES,
    compileFile,
    compileSource,
    contrast,
    pad,
    paletteHues,
    parseColor,
    resolveToken,
    themeBlocks,
} from './helpers.mjs';

const TEXT = 4.5;
const NON_TEXT = 3;

function usageError(message) {
    console.error(
        `${message}\nUsage: node test/contrast.mjs [--with '$brand: #1ab5a5'] [--config path/to/brand.scss]`
    );
    process.exit(2);
}

// The value after a flag: present, not another flag, and not blank
function flagValue(argv, flag) {
    const value = argv[argv.indexOf(flag) + 1];
    if (value === undefined || value.startsWith('--') || !value.trim()) {
        usageError(`${flag} needs a value.`);
    }
    return value;
}

function readOptions(argv) {
    const withIndex = argv.indexOf('--with');
    const configIndex = argv.indexOf('--config');
    if (withIndex !== -1 && configIndex !== -1) {
        usageError('Use --with or --config, not both.');
    }
    if (withIndex !== -1) {
        const entries = flagValue(argv, '--with').trim().replace(/,\s*$/, '');
        if (!/^\$[a-zA-Z_-][\w-]*\s*:/.test(entries)) {
            usageError(
                `--with expects with-clause entries such as '$brand: #1ab5a5', got: ${entries}`
            );
        }
        return { label: `--with ${entries}`, entries };
    }
    if (configIndex !== -1) {
        const file = flagValue(argv, '--config');
        if (!fs.existsSync(file)) {
            usageError(`--config file not found: ${file}`);
        }
        return {
            label: `--config ${file}`,
            entries: fs.readFileSync(file, 'utf8').trim().replace(/,\s*$/, ''),
        };
    }
    return null;
}

function compile(options) {
    if (!options) {
        return compileFile(BUILD_FILE).css;
    }
    return compileSource(`@use "index" as nu with (${options.entries});`).css;
}

function pairs(light) {
    const list = [];
    for (const fg of [
        'text-regular',
        'text-muted',
        'text-link',
        'text-link-hover',
    ]) {
        for (const bg of ['bg-base', 'bg-surface']) {
            list.push([fg, bg, TEXT]);
        }
    }
    for (const role of ROLES) {
        for (const bg of [
            'bg-surface',
            'bg-alternate',
            'bg-raised',
            'bg-hover',
            'bg-disabled',
        ]) {
            list.push([`text-${role}`, bg, TEXT]);
        }
        list.push([`text-on-${role}`, role, TEXT]);
    }
    for (const hue of paletteHues(light)) {
        list.push([`text-${hue}`, 'bg-surface', TEXT]);
        list.push([`text-${hue}`, `${hue}-subtle`, TEXT]);
    }
    for (const bg of ['bg-base', 'bg-surface', 'bg-raised', 'bg-hover']) {
        list.push(['border-control', bg, NON_TEXT]);
    }
    list.push(['border-focus', 'bg-surface', NON_TEXT]);
    return list;
}

function run() {
    const options = readOptions(process.argv.slice(2));
    const { light, dark, all } = themeBlocks(compile(options));
    const themes = [
        ['light', [light]],
        ['dark', [dark, light]],
    ];
    // High-contrast twins of the light and dark blocks, emitted when a high-contrast map has entries
    const twin = (selector) =>
        all.get(
            selector
                .split(', ')
                .map(
                    (part) =>
                        `${part}:is([data-contrast=high], [data-contrast=high] *)`
                )
                .join(', ')
        );
    const hcLight = twin(LIGHT_SELECTOR);
    const hcDark = twin(DARK_SELECTOR);
    if (hcLight) {
        themes.push(['hc-light', [hcLight, light]]);
    }
    if (hcDark) {
        themes.push(['hc-dark', [hcDark, dark, light]]);
    }
    const failures = [];

    console.log(
        `Contrast check (${options ? options.label : 'default build'})${hcLight || hcDark ? '' : '; no high-contrast map set, high contrast uses the base values'}\n`
    );
    console.log(
        `${pad('theme', 9)}${pad('foreground', 22)}${pad('background', 18)}${pad('fg', 28)}${pad('bg', 10)}${pad('ratio', 8)}${pad('min', 5)}result`
    );
    for (const [theme, layers] of themes) {
        for (const [fgName, bgName, min] of pairs(light)) {
            let row;
            try {
                const fgValue = resolveToken(fgName, layers);
                const bgValue = resolveToken(bgName, layers);
                const fg = parseColor(fgValue);
                const bg = parseColor(bgValue);
                if (!fg || !bg) {
                    throw new Error(
                        `cannot parse color ${!fg ? fgValue : bgValue}`
                    );
                }
                const ratio = contrast(fg, bg);
                const ok = ratio >= min;
                row = `${pad(fgValue, 28)}${pad(bgValue, 10)}${pad(ratio.toFixed(2), 8)}${pad(min, 5)}${ok ? 'pass' : 'FAIL'}`;
                if (!ok) {
                    failures.push(
                        `${theme}: ${fgName} on ${bgName} is ${ratio.toFixed(2)}:1, needs ${min}:1`
                    );
                }
            } catch (error) {
                row = `ERROR ${error.message}`;
                failures.push(
                    `${theme}: ${fgName} on ${bgName}: ${error.message}`
                );
            }
            console.log(
                `${pad(theme, 9)}${pad(fgName, 22)}${pad(bgName, 18)}${row}`
            );
        }
    }

    console.log(
        `\nControl borders over every bg token (information; translucent borders blended over the background)\n`
    );
    console.log(
        `${pad('theme', 9)}${pad('border', 22)}${pad('background', 18)}ratio`
    );
    for (const [theme, layers] of themes) {
        const bgs = Object.keys(layers[layers.length - 1]).filter((name) =>
            /^bg-[a-z]+$/.test(name)
        );
        for (const border of ['border-control', 'border-control-hover']) {
            for (const bgName of bgs) {
                const fg = parseColor(resolveToken(border, layers));
                const bg = parseColor(resolveToken(bgName, layers));
                const ratio = fg && bg ? contrast(fg, bg).toFixed(2) : 'n/a';
                console.log(
                    `${pad(theme, 9)}${pad(border, 22)}${pad(bgName, 18)}${ratio}`
                );
            }
        }
    }

    if (failures.length > 0) {
        console.log(`\n${failures.length} contrast failure(s):`);
        failures.forEach((failure) => console.log(`  ${failure}`));
        process.exit(1);
    }
    console.log('\ncontrast: all checks pass');
}

run();
