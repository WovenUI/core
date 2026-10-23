// Token system integrity checks against the v2 decision record.
//
// Usage: node test/tokens.mjs
//
// Checks:
//   0. build.scss and index.scss compile with no warning.
//   1. Every var(--wu-*) used in build.scss and index.scss output is defined in that output
//      (a declaration or an @property registration).
//   2. Every ruled token family exists in the light block.
//   3. Every theme and role token exists in the dark block (and in the prefers-color-scheme fallback,
//      which must match the dark block); palette, basic and scale tokens are absent from dark.
//   4. token() accepts every emitted name and rejects a sample of bad names with its own error.
//   5. error-* tokens reference the matching danger token in light and dark.
// Exits with code 1 on any failure.
import {
    BASIC,
    BUILD_FILE,
    INDEX_FILE,
    P,
    PREFIX,
    ROLES,
    ROLE_STATES,
    roleToken,
    SCALE_FAMILIES,
    inFamily,
    STOPS,
    compileFile,
    compileSource,
    isPalette,
    isScale,
    paletteHues,
    paletteNames,
    themeBlocks,
} from './helpers.mjs';

const BAD_TOKEN_NAMES = [
    'brand-hovr',
    'brand-default',
    'brand-1000',
    'primary',
    'secondary',
    'text-normal',
    'bg-bg-surface',
    `${P}brand`,
    `${PREFIX}-brand`,
    '',
];

const failures = [];
const fail = (message) => failures.push(message);

function check(label, fn) {
    const before = failures.length;
    try {
        fn();
    } catch (error) {
        fail(`${label}: ${error.message}`);
    }
    const count = failures.length - before;
    console.log(
        `${count === 0 ? 'pass' : 'FAIL'}  ${label}${count ? ` (${count})` : ''}`
    );
}

function definedNames(css) {
    return new Set(
        [
            ...css.matchAll(
                new RegExp(String.raw`(${P}[a-zA-Z0-9_-]+)\s*:`, 'g')
            ),
            ...css.matchAll(
                new RegExp(String.raw`@property\s+(${P}[a-zA-Z0-9_-]+)`, 'g')
            ),
        ].map((match) => match[1])
    );
}

function usedNames(css) {
    return new Set(
        [
            ...css.matchAll(
                new RegExp(String.raw`var\(\s*(${P}[a-zA-Z0-9_-]+)`, 'g')
            ),
        ].map((match) => match[1])
    );
}

function expectedThemeTokens(light) {
    const names = [
        'bg-base',
        'bg-surface',
        'bg-alternate',
        'bg-raised',
        'bg-hover',
        'bg-selected',
        'bg-disabled',
        'text-regular',
        'text-muted',
        'text-subtle',
        'text-inverted',
        'text-link',
        'text-link-hover',
        'border-regular',
        'border-strong',
        'border-control',
        'border-control-hover',
        'border-focus',
        'border-focus-width',
        'border-focus-offset',
    ];
    for (const role of [...ROLES, 'error']) {
        ROLE_STATES.forEach((state) => names.push(roleToken(role, state)));
        names.push(`text-${role}`, `text-on-${role}`);
    }
    for (const hue of paletteHues(light)) {
        names.push(`${hue}-subtle`, `${hue}-border`, `text-${hue}`);
    }
    return names;
}

