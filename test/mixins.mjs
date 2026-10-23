// Compiles every public mixin through apply() and checks expected errors.
//
// Usage: node test/mixins.mjs
//
// The mixin list is the union of the names in src/styles/mixins-map.json (class pattern to mixin) and
// the apply() registry functions in src/styles/mixins-map.scss (apply() internals are not registry
// functions). Each mixin is called once inside `@include apply(...)` with the arguments in ARGS
// (zero-argument call when absent). A call must compile with no error and no warning. Every mixin is compiled in both
// load styles: `@use "index" as *` with apply(), and namespaced `@use "index" as nu` with nu.apply(), where items
// reach apply() as text. RAW_VALUES must give the same rule through a direct call, apply(), nu.apply() and
// N.apply() from `@use "mixins-map" as N`.
// EXPECTED_ERRORS must each fail to compile with a Sass message containing the given text.
// EXPECTED_OUTPUT must each compile with no warning to CSS containing every given text.
// Exits with code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { P, STYLES_DIR, compileError, compileSource } from './helpers.mjs';

// Arguments per parameterized mixin, as SCSS source. Values use configured keys where one exists.
const ARGS = {
    'container-padding': '4',
    container: 'flex',
    fill: '6',
    cols: '3',
    rows: '2',
    'cols-custom': '"1fr 2fr"',
    'auto-fit': '200px',
    'auto-fill': '200px',
    justify: 'center',
    align: 'center',
    place: 'center',
    'col-span': '2',
    'row-span': '2',
    'col-start': '1',
    'col-end': '3',
    'row-start': '1',
    'row-end': '2',
    'grid-place-at': '1, 2',
    'grid-col-at': '1',
    'grid-row-at': '1',
    'container-up': 'md',
    'container-down': 'md',
    'container-between': 'sm, lg',
    'container-only': 'md',
    'container-query': '400px',
    'container-type': 'inline-size',
    'container-name': 'card',
    'display-mode': 'standalone',
    'media-up': 'md',
    'media-down': 'md',
    'media-between': 'sm, lg',
    'media-only': 'md',
    'aspect-ratio': '"16/9"',
    'safe-area-inset': 'padding, top',
    supports: '"display: grid"',
    'ensure-keyframes': 'test-frames',
    'backdrop-filter': 'blur(4px)',
    'backdrop-blur': 'md',
    'backdrop-brightness': '75',
    'backdrop-contrast': '75',
    'backdrop-grayscale': '50',
    'backdrop-hue-rotate': '90',
    'backdrop-invert': '50',
    'backdrop-saturate': '50',
    'backdrop-sepia': '50',
    border: '1',
    'border-top': '1',
    'border-right': '1',
    'border-bottom': '1',
    'border-left': '1',
    'border-start': '1',
    'border-end': '1',
    rounded: 'md',
    'border-style': 'dashed',
    'border-color': 'regular',
    'border-all': '1, solid, regular',
    'adaptive-contrast': '#007bff',
    bg: 'surface',
    'text-color': 'muted',
    'text-on-color': 'brand',
    gradient: 'to right, red, blue',
    cursor: 'pointer',
    top: '4',
    right: '4',
    bottom: '4',
    left: '4',
    'inset-start': '4',
    'inset-end': '4',
    'shadow-base': '0, 1px, 2px, 0, black',
    shadow: 'md',
    'shadow-inset': 'md',
    elevation: '2',
    width: '4',
    height: '4',
    'min-width': '4',
    'min-height': '4',
    'max-width': '4',
    'max-height': '4',
    'width-percent': '50',
    'height-percent': '50',
    'min-width-percent': '50',
    'min-height-percent': '50',
    'max-width-percent': '50',
    'max-height-percent': '50',
    p: '4',
    px: '4',
    py: '4',
    pt: '4',
    pr: '4',
    pb: '4',
    pl: '4',
    ps: '4',
    pe: '4',
    m: '4',
    mx: '4',
    my: '4',
    mt: '4',
    mr: '4',
    mb: '4',
    ml: '4',
    ms: '4',
    me: '4',
    inset: '4',
    'inset-x': '4',
    'inset-y': '4',
    'space-y': '4',
    'space-x': '4',
    gap: '4',
    'gap-x': '4',
    'gap-y': '4',
    'translate-x': '4',
    'translate-y': '1rem',
    'translate-z': '1rem',
    translate: '1rem, 1rem',
    'scale-x': '150',
    'scale-y': '150',
    scale: '1.5',
    rotate: '45deg',
    'skew-x': '10deg',
    'skew-y': '10deg',
    origin: 'center',
    duration: '200',
    ease: 'in-out',
    delay: '100',
    'font-size': 'md',
    font: 'bold',
    leading: 'normal',
    'truncate-lines': '3',
    tracking: 'wide',
    'z-index': 'modal',
    opacity: '50',
};

// Load styles: [label, @use line, apply() call name]
const LOAD_STYLES = [
    ['as *', '@use "../src/styles/index" as *;', 'apply'],
    ['namespaced', '@use "../src/styles/index" as nu;', 'nu.apply'],
];

