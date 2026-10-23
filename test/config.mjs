// Consumer configuration edge cases: each case compiles src/styles/index.scss with a with-clause.
//
// Usage: node test/config.mjs
//
// Checks emitted tokens and classes for custom roles, hues, theme tokens and flags, and that the
// configuration validator rejects bad input with a message containing the expected text.
// Exits with code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import {
    BUILD_FILE,
    CORE_DIR,
    DARK_FALLBACK_SELECTOR,
    DARK_SELECTOR,
    INVERSE_DARK_FALLBACK_SELECTOR,
    INVERSE_DARK_SELECTOR,
    INVERSE_LIGHT_FALLBACK_SELECTOR,
    INVERSE_LIGHT_SELECTOR,
    LIGHT_SELECTOR,
    P,
    cascadeValue,
    compileError,
    compileFile,
    compileSource,
    contrast,
    elementChain,
    parseBlocks,
    parseColor,
    resolveToken,
    themeBlocks,
    themeRules,
} from './helpers.mjs';

const ROLES = `"brand": #007bff, "success": #28a745, "danger": #dc3545, "warning": #ffc107, "info": #17a2b8`;
const HUES = `"gray": #6b7280, "red": #ef4444, "blue": #3b82f6, "green": #22c55e, "yellow": #eab308, "purple": #a855f7, "pink": #ec4899`;
// High contrast twins and the asymmetric maps of the MIGRATION example, plus a dark-only key
const HC_IS = ':is([data-contrast=high], [data-contrast=high] *)';
const HC_MAPS =
    '$high-contrast-light: ("text-muted": #000, "border-control": gray 900), $high-contrast-dark: ("text-muted": #fff, "brand": brand 300)';
const HC_LIGHT = {
    'text-muted': '#000',
    'border-control': `var(${P}gray-900)`,
};
const HC_DARK = {
    'text-muted': '#fff',
    brand: `var(${P}brand-300)`,
};
const HC_KEYS = ['text-muted', 'border-control', 'brand'];
const MEDIA_DARK = '@media (prefers-color-scheme: dark)';
const MEDIA_SCHEME_RE =
    /@media \(prefers-color-scheme: (dark|light)\) \{([\s\S]*?)\n\}/g;

// Text of every prefers-color-scheme media block of one scheme
function schemeMediaText(css, scheme) {
    return [...css.matchAll(MEDIA_SCHEME_RE)]
        .filter((match) => match[1] === scheme)
        .map((match) => match[2].replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', '))
        .join('\n');
}

// Text of every prefers-color-scheme: dark media block
function darkMediaText(css) {
    return schemeMediaText(css, 'dark');
}

const failures = [];
const fail = (message) => failures.push(message);

function check(label, fn) {
    const before = failures.length;
    try {
        fn();
    } catch (error) {
        fail(
            `${label}: ${(error.sassMessage ?? error.message).split('\n')[0]}`
        );
    }
    const count = failures.length - before;
    console.log(
        `${count === 0 ? 'pass' : 'FAIL'}  ${label}${count ? ` (${count})` : ''}`
    );
}

// Compiles index.scss with the given with-clause entries plus any extra SCSS; fails on warnings
function compileWith(entries, extra = '') {
    const { css, warnings } = compileSource(
        `@use "index" as nu with (${entries});\n${extra}`
    );
    warnings.forEach((warning) =>
        fail(`warning: ${warning.message.split('\n')[0]}`)
    );
    return css;
}

function expectToken(block, label, name, value) {
    if (!block || !(name in block)) {
        fail(`${label}: ${P}${name} is missing`);
    } else if (value !== undefined && block[name] !== value) {
        fail(`${label}: ${P}${name} is ${block[name]}, expected ${value}`);
    }
}

function expectNoToken(block, label, name) {
    if (block && name in block) {
        fail(`${label}: ${P}${name} must not be emitted`);
    }
}

function expectIncludes(css, text, label) {
    if (!css.includes(text)) {
        fail(`${label}: output lacks ${text}`);
    }
}

function expectExcludes(css, text, label) {
    if (css.includes(text)) {
        fail(`${label}: output must not contain ${text}`);
    }
}

const ERROR_CASES = [
    [
        'tooltip removed from $z-index-levels while tooltips are emitted',
        '$z-index-levels: ("base": 0, "modal": 600), $generate-utility-classes: true',
        'Tooltips need the key tooltip in $z-index-levels',
    ],
    [
        'transition default duration that is not a $durations key',
        '$transition-default-duration: 250',
        '$transition-default-duration: 250 is not a configured key',
    ],
    [
        'transition default ease that is not a $timing-functions key',
        '$transition-default-ease: bounce',
        '$transition-default-ease: bounce is not a configured key',
    ],
    [
        'unknown $light-theme key',
        '$light-theme: ("bg-surfase": #fff)',
        '$light-theme has unknown tokens: bg-surfase',
    ],
    [
        'unknown $dark-theme key',
        '$dark-theme: ("text-mutd": #fff)',
        '$dark-theme has unknown tokens: text-mutd',
    ],
    [
        'malformed scale reference without a space (brand600)',
        '$light-theme: ("bg-base": brand600)',
        'malformed scale reference',
    ],
    [
        'malformed scale reference with an invalid stop (brand 450)',
        '$light-theme: ("bg-base": brand 450)',
        'malformed scale reference',
    ],
    [
        'scale reference to an unknown scale (orange 100)',
        '$light-theme: ("bg-base": orange 100)',
        "refers to 'orange', which is not a role or palette name",
    ],
    [
        'error-* override',
        '$light-theme: ("error": red 700)',
        "'error' cannot be set",
    ],
    [
        'old {role}-default key (renamed to the bare role name in 2.0)',
        '$light-theme: ("brand-default": brand 800)',
        `$light-theme: 'brand-default' was renamed to 'brand' in 2.0 (${P}brand)`,
    ],
    [
        'old {role}-default key for a custom role in $dark-theme',
        `$semantic-colors: (${ROLES}, "accent": #8b5cf6), $dark-theme: ("accent-default": accent 300)`,
        `$dark-theme: 'accent-default' was renamed to 'accent' in 2.0 (${P}accent)`,
    ],
    [
        'old {role}-default key in $high-contrast-light',
        '$high-contrast-light: ("danger-default": danger 900)',
        "$high-contrast-light: 'danger-default' was renamed to 'danger' in 2.0",
    ],
    [
        'old error-default key',
        '$light-theme: ("error-default": red 700)',
        "'error-default' was renamed to 'error' in 2.0, and error tokens follow danger; set 'danger' instead",
    ],
    [
        'role whose bare token is a palette token (red-500 with hue red)',
        `$semantic-colors: (${ROLES}, "red-500": #f00)`,
        "'red-500' generates the token 'red-500', which is already a palette, basic color or scale token",
    ],
    [
        'role and hue with the same name',
        `$semantic-colors: (${ROLES}, "red": #f00)`,
        "'red' is both a role ($semantic-colors) and a palette hue ($color-primitives)",
    ],
    [
        'hue named error',
        `$color-primitives: (${HUES}, "error": #f00)`,
        "'error' cannot be a role or palette hue name",
    ],
    [
        'hue whose generated token is a built-in token (link gives text-link)',
        `$color-primitives: (${HUES}, "link": #00f)`,
        "'link' generates the token 'text-link', which is a built-in theme token",
    ],
    [
        'removed gray still referenced by the default theme',
        `$color-primitives: ("red": #ef4444, "blue": #3b82f6)`,
        "refers to 'gray', which is not a role or palette name",
    ],
    [
        'custom token reusing a palette token name',
        '$light-theme: ("red-500": #f00), $dark-theme: ("red-500": #f00)',
        "custom token 'red-500' is already a palette, basic color or scale token",
    ],
    [
        'scale token name in $light-theme alone gets the reserved-name error, not the unknown-key one',
        '$light-theme: ("space-4": 2rem)',
        "$light-theme: custom token 'space-4' is already a palette, basic color or scale token",
    ],
    [
        'scale token name in $dark-theme alone gets the reserved-name error',
        '$dark-theme: ("space-4": 2rem)',
        "$dark-theme: custom token 'space-4' is already a palette, basic color or scale token",
    ],
    [
        'unknown $high-contrast-light key',
        '$high-contrast-light: ("text-mutd": #000)',
        '$high-contrast-light has unknown tokens: text-mutd',
    ],
    [
        'unknown $high-contrast-dark key',
        '$high-contrast-dark: ("bg-nope": #000)',
        '$high-contrast-dark has unknown tokens: bg-nope',
    ],
    [
        'error-* override in $high-contrast-dark',
        '$high-contrast-dark: ("error": #f00)',
        "$high-contrast-dark: 'error' cannot be set",
    ],
    [
        'malformed scale reference in $high-contrast-light',
        '$high-contrast-light: ("text-muted": gray450)',
        "$high-contrast-light, token 'text-muted' (set in $high-contrast-light) has a malformed scale reference (gray450)",
    ],
    [
        'removed $high-contrast-theme',
        '$high-contrast-theme: ("text-muted": #000)',
        'This variable was not declared with !default',
    ],
    [
        'custom token reusing an opacity token name',
        '$light-theme: ("opacity-50": 0.4), $dark-theme: ("opacity-50": 0.4)',
        "custom token 'opacity-50' is already a palette, basic color or scale token",
    ],
    [
        'quoted invalid hex color in a theme map',
        '$light-theme: ("bg-base": "#ggg")',
        "token 'bg-base' (set in $light-theme)",
    ],
    [
        'quoted invalid hex color in a theme map (message)',
        '$light-theme: ("bg-base": "#ggg")',
        'is not a valid hex color (#rgb, #rgba, #rrggbb or #rrggbbaa)',
    ],
    [
        'removed gray reports every token that refers to it in one error',
        `$color-primitives: ("red": #ef4444)`,
        "token 'border-control-hover' (built-in default): gray 600 refers to 'gray'",
    ],
    [
        'hue named like a basic color',
        `$color-primitives: (${HUES}, "black": #111)`,
        "'black' is a basic color ($basic-colors) and cannot also be a role or palette hue name",
    ],
    [
        'hue whose palette tokens reuse a scale token (opacity)',
        `$color-primitives: (${HUES}, "opacity": #123456)`,
        "The color token 'opacity-50' (from a role or palette hue name) is also a non-color scale token",
    ],
];

