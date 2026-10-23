// Generates docs/TOKENS.md: every --wu-* custom property emitted by the default build, grouped by family.
//
// Usage: node scripts/token-reference.mjs           (or: npm run docs:tokens) writes docs/TOKENS.md
//        node scripts/token-reference.mjs --check   exits with code 1 when docs/TOKENS.md is stale
//
// Compiles src/styles/build.scss with the default configuration, reads the fixed :root block, the light block
// (:root, [data-theme=light]) and the dark block ([data-theme=dark], [data-theme=inverse]), and writes one table per family
// with the light value, the dark value (where the token is redefined in dark) and the tier.
// A value that is a single var(--wu-*) reference is shown as the referenced token plus the color it
// resolves to. Re-run after any change to the theme, color or scale configuration.
import fs from 'node:fs';
import path from 'node:path';
import {
    BASIC,
    BUILD_FILE,
    CORE_DIR,
    P,
    ROLES,
    ROLE_STATES,
    roleToken,
    SCALE_FAMILIES,
    inFamily,
    STOPS,
    compileFile,
    isPalette,
    isScale,
    paletteHues,
    paletteNames,
    resolveToken,
    themeBlocks,
} from '../test/helpers.mjs';

const OUT_FILE = path.join(CORE_DIR, 'docs', 'TOKENS.md');

const isRef = (value) =>
    new RegExp(String.raw`^var\(\s*${P}[a-zA-Z0-9_-]+\s*\)$`).test(value);
const refName = (value) =>
    value.match(new RegExp(String.raw`^var\(\s*${P}([a-zA-Z0-9_-]+)\s*\)$`))[1];

// Escapes a value for a Markdown table cell
const cell = (text) => String(text).replace(/\|/g, '\\|');

function display(value, layers) {
    if (value === undefined) {
        return '';
    }
    if (isRef(value)) {
        const resolved = resolveToken(refName(value), layers);
        return `\`${P}${refName(value)}\` (\`${cell(resolved)}\`)`;
    }
    return `\`${cell(value)}\``;
}

function table(names, light, dark, tierOf) {
    const lightLayers = [light];
    const darkLayers = [dark, light];
    const rows = names.map((name) => {
        const darkValue = Object.prototype.hasOwnProperty.call(dark, name)
            ? dark[name]
            : undefined;
        return `| \`${P}${name}\` | ${display(light[name], lightLayers)} | ${display(darkValue, darkLayers)} | ${tierOf(name, darkValue)} |`;
    });
    return [
        '| Token | Light | Dark | Tier |',
        '| --- | --- | --- | --- |',
        ...rows,
    ].join('\n');
}

// Tier of a token that may flip: "{label} (flips)" when the dark block redefines it
const flipTier = (label) => (name, darkValue) =>
    darkValue === undefined
        ? `${label} (not redefined in dark)`
        : `${label} (flips)`;
const themeTier = flipTier('theme');
const roleTier = flipTier('role');

const fixedTier = (label) => () => `${label} (fixed)`;