// [mixin call with a raw value, text the rule must contain]: the same rule through every load style
const RAW_VALUES = [
    ['font-size(12px)', 'font-size: 12px'],
    ['font-size(1.5rem)', 'font-size: 1.5rem'],
    ['font-size(120%)', 'font-size: 120%'],
    ['font-size(clamp(1rem, 2vw, 2rem))', 'font-size: clamp(1rem, 2vw, 2rem)'],
    ['z-index(5)', 'z-index: 5'],
    ['z-index(calc(var(--z) + 1))', 'z-index: calc(var(--z) + 1)'],
    ['duration(250ms)', 'transition-duration: 250ms'],
    ['duration(0.3s)', 'transition-duration: 0.3s'],
    ['duration(calc(var(--d) * 2))', 'transition-duration: calc(var(--d) * 2)'],
    ['delay(120ms)', 'transition-delay: 120ms'],
    ['fill(6)', 'flex: 0 0 calc('],
    ['elevation(2)', 'z-index: 2'],
    ['leading(1.5)', 'line-height: 1.5'],
    ['leading(calc(1em + 2px))', 'line-height: calc(1em + 2px)'],
    ['font(450)', 'font-weight: 450'],
    ['p(1.5rem)', 'padding: 1.5rem'],
    ['p("4")', `padding: var(${P}space-4)`],
    ['m(-2px)', 'margin: -2px'],
    ['width(50%)', 'width: 50%'],
    ['max-width(calc(100% - 2rem))', 'max-width: calc(100% - 2rem)'],
    ['top(-4px)', 'top: -4px'],
    ['gap(12px)', 'gap: 12px'],
    ['translate-x(10px)', `${P}translate-x: 10px`],
    ['rounded(6px)', 'border-radius: 6px'],
    ['border(2px)', 'border-width: 2px'],
    ['opacity(50%)', 'opacity: 50%'],
    ['opacity(calc(var(--o) * 1%))', 'opacity: calc(var(--o) * 1%)'],
    ['scale(1.5)', `${P}scale-x: 1.5`],
    ['rotate(45deg)', `${P}rotate: 45deg`],
    ['bg(#ff5733)', 'background-color: #ff5733'],
    ['origin(var(--x) top)', 'transform-origin: var(--x) top;'],
    ['origin("var(--x) top")', 'transform-origin: var(--x) top;'],
    ['origin(calc(10px + 5%) top)', 'transform-origin: calc(10px + 5%) top;'],
    ['origin("calc(10px + 5%) top")', 'transform-origin: calc(10px + 5%) top;'],
    ['origin("left calc(1px + 2%)")', 'transform-origin: left calc(1px + 2%);'],
    ['origin("left  top")', 'transform-origin: left top;'],
    ['bg("#ff5733")', 'background-color: #ff5733;'],
    ['bg(#336699, 600)', 'background-color: #285a8b'],
    ['bg(rgb(10 20 30 / 50%))', 'background-color: rgba(10, 20, 30, 0.5)'],
    ['bg(hsl(200 50% 50%))', 'background-color: hsl(200, 50%, 50%)'],
    ['bg(hwb(200 10% 20%))', 'background-color: hsl(200, 77.7777777778%, 45%)'],
    ['text-color(lab(50% 20 30))', 'color: lab(50% 20 30)'],
    ['border-color(lch(50% 30 200))', 'border-color: lch(50% 30 200deg)'],
    ['bg(oklab(0.5 0.1 0.1))', 'background-color: oklab(50% 0.1 0.1)'],
    [
        'bg(oklch(60% 0.15 200 / 0.5))',
        'background-color: oklch(60% 0.15 200deg / 0.5)',
    ],
    [
        'bg(color(display-p3 1 0 0))',
        'background-color: color(display-p3 1 0 0)',
    ],
    [
        'bg(color-mix(in srgb, red, blue))',
        'background-color: color-mix(in srgb, red, blue)',
    ],
    ['text-color(light-dark(#fff, #000))', 'color: light-dark(#fff, #000)'],
    [
        `border-color(color-mix(in oklch, var(${P}brand) 40%, white))`,
        `border-color: color-mix(in oklch, var(${P}brand) 40%, white)`,
    ],
    ['p(4)', `padding: var(${P}space-4)`],
    ['rotate(45)', `${P}rotate: 45deg`],
    ['rotate(-90)', `${P}rotate: -90deg`],
    ['rotate(0)', `${P}rotate: 0deg`],
    ['skew-x(0)', `${P}skew-x: 0deg`],
    ['shadow(none)', 'box-shadow: none'],
    ['truncate(2)', '-webkit-line-clamp: 2'],
    ['cols-custom(1fr 2fr)', 'grid-template-columns: 1fr 2fr'],
    ['aspect-ratio(16, 9)', 'aspect-ratio: 16 / 9'],
    ['aspect-ratio("16/9")', 'aspect-ratio: 16 / 9'],
    ['aspect-ratio(1.5)', 'aspect-ratio: 1.5'],
    ['rounded(2xl)', `border-radius: var(${P}radius-2xl)`],
    ['rounded-t(2xl)', `border-top-left-radius: var(${P}radius-2xl)`],
    ['font-size(2xl)', `font-size: var(${P}font-size-2xl)`],
    ['delay(-100ms)', 'transition-delay: -100ms'],
    [
        'gradient(to right, brand, red 40%, surface)',
        `background-image: linear-gradient(to right, var(${P}brand), var(${P}red-500) 40%, var(${P}bg-surface))`,
    ],
    ['cursor(pointer)', 'cursor: pointer'],
    [
        'cols(var(--n))',
        'grid-template-columns: repeat(var(--n), minmax(0, 1fr))',
    ],
    [
        'auto-fit(sm)',
        'grid-template-columns: repeat(auto-fit, minmax(250px, 1fr))',
    ],
    ['font-size("1.25rem")', 'font-size: 1.25rem'],
    ['cols("3")', 'grid-template-columns: repeat(3, minmax(0, 1fr))'],
    ['col-span("2")', 'grid-column: span 2/span 2'],
    ['duration("250ms")', 'transition-duration: 250ms'],
    ['z-index("5")', 'z-index: 5'],
];

// Mixins removed in 2.0 (deprecated in 1.x) and renamed grid mixins: each must fail as an unknown mixin,
// called directly and through apply()
const REMOVED = [
    ['d-tbl', ''],
    ['d-tbl-cell', ''],
    ['d-tbl-row', ''],
    ['flex-inline', ''],
    ['grid-inline', ''],
    ['text-size', 'md'],
    ['flow-in-row', ''],
    ['flow-in-col', ''],
    ['flow-dense-items', ''],
    ['grid-position', '1, 2'],
    ['position-col', '1'],
    ['position-row', '1'],
];