function run() {
    const buildResult = compileFile(BUILD_FILE);
    const indexResult = compileFile(INDEX_FILE);
    const build = buildResult.css;
    const index = indexResult.css;
    const { light, lightBlock, root, dark, fallback } = themeBlocks(build);
    const palettes = paletteNames(light);
    const hues = paletteHues(light);
    console.log(`Palettes: ${palettes.join(', ')}`);
    console.log(`Hues: ${hues.join(', ')}\n`);

    for (const [label, result] of [
        ['build.scss', buildResult],
        ['index.scss', indexResult],
    ]) {
        check(`${label} compiles with no warning`, () => {
            result.warnings.forEach((warning) =>
                fail(
                    `${label}: warning: ${warning.message.split('\n')[0]}${warning.where ? ` (${warning.where})` : ''}`
                )
            );
        });
    }

    for (const [label, css] of [
        ['build.scss', build],
        ['index.scss', index],
    ]) {
        check(`every var(${P}*) used in ${label} output is defined`, () => {
            const defined = definedNames(css);
            const used = usedNames(css);
            if (used.size === 0) {
                fail(`${label}: no var(${P}*) usage found`);
            }
            for (const name of used) {
                if (!defined.has(name)) {
                    fail(`${label}: ${name} is used but never defined`);
                }
            }
        });
    }

    check(
        'roles brand, success, danger, warning, info each have a full palette',
        () => {
            ROLES.forEach((role) => {
                if (!palettes.includes(role)) {
                    fail(
                        `palette for role ${role} is missing (stops ${STOPS.join(', ')})`
                    );
                }
            });
            if (hues.length === 0) {
                fail('no palette hues found');
            }
        }
    );

    check('every ruled theme token family exists in light', () => {
        for (const name of expectedThemeTokens(light)) {
            if (!(name in light)) {
                fail(`light: ${P}${name} is missing`);
            }
        }
    });

    check('every scale family exists in light', () => {
        for (const [prefix] of SCALE_FAMILIES) {
            if (!Object.keys(light).some((name) => inFamily(name, prefix))) {
                fail(`light: no ${P}${prefix}-* tokens`);
            }
        }
        for (const size of ['sm', 'md', 'lg']) {
            for (const family of ['control-height', 'control-padding-inline']) {
                if (!(`${family}-${size}` in light)) {
                    fail(`light: ${P}${family}-${size} is missing`);
                }
            }
        }
    });

    check(
        'fixed tokens are in the :root block only; the light block holds theme tokens only',
        () => {
            const isFixed = (name) =>
                isPalette(name, palettes) ||
                isScale(name) ||
                BASIC.includes(name);
            for (const name of Object.keys(root)) {
                if (!isFixed(name)) {
                    fail(`:root block: ${P}${name} is not a fixed token`);
                }
                if (name in lightBlock) {
                    fail(`${P}${name} is in both :root and the light block`);
                }
            }
            for (const name of Object.keys(lightBlock)) {
                if (isFixed(name)) {
                    fail(`light block: ${P}${name} is a fixed token`);
                }
            }
            if (!('font-family' in root)) {
                fail(`:root block: ${P}font-family is missing`);
            }
        }
    );

    check('basic color tokens exist in light', () => {
        BASIC.forEach((name) => {
            if (!(name in light)) {
                fail(`light: ${P}${name} is missing`);
            }
        });
    });

    const themeTokens = Object.keys(light).filter(
        (name) =>
            !isPalette(name, palettes) &&
            !isScale(name) &&
            !BASIC.includes(name)
    );

    check('every theme and role token in light also exists in dark', () => {
        for (const name of themeTokens) {
            if (!(name in dark)) {
                fail(`dark: ${P}${name} is missing`);
            }
        }
    });

    check(
        'dark defines no palette, basic or scale tokens and nothing outside light',
        () => {
            for (const name of Object.keys(dark)) {
                if (
                    isPalette(name, palettes) ||
                    isScale(name) ||
                    BASIC.includes(name)
                ) {
                    fail(
                        `dark: ${P}${name} must not be redefined in dark (fixed across themes)`
                    );
                } else if (!(name in light)) {
                    fail(`dark: ${P}${name} has no light value`);
                }
            }
        }
    );

    check('prefers-color-scheme fallback matches the dark block', () => {
        if (!fallback) {
            fail(':root:not([data-theme]) fallback block not found');
            return;
        }
        const keys = new Set([...Object.keys(dark), ...Object.keys(fallback)]);
        for (const name of keys) {
            if (dark[name] !== fallback[name]) {
                fail(
                    `fallback ${P}${name} is ${fallback[name]}, dark is ${dark[name]}`
                );
            }
        }
    });

    check('error-* tokens reference danger in light and dark', () => {
        const aliases = {};
        ROLE_STATES.forEach(
            (state) =>
                (aliases[roleToken('error', state)] = roleToken(
                    'danger',
                    state
                ))
        );
        aliases['text-error'] = 'text-danger';
        aliases['text-on-error'] = 'text-on-danger';
        for (const [themeName, block] of [
            ['light', light],
            ['dark', dark],
        ]) {
            for (const [alias, target] of Object.entries(aliases)) {
                if (block[alias] !== `var(${P}${target})`) {
                    fail(
                        `${themeName}: ${P}${alias} is ${block[alias]}, expected var(${P}${target})`
                    );
                }
            }
        }
    });

    check('token() accepts every emitted name', () => {
        // Component variables (--wu-tooltip--Background) are re-declared in theme blocks but are not tokens
        const names = Object.keys(light).filter((name) => !name.includes('--'));
        const body = names
            .map((name, index) => `  t${index}: nu.token("${name}");`)
            .join('\n');
        const { css, warnings } = compileSource(
            `@use "index" as nu;\n.t {\n${body}\n}\n`
        );
        names.forEach((name, index) => {
            const match = css.match(new RegExp(`\\bt${index}: ([^;]+);`));
            if (!match || match[1] !== `var(${P}${name})`) {
                fail(`token("${name}") gave ${match ? match[1] : 'nothing'}`);
            }
        });
        warnings.forEach((warning) => fail(`warning: ${warning.message}`));
        // Unquoted black, white and transparent arrive as colors
        const basic = compileSource(
            `@use "index" as nu;\n.t { a: nu.token(black); b: nu.token(white); c: nu.token(transparent); }\n`
        ).css;
        BASIC.forEach((name) => {
            if (!basic.includes(`var(${P}${name})`)) {
                fail(`token(${name}) unquoted did not return var(${P}${name})`);
            }
        });
    });

    check('token() rejects bad names', () => {
        const cases = [
            ...BAD_TOKEN_NAMES.map((name) => `"${name}"`),
            '12',
            'brand-hovr',
            'brand-default',
        ];
        for (const arg of cases) {
            try {
                compileSource(
                    `@use "index" as nu;\n.t { a: nu.token(${arg}); }\n`
                );
                fail(`token(${arg}) compiled without an error`);
            } catch (error) {
                const message = error.sassMessage ?? error.message;
                if (!/^["']?token\(/.test(message)) {
                    fail(
                        `token(${arg}) failed with an unexpected error: ${message.split('\n')[0]}`
                    );
                } else if (
                    /brand-default/.test(arg) &&
                    !message.includes('use token(brand)')
                ) {
                    fail(
                        `token(${arg}) does not name the new token: ${message}`
                    );
                }
            }
        }
    });

    check(
        'shared configuration: the global stylesheet emits the configured brand',
        () => {
            const global = compileSource(
                '@use "fixtures/shared-config/woven";\n@use "index";'
            ).css;
            const fixed = themeBlocks(global).root;
            if (fixed['brand-500'] !== '#4361ee') {
                fail(
                    `${P}brand-500 is ${fixed['brand-500']}, expected #4361ee`
                );
            }
            if (
                (global.match(new RegExp(`${P}brand-500:`, 'g')) || [])
                    .length !== 1
            ) {
                fail(`${P}brand-500 must be declared once`);
            }
            const component = compileSource(
                '@use "fixtures/shared-config/woven" as *;\n.a { color: get-color(brand, 500); b: token(brand); }'
            ).css;
            if (
                component.trim() !==
                `.a {\n  color: #4361ee;\n  b: var(${P}brand);\n}`
            ) {
                fail(`component output: ${component}`);
            }
        }
    );

    const legacy = [
        ...build.matchAll(
            new RegExp(
                String.raw`var\(\s*(--(?!${PREFIX}-)[a-zA-Z0-9_-]+)`,
                'g'
            )
        ),
    ].map((match) => match[1]);
    if (legacy.length > 0) {
        console.log(
            `\ninfo  ${new Set(legacy).size} custom properties without the ${P} prefix are used in build output (not checked): ${[...new Set(legacy)].sort().join(', ')}`
        );
    }

    if (failures.length > 0) {
        console.log(`\n${failures.length} token failure(s):`);
        failures.forEach((failure) => console.log(`  ${failure}`));
        process.exit(1);
    }
    console.log('\ntokens: all checks pass');
}

run();