// Returns the Markdown of docs/TOKENS.md and the token counts
function generate() {
    const { css } = compileFile(BUILD_FILE);
    const blocks = themeBlocks(css);
    // Component variables (--wu-tooltip--Background) are re-declared in theme blocks but are not tokens
    const tokensOnly = (block) =>
        Object.fromEntries(
            Object.entries(block).filter(([name]) => !name.includes('--'))
        );
    const light = tokensOnly(blocks.light);
    const root = tokensOnly(blocks.root);
    const dark = tokensOnly(blocks.dark);
    const names = Object.keys(light);
    const palettes = paletteNames(light);
    const hues = paletteHues(light);
    const roles = ROLES.filter((role) => palettes.includes(role));
    const statuses = roles.filter((role) => role !== 'brand');
    const used = new Set();
    const pick = (list) => {
        const found = list.filter((name) => name in light && !used.has(name));
        found.forEach((name) => used.add(name));
        return found;
    };
    const inLight = (name) => name in light;

    const roleSet = (role) => [
        ...ROLE_STATES.map((state) => roleToken(role, state)),
        `text-${role}`,
        `text-on-${role}`,
    ];

    const sections = [];
    const add = (title, intro, list, tierOf) => {
        if (list.length) {
            sections.push(
                `## ${title}\n\n${intro}\n\n${table(list, light, dark, tierOf)}`
            );
        }
    };

    add(
        'Surfaces',
        'Backgrounds of the surface stack and shared interaction states. Classes: `.bg-{word}` (for example `.bg-surface`). Mixin: `bg({word})`.',
        pick(names.filter((name) => name.startsWith('bg-'))),
        themeTier
    );
    add(
        'Text',
        'Text colors for a normal page. Classes: `.text-{word}` (for example `.text-muted`). Mixin: `text-color({word})`.',
        pick(
            [
                'text-regular',
                'text-muted',
                'text-subtle',
                'text-inverted',
                'text-link',
                'text-link-hover',
            ].filter(inLight)
        ),
        themeTier
    );
    add(
        'Borders',
        'Border colors. `border-control` is the darker edge for form controls (WCAG 1.4.11). Classes: `.border-{word}`. Mixin: `border-color({word})`.',
        pick(
            [
                'border-regular',
                'border-strong',
                'border-control',
                'border-control-hover',
            ].filter(inLight)
        ),
        themeTier
    );
    add(
        'Focus',
        'Focus ring, applied through `outline-color`, `outline-width` and `outline-offset`. No utility class.',
        pick(
            [
                'border-focus',
                'border-focus-width',
                'border-focus-offset',
            ].filter(inLight)
        ),
        themeTier
    );
    if (roles.includes('brand')) {
        add(
            'Brand',
            'The bare role name (`brand`) is the solid fill, `-hover` and `-active` its states, `-subtle` a tinted background, `-border` a soft edge. `text-brand` is brand-colored text on a page; `text-on-brand` is text placed on the `brand` fill.',
            pick(roleSet('brand')),
            roleTier
        );
    }
    add(
        'Statuses',
        'Same set as brand for each status role: ' +
            statuses.map((status) => `\`${status}\``).join(', ') +
            '. Light `text-warning` stays at stop 800: it measures 5.53:1 on white but 4.42:1 on gray 100 (`bg-alternate`, `bg-hover`), an accepted exception.',
        pick(statuses.flatMap(roleSet)),
        roleTier
    );
    add(
        'Error aliases',
        `\`error\` is a second name for \`danger\`. Every \`${P}error-*\` token references the matching \`${P}danger-*\` token and cannot be set in a theme map.`,
        pick([
            ...ROLE_STATES.map((state) => roleToken('error', state)),
            'text-error',
            'text-on-error',
        ]),
        roleTier
    );
    add(
        'Hue roles',
        'Decorative roles for each palette hue (no meaning attached). They flip per theme so hue-based components adapt in dark mode. There is no `text-on-{hue}`.',
        pick(
            hues.flatMap((hue) => [
                `${hue}-subtle`,
                `${hue}-border`,
                `text-${hue}`,
            ])
        ),
        roleTier
    );

    // Theme tokens not covered above (custom tokens added through $light-theme and $dark-theme)
    add(
        'Other theme tokens',
        'Theme tokens outside the built-in families.',
        pick(
            names.filter(
                (name) =>
                    !isPalette(name, palettes) &&
                    !isScale(name) &&
                    !BASIC.includes(name)
            )
        ),
        themeTier
    );

    add(
        'Palette',
        'Generated shade scales (stops ' +
            STOPS.join(', ') +
            ') for every role and palette hue. Palette shades never change between themes; dark mode re-points the role tokens above at other stops. Classes: `.bg-{name}-{stop}`, `.text-{name}-{stop}`, `.border-{name}-{stop}`. Mixin: `bg({name}, {stop})`.',
        pick(
            palettes.flatMap((palette) =>
                STOPS.map((stop) => `${palette}-${stop}`)
            )
        ),
        fixedTier('palette')
    );
    add(
        'Basic colors',
        'Classes: `.bg-black`, `.text-white`, `.border-transparent` and so on.',
        pick(BASIC),
        fixedTier('basic')
    );

    const scaleSections = [];
    for (const [prefix, title] of SCALE_FAMILIES) {
        const list = pick(names.filter((name) => inFamily(name, prefix)));
        if (list.length) {
            scaleSections.push(
                `### ${title}\n\n${table(list, light, dark, fixedTier('scale'))}`
            );
        }
    }
    if (scaleSections.length) {
        sections.push(
            `## Non-color scales\n\nEmitted from the configuration maps. Mixins and utility classes output these tokens for configured keys (\`p(4)\` gives \`padding: var(${P}space-4)\`); custom values stay raw. Decimal keys use \`_\` in token names (\`${P}space-0_5\`).\n\n${scaleSections.join('\n\n')}`
        );
    }

    const leftover = names.filter((name) => !used.has(name));
    if (leftover.length) {
        throw new Error(
            `Tokens not placed in any family: ${leftover.join(', ')}`
        );
    }

    const header = [
        '# @wovenui/core design tokens',
        '',
        '<!-- Generated file. Do not edit by hand. -->',
        '',
        'This file is generated by `scripts/token-reference.mjs` from `src/styles/build.scss` with the default configuration. Regenerate it with `npm run docs:tokens` after changing any color, theme or scale configuration.',
        '',
        `Total: ${names.length} custom properties: ${Object.keys(root).length} fixed tokens in the \`:root\` block, ${names.length - Object.keys(root).length} theme tokens in the light block (\`:root, [data-theme="light"]\`), ${Object.keys(dark).length} redefined in the dark block (\`[data-theme="dark"]\`, also applied through \`prefers-color-scheme: dark\` to \`:root:not([data-theme])\`). \`[data-theme="inverse"]\` takes the dark values on a light page and the light values under a dark page.`,
        '',
        'Tiers:',
        '',
        '- **palette, basic, scale (fixed)**: the same value in every theme. Defined once in the `:root` block, so a runtime `:root` override applies inside light sections too.',
        '- **theme, role (flips)**: redefined in the dark block. Role tokens point at a different stop of their own scale per theme.',
        '',
        'Values are shown as emitted. A value that references another token is shown as that token, followed by the value it resolves to in that theme. A consumer configuration (`$brand`, `$light-theme`, `$dark-theme` and the scale maps) changes these values; this file documents the defaults.',
        '',
        'The default values may still be tuned in a 2.x release (contrast and palette steps are under review). Read tokens through `token()` so a rename fails at compile time.',
        '',
        `Read a token in SCSS with \`token(name)\`, which returns \`var(${P}name)\` and raises an error for an unknown name.`,
    ].join('\n');

    return {
        markdown: `${header}\n\n${sections.join('\n\n')}\n`,
        total: names.length,
        darkTotal: Object.keys(dark).length,
    };
}

function run() {
    const { markdown, total, darkTotal } = generate();
    const relative = path.relative(CORE_DIR, OUT_FILE);
    if (process.argv.includes('--check')) {
        const current = fs.existsSync(OUT_FILE)
            ? fs.readFileSync(OUT_FILE, 'utf8')
            : '';
        if (current !== markdown) {
            console.log(
                `FAIL  ${relative} is stale. Regenerate it with: npm run docs:tokens`
            );
            process.exit(1);
        }
        console.log(`pass  ${relative} is up to date (${total} tokens)`);
        return;
    }
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, markdown);
    console.log(
        `Wrote ${relative}: ${total} tokens (${darkTotal} redefined in dark).`
    );
}

run();