// [label, SCSS body, text the Sass error message must contain]
const EXPECTED_ERRORS = [
    [
        'apply("p(4")',
        '@include apply("p(4");',
        'apply(p(4): missing closing parenthesis.',
    ],
    [
        'apply("font(a(b)")',
        '@include apply("font(a(b)");',
        'apply(font(a(b)): missing closing parenthesis.',
    ],
    ['p(7)', '@include apply(p(7));', 'p: 7 is not a configured key'],
    [
        'p(-4)',
        '@include apply(p(-4));',
        'p: negative key -4 is not allowed here',
    ],
    [
        'p(auto)',
        '@include apply(p(auto));',
        'p: auto is not a valid padding value',
    ],
    ['bg(nope)', '@include apply(bg(nope));', 'bg(nope): unknown color'],
    ['cols(foo)', '@include apply(cols(foo));', 'cols: foo is not a count'],
    ['cols(0)', '@include apply(cols(0));', 'cols: 0 is not a count'],
    ['rows(-1)', '@include apply(rows(-1));', 'rows: -1 is not a count'],
    ['cols(1.5)', '@include apply(cols(1.5));', 'cols: 1.5 is not a count'],
    ['cols(auto)', '@include apply(cols(auto));', 'cols: auto is not a count'],
    [
        'auto-fit(4)',
        '@include apply(auto-fit(4));',
        'auto-fit: 4 is not a minimum width',
    ],
    [
        'auto-fill(foo)',
        '@include apply(auto-fill(foo));',
        'auto-fill: foo is not a minimum width',
    ],
    [
        'auto-fill(4)',
        '@include apply(auto-fill(4));',
        'auto-fill: 4 is not a minimum width',
    ],
    [
        'col-span(full)',
        '@include apply(col-span(full));',
        'col-span: full is not a count',
    ],
    [
        'col-span(0)',
        '@include apply(col-span(0));',
        'col-span: 0 is not a count',
    ],
    [
        'row-span(foo)',
        '@include apply(row-span(foo));',
        'row-span: foo is not a count',
    ],
    [
        'container(size)',
        '@include apply(container(size));',
        'container: size is not a display value',
    ],
    [
        'container(foo)',
        '@include apply(container(foo));',
        'container: foo is not a display value',
    ],
    ['scale(foo)', '@include apply(scale(foo));', 'scale: foo is not a scale'],
    [
        'rotate(foo)',
        '@include apply(rotate(foo));',
        'rotate: foo is not an angle',
    ],
    [
        'skew-x(foo)',
        '@include apply(skew-x(foo));',
        'skew-x: foo is not an angle',
    ],
    [
        'translate-z(50p)',
        '@include apply(translate-z(50p));',
        'translate-z: 50p is a percentage',
    ],
    [
        'translate-z(50%)',
        '@include apply(translate-z(50%));',
        'translate-z: 50% is a percentage',
    ],
    [
        'truncate-lines(foo)',
        '@include apply(truncate-lines(foo));',
        'truncate-lines: foo is not a line count',
    ],
    [
        'truncate-lines(0)',
        '@include apply(truncate-lines(0));',
        'truncate-lines: 0 is not a line count',
    ],
    [
        'truncate-lines(-1)',
        '@include apply(truncate-lines(-1));',
        'truncate-lines: -1 is not a line count',
    ],
    [
        'truncate-lines(1.5)',
        '@include apply(truncate-lines(1.5));',
        'truncate-lines: 1.5 is not a line count',
    ],
    [
        'font-size(-1rem)',
        '@include apply(font-size(-1rem));',
        'font-size(-1rem): negative sizes are not allowed',
    ],
    [
        'duration(-100ms)',
        '@include apply(duration(-100ms));',
        'duration: negative time -100ms is not allowed',
    ],
    [
        'fill(1.5)',
        '@include apply(fill(1.5));',
        'fill(1.5): use a whole number of columns',
    ],
    [
        'cursor(foo)',
        '@include apply(cursor(foo));',
        'cursor: unknown value foo',
    ],
    [
        'gradient(to right, foo, red)',
        '@include apply(gradient(to right, foo, red));',
        'bg(foo): unknown color',
    ],
    [
        'bg(brand-default) names the renamed role',
        '@include apply(bg(brand-default));',
        'bg(brand-default): renamed in 2.0, use bg(brand)',
    ],
    [
        'border-color(danger-default) names the renamed role',
        '@include apply(border-color(danger-default));',
        'border-color(danger-default): renamed in 2.0, use border-color(danger)',
    ],
    [
        'text-color(brand-default) names the renamed role',
        '@include apply(text-color(brand-default));',
        'text-color(brand-default): renamed in 2.0, use text-color(brand)',
    ],
    [
        'bg(error-default) points at danger',
        '@include apply(bg(error-default));',
        'bg(error-default): renamed in 2.0, use bg(danger)',
    ],
    [
        'gradient(to right, brand-default, red) names the renamed role',
        '@include apply(gradient(to right, brand-default, red));',
        'bg(brand-default): renamed in 2.0, use bg(brand)',
    ],
    [
        'text-on-color(brand-default) names the renamed role',
        '@include text-on-color(brand-default);',
        'text-on-color(brand-default): renamed in 2.0, use text-on-color(brand)',
    ],
    ['p(true)', '@include apply(p(true));', 'p: unknown value true'],
    ['p(#fff)', '@include apply(p(#fff));', 'p: unknown value #fff'],
    [
        'aspect-ratio(video)',
        '@include apply(aspect-ratio(video));',
        'aspect-ratio: video is not a ratio',
    ],
    [
        'aspect-ratio(0)',
        '@include apply(aspect-ratio(0));',
        'aspect-ratio: 0 is not a ratio',
    ],
    [
        'animate-spin() unknown key',
        '@include animate-spin((durration: 2s));',
        'animate-spin(): unknown key durration. Valid keys: direction, duration, timing, iteration.',
    ],
    [
        'media-between(lg, sm)',
        '@include media-between(lg, sm) { color: red; }',
        'media-between(lg, sm): the lower breakpoint (1024px) must be smaller than the upper one (640px)',
    ],
    [
        'bg(color-mix(...), 600)',
        '@include apply(bg(color-mix(in srgb, red, blue), 600));',
        'only a role, a palette name or a value Sass reads as a color takes a shade',
    ],
    [
        'text-color(light-dark(...), 600)',
        '@include text-color(light-dark(#fff, #000), 600);',
        'only a role, a palette name or a value Sass reads as a color takes a shade',
    ],
    [
        'bg(bg-surface)',
        '@include apply(bg(bg-surface));',
        'bg(bg-surface): unknown color',
    ],
    [
        'get-color(var(--x))',
        'color: get-color(var(--x));',
        'a CSS variable has no compile time color',
    ],
    [
        'get-color(red, 450)',
        'color: get-color(red, 450);',
        'get-color(red, 450): invalid shade',
    ],
    [
        'token(brand-defualt)',
        'color: token(brand-defualt);',
        'token(brand-defualt): unknown token',
    ],
    [
        'translate-x(7)',
        '@include apply(translate-x(7));',
        'translate-x: 7 is not a spacing key',
    ],
    ['rotate(30)', '@include apply(rotate(30));', 'rotate: 30 has no unit'],
    ['skew-x(10)', '@include apply(skew-x(10));', 'skew-x: 10 has no unit'],
    [
        'container-padding(7)',
        '@include apply(container-padding(7));',
        'container-padding: 7 is not a configured key',
    ],
    [
        'p(-1rem)',
        '@include apply(p(-1rem));',
        'p: negative value -1rem is not allowed here',
    ],
    [
        'width(-10px)',
        '@include apply(width(-10px));',
        'width: negative value -10px is not allowed here',
    ],
    [
        'rounded(-2px)',
        '@include apply(rounded(-2px));',
        'rounded: negative value -2px is not allowed here',
    ],
    [
        'backdrop-brightness(1.2)',
        '@include apply(backdrop-brightness(1.2));',
        'backdrop-brightness(1.2): use a key',
    ],
    [
        'backdrop-hue-rotate(45)',
        '@include apply(backdrop-hue-rotate(45));',
        'backdrop-hue-rotate(45): use a key',
    ],
    [
        'media-up(800)',
        '@include media-up(800) { color: red; }',
        'Invalid breakpoint: 800 is not a breakpoint name',
    ],
    [
        'container-down(600)',
        '@include container-down(600) { color: red; }',
        'Invalid breakpoint: 600 is not a breakpoint name',
    ],
    [
        'fill(0)',
        '@include apply(fill(0));',
        'fill(0): use a whole number of columns from 1',
    ],
    [
        'animate-fade((type: sideways))',
        '@include animate-fade((type: sideways));',
        'animate-fade(): unknown type sideways',
    ],
    [
        'get-color("#ggg")',
        'color: get-color("#ggg");',
        'Invalid hex character: g in #ggg',
    ],
    [
        'width(3xl)',
        '@include apply(width(3xl));',
        'width: 3xl is not a sizing key',
    ],
    [
        'height(lg) (breakpoint names are widths only)',
        '@include apply(height(lg));',
        'height: unknown value lg',
    ],
    ['top(40p)', '@include apply(top(40p));', 'top: 40p is not a fraction key'],
    ['p(3xl)', '@include apply(p(3xl));', 'p: unknown value 3xl'],
    ['p("5foo")', '@include apply(p("5foo"));', 'p: unknown value 5foo'],
    ['m(10pxx)', '@include m(10pxx);', 'm: unknown value 10pxx'],
    ['gap(5foo)', '@include apply(gap(5foo));', 'gap: unknown value 5foo'],
    [
        'space-x(3xl)',
        '@include apply(space-x(3xl));',
        'space-x: unknown value 3xl',
    ],
    ['top(3xl)', '@include apply(top(3xl));', 'top: unknown value 3xl'],
    ['inset(1fr)', '@include apply(inset(1fr));', 'inset: unknown value 1fr'],
    [
        'rounded(5foo)',
        '@include apply(rounded(5foo));',
        'rounded: unknown value 5foo',
    ],
    [
        'rounded-t(5foo) names its mixin',
        '@include apply(rounded-t(5foo));',
        'rounded-t: unknown value 5foo',
    ],
    [
        'border(50%)',
        '@include apply(border(50%));',
        'border: unknown value 50%',
    ],
    [
        'border-top(3) names its mixin',
        '@include apply(border-top(3));',
        'border-top: 3 is not a configured key',
    ],
    [
        'font-size(5foo)',
        '@include apply(font-size(5foo));',
        'font-size(5foo): unknown size',
    ],
    [
        'leading(5foo)',
        '@include apply(leading(5foo));',
        'Unknown line height: 5foo',
    ],
    [
        'translate-x(3xl)',
        '@include apply(translate-x(3xl));',
        'translate-x: unknown value 3xl',
    ],
    [
        'container-padding(10pxx)',
        '@include apply(container-padding(10pxx));',
        'container-padding: unknown value 10pxx',
    ],
    [
        'width(10pxx)',
        '@include width(10pxx);',
        'width: 10pxx is not a sizing key',
    ],
    [
        'width(foo) names the mixin',
        '@include width(foo);',
        'width: unknown value foo',
    ],
    [
        'p(4px 8px) rejects a list',
        '@include p(4px 8px);',
        'p: unknown value 4px 8px',
    ],
    [
        'm(0 auto) rejects a list',
        '@include apply(m(0 auto));',
        'm: unknown value 0 auto',
    ],
    [
        'apply(): unknown state',
        '@include apply(p(4) hovr);',
        'unknown modifier hovr',
    ],
    [
        'apply(): unknown state on a bare item',
        '@include apply(flex hovr);',
        'unknown modifier hovr',
    ],
    [
        'apply(): two states',
        '@include apply(p(4) hover focus);',
        'more than one state (hover, focus)',
    ],
    [
        'container-query(foo)',
        '@include container-query(foo) { color: red; }',
        'Invalid breakpoint: foo. Use a breakpoint name',
    ],
    [
        'container-query(30)',
        '@include container-query(30) { color: red; }',
        'Invalid breakpoint: 30 is not a breakpoint name',
    ],
    [
        'animate-shake offset without a unit',
        '@include animate-shake((intensity: 8));',
        'animate-shake(): intensity 8 has no unit',
    ],
    [
        'animate-bounce offset without a unit',
        '@include animate-bounce((vertical: 2));',
        'animate-bounce(): vertical 2 has no unit',
    ],
    [
        'apply(): two breakpoints',
        '@include apply(p(4) md lg);',
        'more than one breakpoint (md, lg)',
    ],
    [
        'apply(): two breakpoints on a reserved name (transition)',
        '@include apply(transition hover md lg);',
        'more than one breakpoint (md, lg)',
    ],
    [
        'apply(): the item label names the call and its modifiers',
        '@include apply(bg(red, 500) hover focus);',
        'apply(bg(red, 500) hover focus): more than one state',
    ],
    [
        'opacity(0.5): a bare decimal is not an opacity',
        '@include apply(opacity(0.5));',
        'opacity(0.5): use a $opacities key',
    ],
    [
        'bg(red, 450) (mixin path)',
        '@include bg(red, 450);',
        'bg(red, 450): invalid shade',
    ],
    [
        'text-on-color(purple, 450) names text-on-color',
        '@include text-on-color(purple, 450);',
        'text-on-color(purple, 450): invalid shade',
    ],
    [
        'text-on-color(foo) names text-on-color',
        '@include text-on-color(foo);',
        'text-on-color(foo): unknown color',
    ],
    [
        'origin(foo)',
        '@include origin(foo);',
        'origin: foo is not a transform-origin part',
    ],
    [
        'origin() validates each part of a quoted value with calc()',
        '@include origin("bogus calc(1px + 2%)");',
        'origin: bogus is not a transform-origin part',
    ],
    [
        'width-percent(-50)',
        '@include width-percent(-50);',
        'width-percent: -50 is not a percentage size: sizes cannot be negative',
    ],
    [
        'grid-col-at(1 / 3) written unquoted is Sass division',
        '@include grid-col-at(1 / 3);',
        'is not a grid line',
    ],
    [
        'safe-area-inset() with an unknown side',
        '@include safe-area-inset(padding-top, middle);',
        'middle is not an inset side',
    ],
    [
        'supports() without a declaration',
        '@include supports(grid) { display: grid; }',
        'pass a declaration as a quoted string',
    ],
    [
        'animate-ping() scale with a unit',
        '@include animate-ping((scale: 2px));',
        'animate-ping(): scale 2px is not a number',
    ],
    [
        'animate-bounce() offset as calc()',
        '@include animate-bounce((vertical: calc(1rem + 2px)));',
        'animate-bounce(): vertical calc(1rem + 2px) is not a length',
    ],
    [
        'media-only() with a length in another unit than the breakpoints',
        '@include media-only(50em) { color: red; }',
        'media-only(50em): 50em cannot be compared with the breakpoint',
    ],
];