function run() {
    check(
        'extra role (accent) gets a palette, role tokens, text-on and classes',
        () => {
            const css = compileWith(
                `$generate-utility-classes: true, $semantic-colors: (${ROLES}, "accent": #8b5cf6)`
            );
            const { light, dark } = themeBlocks(css);
            expectToken(light, 'light', 'accent-500');
            expectToken(light, 'light', 'accent', `var(${P}accent-700)`);
            expectToken(light, 'light', 'text-on-accent');
            expectToken(dark, 'dark', 'accent', `var(${P}accent-400)`);
            expectToken(dark, 'dark', 'text-on-accent');
            expectIncludes(css, '.bg-accent,', 'classes');
            expectIncludes(css, '.text-on-accent {', 'classes');
        }
    );

    check(
        'removed danger: no danger or error tokens, base inputs fall back to border-control',
        () => {
            const css = compileWith(
                `$generate-utility-classes: true, $semantic-colors: ("brand": #007bff, "success": #28a745, "warning": #ffc107, "info": #17a2b8)`
            );
            const { light, dark } = themeBlocks(css);
            for (const name of [
                'danger-500',
                'danger',
                'error',
                'text-on-error',
            ]) {
                expectNoToken(light, 'light', name);
                expectNoToken(dark, 'dark', name);
            }
            expectExcludes(css, `${P}danger`, 'output');
            expectExcludes(css, '.bg-error', 'classes');
            if (
                !new RegExp(
                    String.raw`:is\(\[aria-invalid=true\], :user-invalid\) \{\s*border-color: var\(${P}border-control\);`
                ).test(css)
            ) {
                fail(`base: invalid inputs do not use var(${P}border-control)`);
            }
        }
    );

    check(
        'breakpoints emit from the smallest width up whatever the map order',
        () => {
            const css = compileWith(
                '$generate-utility-classes: true, $breakpoints: ("sm": 640px, "lg": 1024px, "tablet": 900px)',
                '.t-bp { @include nu.apply(p(8) lg, p(4) tablet, p(2) sm); }'
            );
            const sm = css.indexOf('.p-4\\@sm {');
            const tablet = css.indexOf('.p-4\\@tablet {');
            const lg = css.indexOf('.p-4\\@lg {');
            if (!(sm > -1 && sm < tablet && tablet < lg)) {
                fail(
                    `classes: .p-4@sm ${sm}, .p-4@tablet ${tablet}, .p-4@lg ${lg} are not in ascending order`
                );
            }
            const at = (width) =>
                css.indexOf(`@media (min-width: ${width}) {\n  .t-bp {`);
            if (!(
                at('640px') > -1 &&
                at('640px') < at('900px') &&
                at('900px') < at('1024px')
            )) {
                fail(
                    'apply(): breakpoint items are not in ascending width order'
                );
            }
        }
    );

    check(
        'the default breakpoints in another key order give the default output',
        () => {
            const plain = compileWith('$generate-utility-classes: true');
            const shuffled = compileWith(
                '$generate-utility-classes: true, $breakpoints: ("2xl": 1536px, "md": 768px, "xs": 480px, "xl": 1280px, "sm": 640px, "lg": 1024px)'
            );
            if (plain !== shuffled) {
                fail('reordered default breakpoints changed the output');
            }
        }
    );

    check(
        'ruled behaviors: space-x is logical, .sticky defaults in :where(), @property inherits: false, scale(150) is a key, invalid inputs use danger, container-only(md) ends at 1023.98px',
        () => {
            const css = compileWith(
                '$generate-utility-classes: true',
                '.t-space { @include nu.apply(space-x(4)); }\n.t-scale { @include nu.scale(150); }\n.t-cq { @include nu.container-only(md) { color: red; } }'
            );
            expectIncludes(
                css,
                `.t-space > * + * {\n  margin-inline-start: var(${P}space-4);\n}`,
                'space-x(4)'
            );
            if (
                !/(^|\n):where\(\.sticky\) \{\n  top: 0;\n  z-index: 999;\n\}/.test(
                    css
                )
            ) {
                fail(
                    '.sticky: top 0 and z-index 999 are not in :where(.sticky)'
                );
            }
            if (/(^|\n)\.sticky \{[^}]*(top|z-index):/.test(css)) {
                fail('.sticky: top or z-index is set outside :where()');
            }
            const registrations = [
                ...css.matchAll(
                    new RegExp(
                        String.raw`@property (${P}[\w-]+) \{([^}]*)\}`,
                        'g'
                    )
                ),
            ];
            if (registrations.length === 0) {
                fail(`@property: no ${P}* registrations found`);
            }
            for (const [, name, body] of registrations) {
                if (!/\binherits: false;/.test(body)) {
                    fail(`@property ${name}: inherits is not false`);
                }
            }
            expectIncludes(
                css,
                `.t-scale {\n  ${P}scale-x: 1.5;\n  ${P}scale-y: 1.5;`,
                'scale(150)'
            );
            if (
                !new RegExp(
                    String.raw`:is\(\[aria-invalid=true\], :user-invalid\) \{\s*border-color: var\(${P}danger\);`
                ).test(css)
            ) {
                fail(`base: invalid inputs do not use var(${P}danger)`);
            }
            expectIncludes(
                css,
                '@container (min-width: 768px) and (max-width: 1023.98px) {\n  .t-cq {\n    color: red;',
                'container-only(md)'
            );
        }
    );

    check(
        'utility cascade: .hover-ready timing in :where(), .flex stretch children yield to .no-grow and .fill-*, nu.apply() takes map arguments through nu.animate-spin()',
        () => {
            const css = compileWith(
                '$generate-utility-classes: true',
                '.t-map { @include nu.apply(nu.animate-spin((duration: 2s)), p(4)); }'
            );
            expectIncludes(
                css,
                `\n.hover-ready {\n  transition-property: all;\n}\n\n:where(.hover-ready) {\n  transition-duration: var(${P}duration-200);`,
                '.hover-ready'
            );
            if (/\n\.hover-ready \{[^}]*transition-duration/.test(css)) {
                fail(
                    '.hover-ready: transition-duration is set outside :where()'
                );
            }
            if (/\.flex(\\@\w+)?\.stretch(\\@\w+)? > \*/.test(css)) {
                fail('.flex.stretch > * has the specificity of two classes');
            }
            expectIncludes(css, '.flex:where(.stretch) > *', 'stretch');
            expectIncludes(
                css,
                '  .flex:where(.stretch\\@md) > *',
                'stretch@md'
            );
            const stretchMd = css.indexOf('.flex:where(.stretch\\@md) > *');
            const noGrow = css.indexOf('.flex > .no-grow,');
            if (noGrow === -1 || stretchMd < noGrow) {
                fail(
                    'test premise: responsive stretch is expected after .flex > .no-grow'
                );
            }
            expectIncludes(
                css,
                `.t-map {\n  animation: anim-spin-normal 2s linear infinite;\n  padding: var(${P}space-4);`,
                'nu.apply(nu.animate-spin(map))'
            );
        }
    );

    check(
        'dark text-on-{role} picks from the dark theme text colors, light from the light ones',
        () => {
            const css = compileWith(
                '$light-theme: ("text-regular": #202020, "text-inverted": #fafafa), $dark-theme: ("text-regular": #e8e8e8, "text-inverted": #0c0c0c)'
            );
            const { light, dark } = themeBlocks(css);
            for (const role of [
                'brand',
                'success',
                'danger',
                'warning',
                'info',
            ]) {
                const lightValue = (
                    light[`text-on-${role}`] || ''
                ).toLowerCase();
                const darkValue = (dark[`text-on-${role}`] || '').toLowerCase();
                if (!['#202020', '#fafafa'].includes(lightValue)) {
                    fail(
                        `light text-on-${role} is ${lightValue}, not a light theme text color`
                    );
                }
                if (!['#e8e8e8', '#0c0c0c'].includes(darkValue)) {
                    fail(
                        `dark text-on-${role} is ${darkValue}, not a dark theme text color`
                    );
                }
            }
        }
    );

    check(
        'adaptive-contrast() raises the contrast ratio under prefers-contrast: more',
        () => {
            const colors = [
                '#336699',
                '#f0e68c',
                'brand',
                'danger',
                '#808080',
                '#222',
                '#eee',
            ];
            const css = compileWith(
                '$generate-utility-classes: false',
                colors
                    .map(
                        (color, index) =>
                            `.ac-${index} { @include nu.adaptive-contrast(${color}); }`
                    )
                    .join('\n')
            );
            colors.forEach((color, index) => {
                // First match: the plain rule; second: the rule inside @media (prefers-contrast: more)
                const [normal, high] = [
                    ...css.matchAll(
                        new RegExp(
                            `\\.ac-${index} \\{\\s*background-color: ([^;]+);\\s*color: ([^;]+);`,
                            'g'
                        )
                    ),
                ].map((match) => [parseColor(match[1]), parseColor(match[2])]);
                if (
                    !normal ||
                    !high ||
                    !css.includes('@media (prefers-contrast: more)') ||
                    [...normal, ...high].includes(null)
                ) {
                    fail(
                        `adaptive-contrast(${color}): output not found or not parsed`
                    );
                    return;
                }
                const before = contrast(normal[1], normal[0]);
                const after = contrast(high[1], high[0]);
                if (!(after > before)) {
                    fail(
                        `adaptive-contrast(${color}): ${before.toFixed(2)}:1 normally, ${after.toFixed(2)}:1 under prefers-contrast: more`
                    );
                }
            });
        }
    );

    check('custom hue (teal) gets a palette, hue roles and classes', () => {
        const css = compileWith(
            `$generate-utility-classes: true, $color-primitives: (${HUES}, "teal": #14b8a6)`
        );
        const { light, dark } = themeBlocks(css);
        expectToken(light, 'light', 'teal-500', '#14b8a6');
        expectToken(light, 'light', 'teal-subtle', `var(${P}teal-50)`);
        expectToken(light, 'light', 'text-teal');
        expectToken(dark, 'dark', 'teal-subtle', `var(${P}teal-950)`);
        expectNoToken(light, 'light', 'text-on-teal');
        expectIncludes(css, '.bg-teal,', 'classes');
        expectIncludes(css, '.text-teal,', 'classes');
    });

    check('unquoted color map keys give the same output as quoted keys', () => {
        const quoted = compileWith(
            `$generate-utility-classes: true, $semantic-colors: (${ROLES}), $color-primitives: (${HUES}, "teal": #14b8a6)`,
            '.x { a: nu.get-color(red, 700); b: nu.get-color(teal); @include nu.apply(bg(red), text-color(teal), text-on-color(brand)); }'
        );
        const unquoted = compileWith(
            `$generate-utility-classes: true, $semantic-colors: (${ROLES.replace(/"/g, '')}), $color-primitives: (${HUES.replace(/"/g, '')}, teal: #14b8a6)`,
            '.x { a: nu.get-color(red, 700); b: nu.get-color(teal); @include nu.apply(bg(red), text-color(teal), text-on-color(brand)); }'
        );
        if (quoted !== unquoted) {
            fail('unquoted keys changed the output');
        }
        expectIncludes(unquoted, `${P}red-700:`, 'unquoted');
        expectIncludes(unquoted, `${P}teal-subtle:`, 'unquoted');
    });

    check(
        'custom theme token in both maps: emitted per theme, class and token()',
        () => {
            const css = compileWith(
                `$generate-utility-classes: true, $light-theme: ("bg-brand-soft": brand 100), $dark-theme: ("bg-brand-soft": brand 900)`,
                '.x { a: nu.token("bg-brand-soft"); }'
            );
            const { light, dark, fallback } = themeBlocks(css);
            expectToken(light, 'light', 'bg-brand-soft', `var(${P}brand-100)`);
            expectToken(dark, 'dark', 'bg-brand-soft', `var(${P}brand-900)`);
            expectToken(
                fallback,
                'fallback',
                'bg-brand-soft',
                `var(${P}brand-900)`
            );
            expectIncludes(css, '.bg-brand-soft,', 'classes');
            expectIncludes(css, `a: var(${P}bg-brand-soft);`, 'token()');
        }
    );

    check(
        '$enable-dark-mode false: no dark block and no prefers-color-scheme fallback',
        () => {
            const css = compileWith('$enable-dark-mode: false');
            const blocks = parseBlocks(css);
            if (!blocks.has(LIGHT_SELECTOR)) {
                fail('light block is missing');
            }
            if (
                blocks.has(DARK_SELECTOR) ||
                blocks.has(DARK_FALLBACK_SELECTOR)
            ) {
                fail('a dark block was emitted');
            }
            expectExcludes(css, 'data-theme=inverse', 'output');
            expectExcludes(css, 'prefers-color-scheme: dark', 'output');
        }
    );

    check(
        'theme flag off: no tokens, token() errors, has-token() is false',
        () => {
            const css = compileWith(
                '$feature-flags: ("theme": false)',
                '@use "functions/tokens" as tokens;\n.x { a: tokens.has-token("brand"); }'
            );
            expectExcludes(css, `${P}brand:`, 'output');
            expectIncludes(css, 'a: false;', 'has-token("brand")');
            const message = compileError(
                '@use "index" as nu with ($feature-flags: ("theme": false));\n.x { a: nu.token("brand"); }'
            );
            if (message === null) {
                fail('token() compiled with the theme flag off');
            } else if (!message.includes('the theme feature flag is off')) {
                fail(`token() gave another error: ${message.split('\n')[0]}`);
            }
        }
    );

    check(
        '$generate-utility-classes false (the index.scss default): tokens emitted, no classes',
        () => {
            const css = compileWith('$generate-utility-classes: false');
            const { light, dark } = themeBlocks(css);
            expectToken(light, 'light', 'brand');
            expectToken(dark, 'dark', 'brand');
            expectExcludes(css, '.bg-brand', 'output');
            expectExcludes(css, '.p-4', 'output');
        }
    );

    check(
        '$parent-selector ".nu": classes and the light theme selector are scoped',
        () => {
            const css = compileWith(
                '$generate-utility-classes: true, $parent-selector: ".nu"'
            );
            const blocks = parseBlocks(css);
            if (!blocks.has(':root, .nu [data-theme=light]')) {
                fail(
                    'light block selector is not ":root, .nu [data-theme=light]"'
                );
            }
            if (!blocks.has(DARK_SELECTOR)) {
                fail('dark block is not global');
            }
            expectIncludes(css, '.nu .bg-brand,', 'classes');
            expectIncludes(css, '.nu .p-4 {', 'classes');
            if (/^\.bg-brand[ ,{]/m.test(css)) {
                fail('an unscoped .bg-brand rule was emitted');
            }
        }
    );

    check(
        'data-theme="inverse": dark values on a light page, light values under dark, the fallback and another inverse, dark again one level deeper',
        () => {
            const css = compileWith('$generate-utility-classes: false');
            const blocks = parseBlocks(css);
            const { light, dark } = themeBlocks(css);
            const lightUnderDark = blocks.get(INVERSE_LIGHT_SELECTOR);
            const lightUnderFallback = blocks.get(
                INVERSE_LIGHT_FALLBACK_SELECTOR
            );
            if (!lightUnderDark) {
                fail(`no "${INVERSE_LIGHT_SELECTOR}" block`);
            }
            if (!lightUnderFallback) {
                fail(`no "${INVERSE_LIGHT_FALLBACK_SELECTOR}" block`);
            }
            for (const name of Object.keys(dark)) {
                for (const [label, block] of [
                    ['inverse under dark', lightUnderDark],
                    ['inverse under the fallback', lightUnderFallback],
                ]) {
                    expectToken(block, label, name, light[name]);
                }
            }
            if (
                lightUnderDark &&
                Object.keys(lightUnderDark).length !== Object.keys(dark).length
            ) {
                fail(
                    `inverse under dark sets ${Object.keys(lightUnderDark).length} tokens, the dark block ${Object.keys(dark).length}`
                );
            }
            const outside = parseBlocks(css.replace(MEDIA_SCHEME_RE, ''));
            const darkMedia = parseBlocks(darkMediaText(css));
            for (const [selector, block] of [
                [INVERSE_DARK_SELECTOR, outside.get(INVERSE_DARK_SELECTOR)],
                [
                    INVERSE_DARK_FALLBACK_SELECTOR,
                    darkMedia.get(INVERSE_DARK_FALLBACK_SELECTOR),
                ],
            ]) {
                if (!block) {
                    fail(`no "${selector}" block`);
                    continue;
                }
                for (const name of Object.keys(dark)) {
                    expectToken(block, selector, name, dark[name]);
                }
            }
            if (!darkMediaText(css).includes(INVERSE_LIGHT_FALLBACK_SELECTOR)) {
                fail(
                    `"${INVERSE_LIGHT_FALLBACK_SELECTOR}" is not inside ${MEDIA_DARK}`
                );
            }
        }
    );

    check(
        'high contrast: every theme selector has a twin carrying the union of both maps, with values of its own theme',
        () => {
            const css = compileWith(HC_MAPS);
            const rules = themeRules(css);
            const twins = rules.filter((rule) => rule.prelude.includes(HC_IS));
            // The :root block holds the fixed tokens only and has no twin
            const bases = rules.filter(
                (rule) =>
                    !rule.prelude.includes(HC_IS) && rule.prelude !== ':root'
            );
            const { light, dark } = themeBlocks(css);
            const themeOf = (rule) =>
                rule.decls['bg-base'] === light['bg-base']
                    ? 'light'
                    : rule.decls['bg-base'] === dark['bg-base']
                      ? 'dark'
                      : null;
            if (bases.length !== 7 || twins.length !== bases.length) {
                fail(
                    `expected 7 theme blocks and 7 twins, found ${bases.length} and ${twins.length}`
                );
            }
            bases.forEach((base, index) => {
                const twin = twins[index];
                const expected = base.prelude
                    .split(', ')
                    .map((part) => `${part}${HC_IS}`)
                    .join(', ');
                if (
                    !twin ||
                    twin.prelude !== expected ||
                    twin.media !== base.media
                ) {
                    fail(
                        `twin ${index + 1} of "${base.prelude}" is "${twin && twin.prelude}"`
                    );
                    return;
                }
                const theme = themeOf(base);
                const own = theme === 'light' ? HC_LIGHT : HC_DARK;
                const fill = theme === 'light' ? light : dark;
                for (const name of HC_KEYS) {
                    expectToken(
                        twin.decls,
                        `${theme} twin "${twin.prelude}"`,
                        name,
                        own[name] ?? fill[name]
                    );
                }
            });
        }
    );

    check(
        'high contrast cascade: each element resolves to its theme, and under data-contrast="high" to that theme\'s map (asymmetric maps)',
        () => {
            const css = compileWith(HC_MAPS);
            const rules = themeRules(css);
            const { light, dark } = themeBlocks(css);
            const theme = (attrs) => ({ attrs: { 'data-theme': attrs } });
            const inverse = theme('inverse');
            // [label, scheme, element chain from the root, expected theme of each element]
            const cases = [
                [
                    'light root',
                    'light',
                    [theme('light'), inverse, inverse],
                    'LDL',
                ],
                [
                    'dark root',
                    'light',
                    [theme('dark'), inverse, inverse],
                    'DLD',
                ],
                [
                    'OS dark, no data-theme',
                    'dark',
                    [{}, inverse, inverse],
                    'DLD',
                ],
                [
                    'OS light, no data-theme',
                    'light',
                    [{}, inverse, inverse],
                    'LDL',
                ],
                [
                    'light section in a dark page',
                    'light',
                    [theme('dark'), theme('light')],
                    'DL',
                ],
                [
                    'light section in an OS dark page',
                    'dark',
                    [{}, theme('light')],
                    'DL',
                ],
                [
                    'dark section in a light page',
                    'light',
                    [theme('light'), theme('dark'), inverse],
                    'LDL',
                ],
            ];
            const highContrast = { 'data-contrast': 'high' };
            for (const [label, scheme, chain, themes] of cases) {
                // No high contrast, high contrast on the root, high contrast on an element below the root
                const variants = [
                    ['', chain, 0],
                    [
                        ' + hc root',
                        chain.map((spec, i) =>
                            i === 0
                                ? { attrs: { ...spec.attrs, ...highContrast } }
                                : spec
                        ),
                        1,
                    ],
                    [
                        ' + hc wrapper',
                        [chain[0], { attrs: highContrast }, ...chain.slice(1)],
                        1,
                    ],
                ];
                for (const [variant, specs, from] of variants) {
                    const wrapper = variant === ' + hc wrapper';
                    // Element positions in the chain, skipping the wrapper
                    const positions = specs
                        .map((_, i) => i)
                        .filter((i) => !(wrapper && i === 1));
                    positions.forEach((position, depth) => {
                        const element = elementChain(
                            specs.slice(0, position + 1)
                        );
                        const want = themes[depth] === 'L' ? 'light' : 'dark';
                        const values = want === 'light' ? light : dark;
                        const applies = from === 1 && !(wrapper && depth === 0);
                        const map = want === 'light' ? HC_LIGHT : HC_DARK;
                        const where = `${label}${variant}, element ${depth + 1} (${want})`;
                        const bg = cascadeValue(
                            rules,
                            element,
                            'bg-base',
                            scheme
                        );
                        if (bg !== values['bg-base']) {
                            fail(`${where}: bg-base is ${bg}`);
                        }
                        for (const name of HC_KEYS) {
                            const got = cascadeValue(
                                rules,
                                element,
                                name,
                                scheme
                            );
                            const expected = applies
                                ? (map[name] ?? values[name])
                                : values[name];
                            if (got !== expected) {
                                fail(
                                    `${where}: ${P}${name} is ${got}, expected ${expected}`
                                );
                            }
                        }
                    });
                }
            }
        }
    );

    check(
        'high contrast: emission rules for empty maps and dark mode off',
        () => {
            const onlyLight = themeRules(
                compileWith('$high-contrast-light: ("text-muted": #000)')
            );
            const lightTwins = onlyLight.filter((rule) =>
                rule.prelude.includes(HC_IS)
            );
            if (lightTwins.length !== 7) {
                fail(
                    `one map set: expected 7 twins (union with the base values), found ${lightTwins.length}`
                );
            }
            const noDark = compileWith(
                '$enable-dark-mode: false, $high-contrast-light: ("text-muted": #000), $high-contrast-dark: ("text-muted": #fff, "bg-nope": #000)'
            );
            const noDarkTwins = themeRules(noDark).filter((rule) =>
                rule.prelude.includes(HC_IS)
            );
            if (
                noDarkTwins.length !== 1 ||
                noDarkTwins[0].decls['text-muted'] !== '#000'
            ) {
                fail(
                    '$enable-dark-mode false: expected one light twin with the light map'
                );
            }
            expectExcludes(noDark, 'data-theme=dark', 'dark mode off');
            expectExcludes(noDark, 'bg-nope', 'dark mode off');
            const plain = compileWith('$generate-utility-classes: false');
            expectExcludes(plain, 'data-contrast', 'default output');
        }
    );

    check(
        'dark text-on-{role} is computed from the dark default fill: dark brand colors get the higher-contrast text (>= 4.5:1)',
        () => {
            for (const brand of ['#0b1f3a', '#000080']) {
                const { light, dark } = themeBlocks(
                    compileWith(`$brand: ${brand}`)
                );
                const layers = [dark, light];
                const color = (name) => parseColor(resolveToken(name, layers));
                const fill = color('brand');
                const text = color('text-on-brand');
                const best = ['text-regular', 'text-inverted']
                    .map((name) => [name, contrast(color(name), fill)])
                    .sort((a, b) => b[1] - a[1])[0];
                const ratio = contrast(text, fill);
                if (ratio < 4.5 || Math.abs(ratio - best[1]) > 1e-9) {
                    fail(
                        `$brand ${brand}: dark text-on-brand ${resolveToken('text-on-brand', layers)} gives ${ratio.toFixed(2)}:1 on ${resolveToken('brand', layers)}; ${best[0]} gives ${best[1].toFixed(2)}:1`
                    );
                }
            }
        }
    );

    check(
        'a computed text-on-{role} below 4.5:1 warns once per theme map; the default build warns nothing',
        () => {
            const { warnings } = compileSource(
                '@use "index" as nu with ($brand: #1ab5a5);'
            );
            const messages = warnings.map((warning) => warning.message);
            const textOn = messages.filter((message) =>
                message.startsWith('text-on-brand ($light-theme)')
            );
            if (textOn.length !== 1 || messages.length !== 1) {
                fail(
                    `$brand #1ab5a5: expected one text-on-brand warning, got ${JSON.stringify(messages)}`
                );
            }
            const fixed = compileSource(
                '@use "index" as nu with ($brand: #1ab5a5, $light-theme: ("brand": brand 800));'
            );
            if (fixed.warnings.length) {
                fail('brand: brand 800 still warns');
            }
            const build = compileFile(BUILD_FILE);
            if (build.warnings.length) {
                fail(
                    `default build warns: ${build.warnings.map((warning) => warning.message.split('\n')[0]).join('; ')}`
                );
            }
        }
    );

    check(
        '@property registrations do not depend on feature flags, so transform, gap, fill() and transition group mixins work with their classes off',
        () => {
            const css = compileWith(
                '$generate-utility-classes: false, $feature-flags: ("transforms": false, "position": false, "spacing": false, "flex": false, "transitions": false)',
                '.t { @include nu.apply(translate-x(4), rotate(45deg), gap(4)); }\n.c { @include nu.apply(fill(6)); }'
            );
            for (const name of [
                'translate-x',
                'translate-y',
                'translate-z',
                'scale-x',
                'scale-y',
                'rotate',
                'skew-x',
                'skew-y',
                'gap',
                'transition-colors',
                'transition-opacity',
                'transition-shadow',
                'transition-transform',
            ]) {
                expectIncludes(css, `@property ${P}${name} {`, 'flags off');
            }
            expectIncludes(
                css,
                `${P}translate-x: var(${P}space-4)`,
                'flags off'
            );
            expectIncludes(css, `${P}gap: var(${P}space-4)`, 'flags off');
        }
    );

    check(
        'flags own their classes: displays false keeps .flex and .grid, flex false and grid false remove them',
        () => {
            const noDisplays = compileWith(
                '$generate-utility-classes: true, $feature-flags: ("displays": false)'
            );
            for (const text of [
                '.flex {\n  display: flex;',
                '.flex:where(.inline) {',
                '.flex.row, .flex\\@xs.row,',
                '.grid {\n  display: grid;',
                '.grid.cols-3, .grid\\@xs.cols-3,',
                '.flex\\@md {\n    display: flex;',
                '.grid\\@md {\n    display: grid;',
            ]) {
                expectIncludes(noDisplays, text, 'displays false');
            }
            for (const text of [
                '.block {',
                '.hide {',
                '.truncate {',
                '.truncate\\@md',
                '.hide\\@md',
            ]) {
                expectExcludes(noDisplays, text, 'displays false');
            }

            const noFlex = compileWith(
                '$generate-utility-classes: true, $feature-flags: ("flex": false)'
            );
            if (/\.flex(?![\w-])/.test(noFlex)) {
                fail('flex false: a .flex class was emitted');
            }
            expectIncludes(noFlex, '.grid {', 'flex false');
            expectIncludes(noFlex, '.block {', 'flex false');

            const noGrid = compileWith(
                '$generate-utility-classes: true, $feature-flags: ("grid": false)'
            );
            if (/\.grid(?![\w-])/.test(noGrid)) {
                fail('grid false: a .grid class was emitted');
            }
            expectIncludes(noGrid, '.flex {', 'grid false');
        }
    );

    check(
        'typography flag (was config-typo): owns the text classes; responsive truncate stays with displays',
        () => {
            const noTypography = compileWith(
                '$generate-utility-classes: true, $feature-flags: ("typography": false)'
            );
            expectExcludes(noTypography, '.text-lg', 'typography false');
            expectExcludes(noTypography, '.font-bold', 'typography false');
            expectIncludes(noTypography, '.truncate\\@md', 'typography false');
            expectIncludes(
                noTypography,
                '.overflow-label\\@md',
                'typography false'
            );
            const all = compileWith('$generate-utility-classes: true');
            expectIncludes(all, '.text-lg {', 'default');
            expectIncludes(all, '.truncate\\@md', 'default');
            // The old name is ignored: a flag missing from the map counts as on
            const oldName = compileWith(
                '$generate-utility-classes: true, $feature-flags: ("config-typo": false)'
            );
            expectIncludes(oldName, '.text-lg {', 'config-typo false');
        }
    );

    check(
        `base flag: false drops the base layer, keeps the reset; base reads ${P}font-family`,
        () => {
            const on = compileWith('$generate-utility-classes: false');
            expectIncludes(on, '@layer base', 'default');
            expectIncludes(
                on,
                `  body {\n    background-color: var(${P}bg-base);`,
                'default'
            );
            expectIncludes(on, `font-family: var(${P}font-family);`, 'default');
            expectIncludes(
                on,
                `${P}font-family: system-ui, -apple-system, "BlinkMacSystemFont", "Segoe UI"`,
                'default'
            );
            const off = compileWith('$feature-flags: ("base": false)');
            expectExcludes(off, '@layer base', 'base false');
            expectExcludes(off, 'font-family: var(', 'base false');
            expectIncludes(off, '@layer reset', 'base false');
            expectIncludes(off, `${P}font-family:`, 'base false');
            const noTheme = compileWith('$feature-flags: ("theme": false)');
            expectIncludes(
                noTheme,
                'font-family: system-ui, -apple-system, "BlinkMacSystemFont"',
                'theme false'
            );
            expectExcludes(noTheme, `${P}font-family`, 'theme false');
        }
    );

    check(
        'utility classes: .hidden is an exact alias of .hide, with responsive forms and the same order',
        () => {
            const css = compileWith('$generate-utility-classes: true');
            expectIncludes(css, '\n.hidden {\n  display: none;\n}', '.hidden');
            expectExcludes(css, 'display: none !important', '.hidden');
            expectIncludes(
                css,
                '.hidden\\@md {\n    display: none;\n  }',
                '.hidden@md'
            );
            const order = (a, b, label) => {
                const ia = css.indexOf(a);
                const ib = css.indexOf(b);
                if (ia === -1 || ib === -1 || ia > ib) {
                    fail(`${label}: order wrong (${ia}, ${ib})`);
                }
            };
            order('\n.hide {', '\n.hidden {', '.hidden after .hide');
            order(
                '.hide\\@md {',
                '.hidden\\@md {',
                '.hidden@md after .hide@md'
            );
            order(
                '.hidden\\@md {',
                '.show\\@md {',
                '.show@md after .hidden@md'
            );
        }
    );

    check(
        'utility classes: .show reverts, .flex.stretch shares the row, property transitions get default timing',
        () => {
            const css = compileWith('$generate-utility-classes: true');
            expectIncludes(css, '.show {\n  display: revert;', '.show');
            expectIncludes(
                css,
                '.show\\@md {\n    display: revert;',
                '.show@md'
            );
            expectIncludes(
                css,
                '.flex:where(.stretch) > *, .flex\\@xs:where(.stretch) > *',
                '.stretch'
            );
            expectIncludes(css, '  flex: 1 1 0%;\n}', '.stretch');
            expectExcludes(css, 'justify-content: stretch', '.stretch');
            expectIncludes(
                css,
                `:where(.transition, .transition-colors, .transition-opacity, .transition-shadow, .transition-transform) {\n  transition-duration: var(${P}duration-200);\n  transition-timing-function: var(${P}ease-in-out);`,
                'transition defaults'
            );
            expectIncludes(css, '.opacity-50,', 'opacity class set');
            expectIncludes(css, '.opacity-33,', 'opacity class set');
            expectIncludes(
                css,
                `opacity: var(${P}opacity-50);`,
                'opacity token'
            );
            expectIncludes(css, `${P}opacity-66: 0.66;`, 'opacity token');
            expectIncludes(css, '[data-tooltip] {', 'tooltip trigger');
            expectExcludes(css, 'role~=tooltip', 'tooltip trigger');
        }
    );

    check(
        'transition property classes combine, a single class keeps its own properties, and group variables do not inherit',
        () => {
            const css = compileWith('$generate-utility-classes: true');
            // Top-level rules in source order: [selectors, declarations]
            const rules = [
                ...css.matchAll(/(?:^|\n)([^\s@{}][^{}]*)\{([^{}]*)\}/g),
            ].map((match) => [
                match[1].split(',').map((selector) => selector.trim()),
                match[2],
            ]);
            // Declared value of a property on an element with these classes (equal specificity: the last rule wins)
            const declared = (classes, property) => {
                let value;
                for (const [selectors, body] of rules) {
                    if (
                        !selectors.some((selector) =>
                            classes.includes(selector)
                        )
                    ) {
                        continue;
                    }
                    const found = new RegExp(
                        String.raw`(?:^|;|\n)\s*${property}: ([^;]+);`
                    ).exec(body);
                    if (found) {
                        value = found[1];
                    }
                }
                return value;
            };
            // Computed transition-property names after var() substitution, without the unused fallback
            const effective = (classes) =>
                (declared(classes, 'transition-property') ?? '')
                    .replace(
                        new RegExp(
                            String.raw`var\((${P}[\w-]+), ([^)]+)\)`,
                            'g'
                        ),
                        (all, name, fallback) =>
                            declared(classes, name) ?? fallback
                    )
                    .split(',')
                    .map((name) => name.trim())
                    .filter((name) => name && name !== `${P}none`)
                    .join(', ');
            const colors =
                'color, background-color, border-color, text-decoration-color, fill, stroke';
            for (const [classes, expected] of [
                [['.transition-colors'], colors],
                [['.transition-transform'], 'transform'],
                [['.transition-opacity'], 'opacity'],
                [['.transition-shadow'], 'box-shadow'],
                [
                    ['.transition-colors', '.transition-transform'],
                    `${colors}, transform`,
                ],
                [
                    ['.transition-opacity', '.transition-shadow'],
                    'opacity, box-shadow',
                ],
                [['.transition'], 'all'],
                [['.transition-none'], 'none'],
            ]) {
                const got = effective(classes);
                if (got !== expected) {
                    fail(
                        `class="${classes.map((name) => name.slice(1)).join(' ')}": transition-property resolves to "${got}", expected "${expected}"`
                    );
                }
            }
            for (const name of ['colors', 'opacity', 'shadow', 'transform']) {
                const registration = new RegExp(
                    String.raw`@property ${P}transition-${name} \{\n  syntax: "\*";\n  inherits: false;\n\}`
                );
                if (!registration.test(css)) {
                    fail(
                        `@property ${P}transition-${name}: not registered with syntax "*" and inherits: false`
                    );
                }
            }
        }
    );

    check(
        'transition defaults: base buttons and fields follow $transition-default-duration and -ease',
        () => {
            const css = compileWith(
                '$transition-default-duration: "300", $transition-default-ease: "out"'
            );
            expectIncludes(
                css,
                `background-color var(${P}duration-300) var(${P}ease-out)`,
                'base button transition'
            );
            expectIncludes(
                css,
                `transition: border-color var(${P}duration-300) var(${P}ease-out);`,
                'base field transition'
            );
            expectExcludes(
                css,
                `var(${P}duration-200) var(${P}ease-in-out)`,
                'base defaults'
            );
        }
    );

    check(
        '$opacities: a custom map replaces the opacity classes and tokens',
        () => {
            const css = compileWith(
                '$generate-utility-classes: true, $opacities: (0: 0, 15: 0.15, 100: 1)'
            );
            expectIncludes(css, `${P}opacity-15: 0.15;`, 'tokens');
            expectIncludes(css, '.opacity-15,', 'classes');
            expectExcludes(css, '.opacity-50', 'classes');
            expectIncludes(css, '.w-50', 'percentage widths keep $percentages');
        }
    );

    check(
        'tooltips: emitted without utility classes, top is the default position, color variables follow each theme block',
        () => {
            const css = compileWith('$generate-utility-classes: false');
            expectIncludes(css, '[data-tooltip] {', 'no utility classes');
            expectIncludes(
                css,
                '[data-tooltip]:not([data-tooltip-position])::before,\n  [data-tooltip][data-tooltip-position|=top]::before {',
                'default position'
            );
            expectIncludes(
                css,
                '[data-tooltip]:not([data-tooltip-position])::after,\n  [data-tooltip][data-tooltip-position|=top]::after {',
                'default position'
            );
            const blocks = parseBlocks(css);
            for (const [selector, label] of [
                [LIGHT_SELECTOR, 'light'],
                [DARK_SELECTOR, 'dark'],
                [INVERSE_LIGHT_SELECTOR, 'inverse light'],
            ]) {
                const block = blocks.get(selector);
                expectToken(
                    block,
                    label,
                    'tooltip--Background',
                    `var(${P}text-regular)`
                );
                expectToken(
                    block,
                    label,
                    'tooltip--Color',
                    `var(${P}text-inverted)`
                );
            }
        }
    );

    check(
        'utility output: .p-4 token, backdrop hue classes and -webkit- twin, reduced-motion reset, $container-names',
        () => {
            const css = compileWith(
                '$generate-utility-classes: true, $container-names: ("rail")'
            );
            expectIncludes(
                css,
                `.p-4 {\n  padding: var(${P}space-4);\n}`,
                'spacing class'
            );
            expectIncludes(
                css,
                `.backdrop-hue-rotate-90 {\n  ${P}backdrop-hue-rotate: hue-rotate(90deg);`,
                'backdrop hue class'
            );
            expectExcludes(css, '.backdrop-hue-90', 'backdrop hue class');
            expectIncludes(
                css,
                `-webkit-backdrop-filter: var(${P}backdrop-blur)`,
                'backdrop -webkit- twin'
            );
            expectIncludes(
                css,
                '@media (prefers-reduced-motion: reduce) {\n    *,\n    *::before,\n    *::after {\n      animation-duration: 0.01ms !important;',
                'reduced-motion reset'
            );
            expectIncludes(
                css,
                '.container-rail {\n  container-name: rail;',
                '$container-names'
            );
            expectExcludes(css, '.container-sidebar', '$container-names');
        }
    );

    check(
        'high contrast: one map setting text-on-{role} carries {role} in both twins (no cross-theme leak)',
        () => {
            const css = compileWith(
                '$high-contrast-dark: ("text-on-brand": #fff)'
            );
            const rules = themeRules(css);
            const { light, dark } = themeBlocks(css);
            const hc = { 'data-contrast': 'high' };
            const cases = [
                ['OS dark root', 'dark', [{ attrs: hc }], dark, '#fff'],
                [
                    'OS light root',
                    'light',
                    [{ attrs: hc }],
                    light,
                    light['text-on-brand'],
                ],
                [
                    'dark root',
                    'light',
                    [{ attrs: { ...hc, 'data-theme': 'dark' } }],
                    dark,
                    '#fff',
                ],
                [
                    'inverse in an OS dark page',
                    'dark',
                    [{ attrs: hc }, { attrs: { 'data-theme': 'inverse' } }],
                    light,
                    light['text-on-brand'],
                ],
                [
                    'inverse in a dark root',
                    'light',
                    [
                        { attrs: { ...hc, 'data-theme': 'dark' } },
                        { attrs: { 'data-theme': 'inverse' } },
                    ],
                    light,
                    light['text-on-brand'],
                ],
                [
                    'inverse in inverse in an OS light page',
                    'light',
                    [
                        { attrs: hc },
                        { attrs: { 'data-theme': 'inverse' } },
                        { attrs: { 'data-theme': 'inverse' } },
                    ],
                    light,
                    light['text-on-brand'],
                ],
            ];
            for (const [label, scheme, chain, values, textOn] of cases) {
                const element = elementChain(chain);
                const fill = cascadeValue(rules, element, 'brand', scheme);
                const text = cascadeValue(
                    rules,
                    element,
                    'text-on-brand',
                    scheme
                );
                if (fill !== values['brand']) {
                    fail(
                        `${label}: brand is ${fill}, expected ${values['brand']}`
                    );
                }
                if (text !== textOn) {
                    fail(
                        `${label}: text-on-brand is ${text}, expected ${textOn}`
                    );
                }
            }
        }
    );

    check(
        'high contrast: text color overrides recompute text-on, explicit text-on values are kept',
        () => {
            const recompute = parseBlocks(
                compileWith('$high-contrast-light: ("text-regular": #000)')
            );
            const twin = recompute.get(
                ':root:is([data-contrast=high], [data-contrast=high] *), [data-theme=light]:is([data-contrast=high], [data-contrast=high] *)'
            );
            expectToken(twin, 'light twin', 'text-on-warning', '#000');
            expectToken(twin, 'light twin', 'warning');

            const kept = parseBlocks(
                compileWith(
                    '$light-theme: ("text-on-brand": #000), $high-contrast-light: ("brand": brand 900)'
                )
            );
            const keptTwin = kept.get(
                ':root:is([data-contrast=high], [data-contrast=high] *), [data-theme=light]:is([data-contrast=high], [data-contrast=high] *)'
            );
            expectToken(
                keptTwin,
                'explicit text-on',
                'brand',
                `var(${P}brand-900)`
            );
            expectToken(keptTwin, 'explicit text-on', 'text-on-brand', '#000');
        }
    );

    check(
        'theme maps: color-named keys, quoted colors, quoted font list, dark-off custom keys, explicit text-on classes',
        () => {
            const tan = parseBlocks(
                compileWith(
                    '$generate-utility-classes: true, $light-theme: (tan: #d2b48c), $dark-theme: (tan: #333)'
                )
            );
            expectToken(tan.get(LIGHT_SELECTOR), 'color key', 'tan', '#d2b48c');

            const basic = compileError(
                '@use "functions/tokens" as t;\n@if not t.has-token(black) or not t.has-token("black") { @error "has-token(black) is false"; }\n@error "ok";'
            );
            if (basic !== '"ok"') {
                fail(`has-token(black): ${basic && basic.split('\n')[0]}`);
            }

            const quoted = themeBlocks(
                compileWith('$light-theme: ("text-regular": "#111111")')
            );
            expectToken(
                quoted.light,
                'quoted color',
                'text-on-brand',
                '#f1f1f1'
            );
            expectToken(
                quoted.light,
                'quoted color',
                'text-on-warning',
                '#111111'
            );

            const fonts = compileWith('$font-family: "Inter, sans-serif"');
            expectIncludes(
                fonts,
                `${P}font-family: Inter, sans-serif;`,
                'quoted font list'
            );
            const fontsOff = compileWith(
                '$font-family: "Inter, sans-serif", $feature-flags: ("theme": false)'
            );
            expectIncludes(
                fontsOff,
                'font-family: Inter, sans-serif;',
                'quoted font list, theme off'
            );

            const darkOff = compileWith(
                '$enable-dark-mode: false, $light-theme: ("my-accent": #f00)',
                '.x { color: nu.token(my-accent); }'
            );
            expectIncludes(
                darkOff,
                `${P}my-accent: #f00;`,
                'dark off custom key'
            );

            const explicit = compileWith(
                '$generate-utility-classes: true, $light-theme: ("text-on-brand": #000), $dark-theme: ("text-on-brand": #fff)'
            );
            expectIncludes(
                explicit,
                `.text-on-brand {\n  color: var(${P}text-on-brand);`,
                'explicit text-on class'
            );
            expectExcludes(
                explicit,
                'hover\\:text-on-brand',
                'explicit text-on class'
            );

            const custom = compileWith(
                '$generate-utility-classes: true, $light-theme: ("text-on-accent": #fff), $dark-theme: ("text-on-accent": #000)'
            );
            expectIncludes(
                custom,
                `.text-on-accent,\n.hover\\:text-on-accent:hover,\n.group:hover .group-hover\\:text-on-accent {\n  color: var(${P}text-on-accent);`,
                'custom text-on key (not a role) classes'
            );
        }
    );

    check(
        'theme feature off: color names raise a theme flag error naming the mixin',
        () => {
            for (const [body, expected] of [
                [
                    '.x { @include nu.bg(brand); }',
                    `bg(brand): color names give ${P}* tokens`,
                ],
                [
                    '.x { @include nu.text-color(muted); }',
                    `text-color(muted): color names give ${P}* tokens`,
                ],
                [
                    '.x { @include nu.border-color(red); }',
                    `border-color(red): color names give ${P}* tokens`,
                ],
                [
                    '.x { @include nu.bg(red, 600); }',
                    `bg(red, 600): color names give ${P}* tokens`,
                ],
            ]) {
                const message = compileError(
                    `@use "index" as nu with ($feature-flags: ("theme": false));\n${body}`
                );
                if (message === null || !message.includes(expected)) {
                    fail(
                        `${body}: expected "${expected}", got: ${message && message.split('\n')[0]}`
                    );
                }
            }
            const basic = compileWith(
                '$feature-flags: ("theme": false)',
                '.x { @include nu.bg(black); @include nu.text-color(white); @include nu.border-color(transparent); }'
            );
            expectIncludes(
                basic,
                '.x {\n  background-color: black;\n  color: white;\n  border-color: transparent;',
                'basic colors, theme off'
            );
        }
    );

    check(
        'utility cascade: two-class display rules at one class, auto margins after .m-*, absolute-center translate in :where()',
        () => {
            const css = compileWith('$generate-utility-classes: true');
            for (const text of [
                '.flex:where(.inline) {\n  display: inline-flex;',
                '.grid:where(.inline) {\n  display: inline-grid;',
                '.container:where(.flex) {\n  display: flex;',
                '.container:where(.grid) {\n  display: grid;',
                `:where(.absolute-center) {\n  ${P}translate-x: -50%;`,
            ]) {
                expectIncludes(css, text, 'cascade');
            }
            for (const text of [
                '.flex.inline',
                '.grid.inline',
                '.container.flex',
                '.container.grid',
            ]) {
                expectExcludes(css, text, 'cascade');
            }
            const order = (a, b, label) => {
                const ia = css.indexOf(a);
                const ib = css.indexOf(b);
                if (ia === -1 || ib === -1 || ia > ib) {
                    fail(
                        `${label}: ${a} must come after... ${b} order wrong (${ia}, ${ib})`
                    );
                }
            };
            order('\n.m-4 {', '\n.mx-auto {', 'auto margins after .m-*');
            order(
                '\n  .m-4\\@md {',
                '\n  .mx-auto\\@md {',
                'responsive auto margins after .m-*@md'
            );
            order(
                '\n.flex:where(.inline) {',
                '\n.hide {',
                '.hide after .flex.inline'
            );
        }
    );

    check(
        'base layer: list-box selects keep their height, only inline code is nowrap, the reset layer comes first when mixins-map loads before index',
        () => {
            const css = compileWith('$generate-utility-classes: false');
            expectIncludes(
                css,
                `select:not([multiple], :where([size]:not([size="1"])))) {\n    height: var(${P}control-height-md);`,
                'select height'
            );
            expectIncludes(
                css,
                ':not(pre) > code {\n    white-space: nowrap;',
                'inline code'
            );
            const mm = compileSource(
                '@use "mixins-map" as *;\n@use "index";'
            ).css;
            const reset = mm.indexOf('@layer reset {');
            const base = mm.indexOf('@layer base {');
            if (reset === -1 || base === -1 || reset > base) {
                fail(
                    `mixins-map: @layer reset (${reset}) must come before @layer base (${base})`
                );
            }
        }
    );

    check(
        'mixins entry: no CSS output, with() configures it and is validated',
        () => {
            const pkg = JSON.parse(
                fs.readFileSync(path.join(CORE_DIR, 'package.json'), 'utf8')
            );
            const target = pkg.exports['./mixins']?.sass;
            if (target !== './src/styles/mixins/index.scss') {
                fail(`package.json exports ./mixins sass is ${target}`);
            }
            for (const source of [
                '@use "../src/styles/mixins";',
                '@use "../src/styles/mixins" with ($brand: #4361ee, $generate-utility-classes: true, $enable-debugger: true);',
                '@use "../src/styles/mixins" as nu;\n@use "mixins-map" as *;',
            ]) {
                const { css, warnings } = compileSource(source);
                if (css.trim() !== '') {
                    fail(`${source} emits CSS: ${css.slice(0, 80)}`);
                }
                warnings.forEach((warning) =>
                    fail(`warning: ${warning.message.split('\n')[0]}`)
                );
            }
            const unknown = compileError(
                '@use "../src/styles/mixins" with ($nope: 1);'
            );
            if (!unknown || !unknown.includes('not declared with !default')) {
                fail(`mixins entry with ($nope: 1): ${unknown}`);
            }
            const theme = compileError(
                '@use "../src/styles/mixins" with ($light-theme: ("bg-surfase": #fff));'
            );
            const themeMain = compileError(
                '@use "index" with ($light-theme: ("bg-surfase": #fff));'
            );
            if (!theme || theme !== themeMain) {
                fail(
                    `mixins entry theme validation differs from index: ${theme} / ${themeMain}`
                );
            }
            const hidden = compileError(
                '@use "../src/styles/mixins" as nu;\n.a { b: nu.$output-mixins; }'
            );
            if (!hidden) {
                fail('the mixins entry exposes $output-mixins');
            }
        }
    );

    check(
        'mixins entry and index share one configuration in one compile',
        () => {
            const shared = compileSource(
                '@use "../src/styles/mixins" with ($brand: #4361ee, $generate-utility-classes: true);\n@use "index";'
            ).css;
            const direct = compileWith(
                '$brand: #4361ee, $generate-utility-classes: true'
            );
            if (shared !== direct) {
                fail('shared configuration output differs from index with()');
            }
            const late = compileError(
                '@use "index";\n@use "../src/styles/mixins" with ($brand: #4361ee);'
            );
            if (!late || !late.includes('already loaded')) {
                fail(`configuring the mixins entry after index: ${late}`);
            }
        }
    );

    check(
        'em breakpoints and fractional spacing keys: container, debugger and sizing compile',
        () => {
            const em = compileWith(
                '$generate-utility-classes: true, $enable-debugger: true, $breakpoints: ("sm": 40em, "md": 48em, "lg": 64rem)'
            );
            expectIncludes(
                em,
                'max-width: calc(40em - 100px);',
                'container em'
            );
            expectIncludes(em, '(max-width: 47.99875em)', 'debugger em');
            const px = compileWith('$generate-utility-classes: true');
            expectIncludes(
                px,
                '@media (min-width: 768px) {\n  .container {\n    max-width: 668px;',
                'container px'
            );

            const half = compileSource(
                '@use "config/spacing" with ($spacings: (0: 0, "1/2": 0.125rem, 1: 0.25rem, 2: 0.5rem, 4: 1rem));\n@use "index" as nu with ($generate-utility-classes: false);\n.a { @include nu.width("1/2"); @include nu.p("1/2"); }'
            ).css;
            expectIncludes(
                half,
                `.a {\n  width: var(${P}space-1-2);\n  padding: var(${P}space-1-2);`,
                'fractional key'
            );
        }
    );

    check(
        'raw-value caches: 300 unique raw values in one compile (past the 128-entry cap) give the same rules as small compiles',
        () => {
            const count = 300;
            const hex = (i, salt) =>
                `#${(((i + salt) * 2654435761) >>> 8).toString(16).padStart(6, '0').slice(-6)}`;
            const rule = (i) =>
                `.r${i} { @include bg(${hex(i, 1)}, 600); @include p(${i + 1}px); color: get-color(${hex(i, 7)}, 300); @include apply(bg(${hex(i, 13)}, 400) hover, m(${i + 1}.5px)); }`;
            const compileRules = (from, to) => {
                const body = [];
                for (let i = from; i < to; i++) {
                    body.push(rule(i));
                }
                const { css } = compileSource(
                    `@use "index" as * with ($generate-utility-classes: false);\n${body.join('\n')}`
                );
                return css.slice(css.indexOf(`.r${from} {`));
            };
            const whole = compileRules(0, count);
            let parts = '';
            // Batches of 40 stay under the cap, so nothing is evicted there
            for (let from = 0; from < count; from += 40) {
                parts +=
                    (parts ? '\n\n' : '') +
                    compileRules(from, Math.min(from + 40, count));
            }
            if (whole.trim() !== parts.trim()) {
                const a = whole.split('\n');
                const b = parts.split('\n');
                const at = a.findIndex((line, i) => line !== b[i]);
                fail(
                    `line ${at + 1} differs: one compile "${a[at]}", batches "${b[at]}"`
                );
            }
        }
    );

    check(
        'default color scales: every default role and palette color is a key of the precomputed scales',
        () => {
            const message = compileError(
                '@use "sass:map";\n@use "sass:meta";\n@use "config/colors" as c;\n@use "functions/default-scales" as d;\n@each $name, $value in map.merge(c.$semantic-colors, c.$color-primitives) { @if not map.has-key(d.$default-color-scales, meta.inspect($value)) { @error "#{$name} (#{$value}) is not precomputed"; } }\n@error "ok";'
            );
            if (message !== 'ok' && !message?.startsWith('"ok"')) {
                fail(
                    message
                        ? message.split('\n')[0]
                        : 'compiled without the closing check'
                );
            }
        }
    );

    for (const [label, entries, expected] of ERROR_CASES) {
        check(`validator rejects: ${label}`, () => {
            const message = compileError(
                `@use "index" as nu with (${entries});`
            );
            if (message === null) {
                fail('compiled without an error');
            } else if (!message.includes(expected)) {
                fail(`expected "${expected}", got: ${message.split('\n')[0]}`);
            }
        });
    }

    if (failures.length > 0) {
        console.log(`\n${failures.length} config failure(s):`);
        failures.forEach((failure) => console.log(`  ${failure}`));
        process.exit(1);
    }
    console.log('\nconfig: all checks pass');
}

run();