// [label, SCSS body, texts the compiled CSS must contain]
const EXPECTED_OUTPUT = [
    [
        'container(flex) sets display: flex',
        '@include apply(container(flex));',
        ['.t {\n  display: flex;'],
    ],
    [
        'keyframes are emitted at the root, outside the first caller at-rule, in both orders',
        '@include apply(animate-spin md); } .b { @include apply(animate-spin); } .c { @include apply(animate-ping); } @supports (display: grid) { .d { @include animate-ping; } } .e { @include dark-mode { @include animate-pulse; } } .f { @include animate-pulse;',
        [
            '}\n@keyframes anim-spin-normal {',
            '}\n@keyframes anim-ping-20 {',
            '}\n@keyframes anim-pulse-50-100 {',
        ],
    ],
    [
        'apply() group-hover gives .group:hover & like the classes; other states give &:state',
        '@include apply(scale(105) group-hover, opacity(50%) focus-visible, p(4) group-hover md);',
        [
            '.group:hover .t {',
            '.t:focus-visible {',
            '@media (min-width: 768px) {\n  .group:hover .t {',
        ],
    ],
    [
        'origin() resolves $origin-values keys like the classes',
        '@include apply(origin(top-left)); .n { @include origin(bottom-right); } .r { @include origin(50% 100%); }',
        [
            'transform-origin: top left;',
            'transform-origin: bottom right;',
            'transform-origin: 50% 100%;',
        ],
    ],
    [
        'get-color(): palette names win over CSS named colors, other named colors and hex values pass through',
        'a: get-color(red); b: get-color(coral); c: get-color(#ff5733, 200); d: get-color(#ff5733);',
        ['a: #ef4444;', 'b: coral;', 'c: #ffcfc4;', 'd: #ff5733;'],
    ],
    [
        'scale mixins keep every CSS length unit and %',
        '@include apply(p(10dvh), m(-2cqi), gap(1.5em), rounded(50%), border(4q), font-size(10PX), leading("10dvh"), top(3svh));',
        [
            'padding: 10dvh',
            'margin: -2cqi',
            'gap: 1.5em',
            'border-radius: 50%',
            'border-width: 4q',
            'font-size: 10PX',
            'line-height: 10dvh',
            'top: 3svh',
        ],
    ],
    [
        'backdrop-brightness(90) matches the "90" key',
        '@include apply(backdrop-brightness(90));',
        [`${P}backdrop-brightness: brightness(90%)`],
    ],
    [
        'media-only(2xl) accepts an unquoted 2xl',
        '@include media-only(2xl) { color: red; }',
        ['@media (min-width: 1536px)'],
    ],
    [
        'media-down and container-down subtract 0.02px',
        '@include media-down(md) { color: red; } @include container-down(md) { color: red; }',
        ['@media (max-width: 767.98px)', '@container (max-width: 767.98px)'],
    ],
    [
        'container-query interpolates its size',
        '@include container-query(400px, card) { color: red; }',
        ['@container card (min-width: 400px)'],
    ],
    [
        'container-query resolves breakpoint names',
        '@include container-query(md) { color: red; } @include container-query(2xl, card) { color: red; } @include container-query("lg") { color: red; }',
        [
            '@container (min-width: 768px)',
            '@container card (min-width: 1536px)',
            '@container (min-width: 1024px)',
        ],
    ],
    [
        'dark-mode scopes to the elements whose theme tokens are dark, per color scheme',
        '@include dark-mode { color: red; }',
        [
            '@media not all and (prefers-color-scheme: dark) {\n  @scope ([data-theme="dark"], [data-theme="inverse"]:not([data-theme="dark"] *, [data-theme="inverse"] *), [data-theme="dark"] [data-theme="inverse"] [data-theme="inverse"]) to ([data-theme="light"], [data-theme="dark"], [data-theme="inverse"]) {\n    .t:scope, .t:is(:scope *) {\n      color: red;',
            '@media (prefers-color-scheme: dark) {\n  @scope ([data-theme="dark"], :root:not([data-theme]), :root:not([data-theme]) [data-theme="inverse"] [data-theme="inverse"], [data-theme="inverse"]:not([data-theme="dark"] *, [data-theme="inverse"] *, :root:not([data-theme]) *), [data-theme="dark"] [data-theme="inverse"] [data-theme="inverse"]:not(:root:not([data-theme]) *)) to ([data-theme="light"], [data-theme="dark"], [data-theme="inverse"]) {\n    .t:scope, .t:is(:scope *) {\n      color: red;',
        ],
    ],
    [
        'dark-mode in a pseudo-element rule keeps the pseudo-element last',
        '&::before { @include dark-mode { color: red; } } &, .u::placeholder { @include dark-mode { color: red; } }',
        [
            '.t:scope::before, .t:is(:scope *)::before {',
            '.t:scope, .t:is(:scope *), .t .u:scope::placeholder, .t .u:is(:scope *)::placeholder {',
        ],
    ],
    [
        'landscape has no screen and',
        '@include landscape { color: red; }',
        ['@media (orientation: landscape)'],
    ],
    [
        'animate-shake keyframes differ per unit',
        '@include animate-shake((intensity: 5rem));',
        ['@keyframes anim-shake-5rem'],
    ],
    [
        'animate-ping decimal scale gives a valid keyframes name',
        '@include animate-ping((scale: 1.25));',
        ['@keyframes anim-ping-12_5'],
    ],
    [
        'transition sets the default duration and easing tokens',
        '@include apply(transition);',
        [
            `transition-duration: var(${P}duration-200)`,
            `transition-timing-function: var(${P}ease-in-out)`,
        ],
    ],
    [
        'apply() opacity takes CSS-wide keywords, quoted keys and var() as the direct call does',
        '@include apply(opacity(inherit), opacity(revert-layer) hover, opacity("50") focus, opacity(var(--x)) md); filter: opacity(50%); line-height: opacity(rgba(0, 0, 0, 0.5));',
        [
            'opacity: inherit',
            'opacity: revert-layer',
            `opacity: var(${P}opacity-50)`,
            'opacity: var(--x)',
            'filter: opacity(50%)',
            'line-height: 0.5',
        ],
    ],
    [
        'border-top takes a color',
        '@include apply(border-top(1, solid, danger));',
        [`border-top-color: var(${P}danger)`],
    ],
    [
        `border-all writes the style through ${P}border-style`,
        '@include apply(border-all(1, dashed, strong));',
        [`border-style: var(${P}border-style)`, `${P}border-style: dashed`],
    ],
    [
        'pill uses the full radius token',
        '@include apply(pill);',
        [`border-radius: var(${P}radius-full)`],
    ],
    [
        'space-y is logical',
        '@include apply(space-y(4));',
        [`margin-block-start: var(${P}space-4)`],
    ],
    [
        'hidden is an alias of hide',
        '@include apply(hidden);',
        ['display: none'],
    ],
    [
        'hidden takes a breakpoint like hide',
        '@include apply(hidden, show md, hidden lg);',
        [
            'display: none',
            '@media (min-width: 768px)',
            'display: revert',
            '@media (min-width: 1024px)',
        ],
    ],
    [
        'show reverts to the natural display',
        '@include apply(show);',
        ['display: revert'],
    ],
    [
        'stretch makes direct children share the main axis',
        '@include apply(flex, stretch);',
        ['display: flex', '.t > * {', 'flex: 1 1 0%'],
    ],
    [
        'transition-colors gets the default duration and easing',
        '@include apply(transition-colors);',
        [
            `${P}transition-colors: color, background-color, border-color, text-decoration-color, fill, stroke`,
            `transition-property: var(${P}transition-colors, ${P}none), var(${P}transition-opacity, ${P}none), var(${P}transition-shadow, ${P}none), var(${P}transition-transform, ${P}none)`,
            `transition-duration: var(${P}duration-200)`,
            `transition-timing-function: var(${P}ease-in-out)`,
        ],
    ],
    [
        'transition-opacity, -shadow, -transform get the defaults and duration() overrides them',
        '@include apply(transition-opacity, transition-shadow, transition-transform, duration(300));',
        [
            `${P}transition-opacity: opacity`,
            `${P}transition-shadow: box-shadow`,
            `${P}transition-transform: transform`,
            `transition-duration: var(${P}duration-200)`,
            `transition-duration: var(${P}duration-300)`,
        ],
    ],
    [
        'opacity keys read $opacities and emit the token',
        '@include apply(opacity(50), opacity(33) hover); a: token(opacity-50); b: token(font-family);',
        [
            `opacity: var(${P}opacity-50)`,
            `opacity: var(${P}opacity-33)`,
            `a: var(${P}opacity-50)`,
            `b: var(${P}font-family)`,
        ],
    ],
    [
        'grid flow and placement mixins match their class names',
        '@include apply(flow-row, flow-col, flow-dense, grid-place-at(2, span 2), grid-col-at(1), grid-row-at(3));',
        [
            'grid-auto-flow: row',
            'grid-auto-flow: column',
            'grid-auto-flow: dense',
            'grid-column: 2',
            'grid-row: span 2',
            'grid-column: 1',
            'grid-row: 3',
        ],
    ],
    [
        'sizing mixins accept percentage keys, thirds and breakpoint names',
        '@include apply(width(50p), height(33p), min-width(lg), max-width(66p), width-percent(33));',
        [
            'width: 50%',
            'height: 33.333%',
            'min-width: 1024px',
            'max-width: 66.667%',
            'width: 33.333%',
        ],
    ],
    [
        'offset mixins accept fraction keys',
        '@include apply(right(25p), left(-33p), inset-x(50p));',
        ['right: 25%', 'left: -33.333%', 'left: 50%', 'right: 50%'],
    ],
    [
        'auto-fit and auto-fill accept $grid-item-sizes keys',
        '@include apply(auto-fit(sm), auto-fill(xl));',
        [
            'repeat(auto-fit, minmax(250px, 1fr))',
            'repeat(auto-fill, minmax(400px, 1fr))',
        ],
    ],
    [
        'auto-fill() and auto-fit() take a whole minmax() track as written',
        '@include apply(auto-fill(minmax(100px, 20%))); } .b { @include auto-fit("minmax(8rem, 1fr)");',
        [
            'grid-template-columns: repeat(auto-fill, minmax(100px, 20%));',
            'grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));',
        ],
    ],
    [
        'to-number() gives null for text without a digit before its first other character',
        '@if to-number(".") != null or to-number(".px") != null or to-number("-") != null { @error "to-number: expected null"; } a: to-number("-.5"); b: to-number("12px");',
        ['a: -0.5;', 'b: 12px;'],
    ],
    [
        'cols-custom() keeps underscores inside brackets and parentheses',
        '@include cols-custom("[main_start]_1fr_var(--side_width)");',
        ['grid-template-columns: [main_start] 1fr var(--side_width);'],
    ],
    [
        'logical utilities give inline-axis properties',
        '@include apply(ms(4), me(2), ps(4), pe(2), text-start, border-start(1)); } .b { @include apply(text-end, border-end(2), inset-start(4), inset-end(0));',
        [
            `margin-inline-start: var(${P}space-4);`,
            `margin-inline-end: var(${P}space-2);`,
            `padding-inline-start: var(${P}space-4);`,
            `padding-inline-end: var(${P}space-2);`,
            'text-align: start;',
            `border-inline-start-width: var(${P}border-width-1);`,
            'text-align: end;',
            `border-inline-end-width: var(${P}border-width-2);`,
            `inset-inline-start: var(${P}space-4);`,
            `inset-inline-end: var(${P}space-0);`,
        ],
    ],
    [
        'cache keys keep same-compile calls apart (font-size key and text, color shades)',
        '@include font-size(lg); } .b { @include font-size("lg"); } .c { @include font-size(sm); } .d { @include bg(red, 500); } .e { @include bg(red, "600"); } .f { @include bg(blue, 500); } .g { @include bg(#336699, 600); } .h { @include bg(#336699, 700); } .i { @include bg("#336699", 600);',
        [
            `.t {\n  font-size: var(${P}font-size-lg);`,
            `.b {\n  font-size: var(${P}font-size-lg);`,
            `.c {\n  font-size: var(${P}font-size-sm);`,
            `.d {\n  background-color: var(${P}red-500);`,
            `.e {\n  background-color: var(${P}red-600);`,
            `.f {\n  background-color: var(${P}blue-500);`,
            '.g {\n  background-color: #285a8b;',
            '.h {\n  background-color: #1d4c78;',
            '.i {\n  background-color: #285a8b;',
        ],
    ],
    [
        'quoted arguments read like unquoted ones (gradient, shadow-base, backdrop-filter, animation maps)',
        '@include gradient("to right", "brand", "red 40%"); } .b { @include shadow-base("0", "1px", "2px", "0", "red"); } .c { @include backdrop-filter("blur(4px)"); } .d { @include animate-bounce((vertical: "4px", duration: "2s"));',
        [
            `background-image: linear-gradient(to right, var(${P}brand), var(${P}red-500) 40%);`,
            'box-shadow: 0 1px 2px 0 red;',
            'backdrop-filter: blur(4px);',
            'animation: anim-bounce-0-4px 2s ease-in-out infinite;',
        ],
    ],
];

function mixinNames() {
    const json = JSON.parse(
        fs.readFileSync(path.join(STYLES_DIR, 'mixins-map.json'), 'utf8')
    );
    const fromJson = new Set();
    for (const [pattern, template] of Object.entries(json)) {
        const key = pattern.slice(1, -1);
        if (template === '() => mixin.name') {
            fromJson.add(key);
        } else if (template.includes('(full)')) {
            fromJson.add(key.replace(/-full$/, ''));
        } else {
            fromJson.add(key.replace(/-\(.*$/, ''));
        }
    }
    const scss = fs.readFileSync(
        path.join(STYLES_DIR, 'mixins-map.scss'),
        'utf8'
    );
    // Registry functions return (_n: name, _p: args); apply() internals such as pam and pai do not
    const fromRegistry = new Set(
        [
            ...scss.matchAll(
                /@function ([a-z0-9_-]+)\(\$a\.\.\.\) \{ @return \(_n:/g
            ),
        ].map((match) => match[1])
    );
    const all = [...new Set([...fromJson, ...fromRegistry])].sort();
    return {
        all,
        jsonOnly: [...fromJson]
            .filter((name) => !fromRegistry.has(name))
            .sort(),
        registryOnly: [...fromRegistry]
            .filter((name) => !fromJson.has(name))
            .sort(),
    };
}

function call(name) {
    return ARGS[name] === undefined ? name : `${name}(${ARGS[name]})`;
}

function compileOne(name, [, use, applyName]) {
    const source = `${use}\n.t {\n    @include ${applyName}(${call(name)});\n}\n`;
    try {
        const { css, warnings } = compileSource(source);
        return {
            css,
            warnings: warnings.map(
                (warning) =>
                    `${warning.message.split('\n').filter(Boolean).slice(0, 2).join(' ').replace(/\s+/g, ' ')}${warning.where ? ` (${warning.where})` : ''}`
            ),
        };
    } catch (error) {
        return { error: (error.sassMessage ?? error.message).split('\n')[0] };
    }
}

// Compiles all mixins in one stylesheet, one selector each. Returns { css } on a clean compile, else
// { problem } describing the first error or warning, so the caller compiles each mixin to attribute it.
function compileAll(names, [, use, applyName]) {
    const rules = names
        .map(
            (name, index) =>
                `.t${index} {\n    @include ${applyName}(${call(name)});\n}`
        )
        .join('\n');
    try {
        const { css, warnings } = compileSource(`${use}\n${rules}\n`);
        if (warnings.length) {
            return {
                problem: `warning: ${warnings[0].message.split('\n')[0]}`,
            };
        }
        return { css };
    } catch (error) {
        return {
            problem: `error: ${(error.sassMessage ?? error.message).split('\n')[0]}`,
        };
    }
}

// An empty or truncated mixins-map.json would make every per-mixin check pass vacuously
const MIN_MIXINS = 335;

function run() {
    const { all, jsonOnly, registryOnly } = mixinNames();
    const removedNames = REMOVED.map(([name]) => name);
    const failures = [];
    if (all.length < MIN_MIXINS) {
        failures.push(
            `only ${all.length} mixins found in the mixins map, expected at least ${MIN_MIXINS}`
        );
    }
    const stillThere = all.filter((name) => removedNames.includes(name));
    if (stillThere.length) {
        failures.push(
            `removed mixins are still in the mixins map: ${stillThere.join(', ')}`
        );
    }

    console.log(
        `Mixins: ${all.length} (${jsonOnly.length} only in mixins-map.json, ${registryOnly.length} only in the mixins-map.scss registry)`
    );
    if (jsonOnly.length) {
        console.log(
            `  only in mixins-map.json (reached through apply() string parsing): ${jsonOnly.join(', ')}`
        );
    }
    if (registryOnly.length) {
        console.log(`  only in mixins-map.scss: ${registryOnly.join(', ')}`);
    }
    console.log('');

    for (const style of LOAD_STYLES) {
        const [label, , applyName] = style;
        const combined = compileAll(all, style);
        if (combined.css) {
            const empty = all.filter(
                (name, index) =>
                    !new RegExp(`\\.t${index}\\b`).test(combined.css)
            );
            console.log(
                `pass  ${all.length} mixins compile through ${applyName}() (${label}) with no error or warning`
            );
            if (empty.length) {
                console.log(
                    `info  ${empty.length} emit nothing when called without a content block: ${empty.join(', ')}`
                );
            }
            continue;
        }
        const before = failures.length;
        for (const name of all) {
            const result = compileOne(name, style);
            if (result.error) {
                failures.push(
                    `${applyName}(${call(name)}): error: ${result.error}`
                );
            }
            (result.warnings || []).forEach((warning) =>
                failures.push(
                    `${applyName}(${call(name)}): warning: ${warning}`
                )
            );
        }
        if (failures.length === before) {
            failures.push(
                `combined compile of ${all.length} mixins (${label}) failed but no single mixin did: ${combined.problem}`
            );
        }
        console.log(
            `FAIL  ${all.length} mixins compile through ${applyName}() (${label}) with no error or warning`
        );
    }

    const rawBefore = failures.length;
    for (const [callText, expected] of RAW_VALUES) {
        const rules = [
            [
                'direct',
                '@use "../src/styles/index" as *;',
                `@include ${callText};`,
            ],
            [
                'apply',
                '@use "../src/styles/index" as *;',
                `@include apply(${callText});`,
            ],
            [
                'nu.apply',
                '@use "../src/styles/index" as nu;',
                `@include nu.apply(${callText});`,
            ],
            [
                'N.apply',
                '@use "mixins-map" as N;',
                `@include N.apply(${callText});`,
            ],
        ].map(([label, use, body]) => {
            try {
                const { css, warnings } = compileSource(
                    `${use}\n.t {\n    ${body}\n}\n`
                );
                const rule = css.slice(css.lastIndexOf('\n.t {') + 1);
                return { label, rule, warning: warnings[0] };
            } catch (error) {
                return {
                    label,
                    error: (error.sassMessage ?? error.message).split('\n')[0],
                };
            }
        });
        const problems = rules
            .filter((rule) => rule.error || rule.warning)
            .map(
                (rule) =>
                    `${rule.label}: ${rule.error ? `error: ${rule.error}` : `warning: ${rule.warning.message.split('\n')[0]}`}`
            );
        if (problems.length) {
            failures.push(`${callText}: ${problems.join('; ')}`);
        } else if (!rules[0].rule.includes(expected)) {
            failures.push(`${callText}: direct output lacks ${expected}`);
        } else {
            const differing = rules.filter(
                (rule) => rule.rule !== rules[0].rule
            );
            if (differing.length) {
                failures.push(
                    `${callText}: ${differing.map((rule) => rule.label).join(', ')} differ from the direct call`
                );
            }
        }
    }
    console.log(
        `${failures.length === rawBefore ? 'pass' : 'FAIL'}  ${RAW_VALUES.length} raw values give the same rule directly, through apply(), nu.apply() and N.apply()`
    );

    // A state and a breakpoint may follow the utility in either order, on all three apply() paths
    const ORDER_EXPECTED = `@media (min-width: 1024px) {\n  .t:hover {\n    box-shadow: var(${P}shadow-md);\n  }\n}`;
    const orderBefore = failures.length;
    for (const [label, use, prefix] of [
        ['as *', '@use "../src/styles/index" as *;', ''],
        ['N', '@use "mixins-map" as N;', 'N.'],
        ['nu', '@use "../src/styles/index" as nu;', 'nu.'],
    ]) {
        for (const order of ['hover lg', 'lg hover']) {
            try {
                const { css, warnings } = compileSource(
                    `${use}\n.t {\n    @include ${prefix}apply(shadow(md) ${order});\n}\n`
                );
                if (warnings.length || !css.trim().endsWith(ORDER_EXPECTED)) {
                    failures.push(
                        `shadow(md) ${order} (${label}): unexpected output: ${css.slice(0, 120)}`
                    );
                }
            } catch (error) {
                failures.push(
                    `shadow(md) ${order} (${label}): error: ${(error.sassMessage ?? error.message).split('\n')[0]}`
                );
            }
        }
    }
    console.log(
        `${failures.length === orderBefore ? 'pass' : 'FAIL'}  state and breakpoint in either order give the same rule (as *, N.apply, nu.apply)`
    );

    // Transition property groups combine: each sets its own variable and writes the same combined list, so the last
    // transition-property reads every group set on the element, on all three apply() paths
    const GROUP_LIST = ['colors', 'opacity', 'shadow', 'transform']
        .map((name) => `var(${P}transition-${name}, ${P}none)`)
        .join(', ');
    const combineBefore = failures.length;
    for (const [label, use, prefix] of [
        ['as *', '@use "../src/styles/index" as *;', ''],
        ['N', '@use "mixins-map" as N;', 'N.'],
        ['nu', '@use "../src/styles/index" as nu;', 'nu.'],
    ]) {
        try {
            const { css, warnings } = compileSource(
                `${use}\n.t {\n    @include ${prefix}apply(transition-colors, transition-transform);\n}\n`
            );
            const rule = css.slice(css.lastIndexOf('\n.t {') + 1);
            const properties = [
                ...rule.matchAll(/transition-property: ([^;]+);/g),
            ].map((match) => match[1]);
            const missing = [
                `${P}transition-colors: color, background-color, border-color, text-decoration-color, fill, stroke;`,
                `${P}transition-transform: transform;`,
            ].filter((text) => !rule.includes(text));
            if (warnings.length) {
                failures.push(
                    `apply(transition-colors, transition-transform) (${label}): warning: ${warnings[0].message.split('\n')[0]}`
                );
            } else if (missing.length || properties.at(-1) !== GROUP_LIST) {
                failures.push(
                    `apply(transition-colors, transition-transform) (${label}): the groups do not combine: ${rule.slice(0, 240)}`
                );
            }
        } catch (error) {
            failures.push(
                `apply(transition-colors, transition-transform) (${label}): error: ${(error.sassMessage ?? error.message).split('\n')[0]}`
            );
        }
    }
    console.log(
        `${failures.length === combineBefore ? 'pass' : 'FAIL'}  transition-colors and transition-transform combine in one apply() (as *, N.apply, nu.apply)`
    );

    // Base items, then breakpoints smallest first; within each, states in LVHA order, whatever the written order
    const SORT_CASES = [
        [
            `.t {\n  display: none;\n}\n.t:hover {\n  opacity: var(${P}opacity-50);\n}\n` +
                `@media (min-width: 640px) {\n  .t {\n    padding: var(${P}space-2);\n  }\n}\n` +
                '@media (min-width: 768px) {\n  .t {\n    display: flex;\n  }\n}\n' +
                `@media (min-width: 1024px) {\n  .t {\n    padding: var(${P}space-6);\n  }\n}`,
            [
                'hide, opacity(50) hover, p(2) sm, flex md, p(6) lg',
                'p(6) lg, flex md, hide, p(2) sm, opacity(50) hover',
            ],
        ],
        [
            `.t:hover {\n  opacity: var(${P}opacity-90);\n}\n.t:focus {\n  opacity: var(${P}opacity-80);\n}\n` +
                `.t:active {\n  opacity: var(${P}opacity-70);\n}\n.t:disabled {\n  opacity: var(${P}opacity-50);\n}\n` +
                `@media (min-width: 768px) {\n  .t:hover {\n    opacity: var(${P}opacity-60);\n  }\n}\n` +
                `@media (min-width: 768px) {\n  .t:focus {\n    opacity: var(${P}opacity-40);\n  }\n}`,
            [
                'opacity(90) hover, opacity(80) focus, opacity(70) active, opacity(50) disabled, opacity(60) hover md, opacity(40) focus md',
                'opacity(40) focus md, opacity(50) disabled, opacity(60) hover md, opacity(70) active, opacity(80) focus, opacity(90) hover',
            ],
        ],
    ];
    const sortBefore = failures.length;
    for (const [label, use, prefix] of [
        ['as *', '@use "../src/styles/mixins" as *;', ''],
        ['N', '@use "mixins-map" as N;', 'N.'],
        ['nu', '@use "../src/styles/mixins" as nu;', 'nu.'],
    ]) {
        for (const [expected, inputs] of SORT_CASES) {
            for (const items of inputs) {
                try {
                    const { css, warnings } = compileSource(
                        `${use}\n.t {\n    @include ${prefix}apply(${items});\n}\n`
                    );
                    if (warnings.length || css.trim() !== expected) {
                        failures.push(
                            `apply(${items}) (${label}): unexpected output: ${css.slice(0, 160)}`
                        );
                    }
                } catch (error) {
                    failures.push(
                        `apply(${items}) (${label}): error: ${(error.sassMessage ?? error.message).split('\n')[0]}`
                    );
                }
            }
        }
    }
    console.log(
        `${failures.length === sortBefore ? 'pass' : 'FAIL'}  base items, then breakpoints smallest first, states in LVHA order, in any written order (as *, N.apply, nu.apply)`
    );

    const removedBefore = failures.length;
    for (const [name, args] of REMOVED) {
        const callText = args ? `${name}(${args})` : name;
        for (const body of [
            `@include ${callText};`,
            `@include apply(${callText});`,
        ]) {
            const message = compileError(
                `@use "../src/styles/index" as *;\n.t {\n    ${body}\n}\n`
            );
            if (message === null) {
                failures.push(`${body}: removed mixin compiled`);
            } else if (!/Undefined mixin|Mixin not found/.test(message)) {
                failures.push(
                    `${body}: expected an unknown mixin error, got: ${message.split('\n')[0]}`
                );
            }
        }
    }
    console.log(
        `${failures.length === removedBefore ? 'pass' : 'FAIL'}  ${REMOVED.length} removed or renamed mixins fail as unknown, directly and through apply()`
    );

    let errorFailures = 0;
    // Each case runs directly (as *) and namespaced (as nu), where apply() items arrive as text; both must agree
    const errorRuns = EXPECTED_ERRORS.flatMap(([label, body, expected]) => [
        [
            label,
            `@use "../src/styles/index" as *;\n.t {\n    ${body}\n}\n`,
            expected,
        ],
        [
            `${label} (namespaced)`,
            `@use "../src/styles/index" as nu;\n.t {\n    ${body.replace(/@include ([\w-]+)\(/g, '@include nu.$1(').replace(/(?<![\w.-])(get-color|token)\(/g, 'nu.$1(')}\n}\n`,
            expected,
        ],
    ]);
    for (const [label, source, expected] of errorRuns) {
        const message = compileError(source);
        if (message === null) {
            failures.push(`${label}: expected an error, it compiled`);
            errorFailures++;
        } else if (!message.includes(expected)) {
            failures.push(
                `${label}: expected an error containing "${expected}", got: ${message.split('\n')[0]}`
            );
            errorFailures++;
        } else {
            console.log(`pass  ${label} raises: ${message.split('\n')[0]}`);
        }
    }
    if (errorFailures) {
        console.log(
            `FAIL  ${errorFailures} expected error case(s) compiled or gave another message`
        );
    }

    // Namespaced apply(): opacity(...) inside nu.apply() is Sass's built-in color function, so keywords and quoted
    // values go through nu.opacity(), which hands the item to apply()
    {
        const label =
            'namespaced opacity: nu.apply(nu.opacity(...)) takes keywords, quoted keys and states';
        try {
            const { css, warnings } = compileSource(
                '@use "../src/styles/index" as nu;\n.t { @include nu.apply(nu.opacity(inherit)); }\n.u { @include nu.apply(nu.opacity("50")); }\n.v { @include nu.apply(opacity(50), nu.opacity(25) hover); }\n'
            );
            const missing = [
                '.t {\n  opacity: inherit;',
                `.u {\n  opacity: var(${P}opacity-50);`,
                `.v {\n  opacity: var(${P}opacity-50);`,
                `.v:hover {\n  opacity: var(${P}opacity-25);`,
            ].filter((text) => !css.includes(text));
            if (warnings.length) {
                failures.push(
                    `${label}: warning: ${warnings[0].message.split('\n')[0]}`
                );
            } else if (missing.length) {
                failures.push(`${label}: output lacks ${missing.join(', ')}`);
            } else {
                console.log(`pass  ${label}`);
            }
        } catch (error) {
            failures.push(
                `${label}: error: ${(error.sassMessage ?? error.message).split('\n')[0]}`
            );
        }
    }

    for (const [label, body, expectedTexts] of EXPECTED_OUTPUT) {
        let result;
        try {
            result = compileSource(
                `@use "../src/styles/index" as *;\n.t {\n    ${body}\n}\n`
            );
        } catch (error) {
            failures.push(
                `${label}: error: ${(error.sassMessage ?? error.message).split('\n')[0]}`
            );
            continue;
        }
        const missing = expectedTexts.filter(
            (text) => !result.css.includes(text)
        );
        if (result.warnings.length) {
            failures.push(
                `${label}: warning: ${result.warnings[0].message.split('\n')[0]}`
            );
        } else if (missing.length) {
            failures.push(`${label}: output lacks ${missing.join(', ')}`);
        } else {
            console.log(`pass  ${label}`);
        }
    }

    // A component compiled through the mixins entry outputs only its own rules, in all three load styles
    const COMPONENT_EXPECTED = `.card {\n  color: var(${P}text-muted);\n  padding: var(${P}space-4);\n  background-color: var(${P}bg-surface);\n}\n.card:hover {\n  box-shadow: var(${P}shadow-md);\n}\n@media (min-width: 768px) {\n  .card {\n    padding: var(${P}space-6);\n  }\n}`;
    for (const [label, use, prefix] of [
        ['as *', '@use "../src/styles/mixins" as *;', ''],
        ['namespaced', '@use "../src/styles/mixins" as nu;', 'nu.'],
        [
            'configured as *',
            '@use "../src/styles/mixins" as * with ($brand: #4361ee, $generate-utility-classes: true);',
            '',
        ],
    ]) {
        const name = `mixins entry (${label}): a component outputs only its own rules`;
        try {
            const { css, warnings } = compileSource(
                `${use}\n.card {\n    color: ${prefix}token(text-muted);\n    @include ${prefix}apply(p(4), bg(surface), shadow(md) hover, p(6) md);\n}\n`
            );
            const leaked = [
                ':root',
                '@layer',
                '@property',
                'data-theme',
                'box-sizing',
            ].filter((text) => css.includes(text));
            if (warnings.length) {
                failures.push(
                    `${name}: warning: ${warnings[0].message.split('\n')[0]}`
                );
            } else if (leaked.length || css.trim() !== COMPONENT_EXPECTED) {
                failures.push(
                    `${name}: unexpected output (${leaked.join(', ') || 'rules differ'}): ${css.slice(0, 120)}`
                );
            } else {
                console.log(`pass  ${name}`);
            }
        } catch (error) {
            failures.push(
                `${name}: error: ${(error.sassMessage ?? error.message).split('\n')[0]}`
            );
        }
    }

    if (failures.length > 0) {
        console.log(`\n${failures.length} mixin failure(s):`);
        failures.forEach((failure) => console.log(`  ${failure}`));
        process.exit(1);
    }
    console.log('\nmixins: all checks pass');
}

run();
