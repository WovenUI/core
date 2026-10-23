# Migrating from @nuvoui/core 1.x to 2.0

Version 2.0 turns NuvoUI core into the foundation layer of a design system. Colors, spacing and every other scale are now emitted as `--nu-*` CSS custom properties, utility classes and `apply()` mixins output those tokens, and light and dark themes are built from one token model.

2.0 is a breaking release. There is no compatibility layer for 1.x names: every v1 custom property, color class and several mixin behaviors change. Projects that cannot migrate now should stay on 1.x.

From 2.2.0 the package is `@wovenui/core` and the prefix is `--wu-`. The sections below use the 2.0 and 2.1 names (`@nuvoui/core`, `--nu-`); apply the renames in [From @nuvoui/core 2.x to @wovenui/core 2.2](#from-nuvouicore-2x-to-wovenuicore-22) as well.

Related documents:

- [Token reference](./TOKENS.md): every `--nu-*` token with its light and dark value (generated).
- [Changelog](../CHANGELOG.md): the full list of changes in 2.0.0.

## Contents

1. [Breaking changes at a glance](#breaking-changes-at-a-glance)
2. [Requirements](#requirements)
3. [Configuration variables](#configuration-variables)
4. [Custom properties](#custom-properties)
5. [Utility classes](#utility-classes)
6. [Mixins and functions](#mixins-and-functions)
7. [Theme behavior](#theme-behavior)
8. [Upgrade checklist](#upgrade-checklist)
9. [From @nuvoui/core 2.x to @wovenui/core 2.2](#from-nuvouicore-2x-to-wovenuicore-22)

## Breaking changes at a glance

- Every custom property is renamed with the `--nu-` prefix and a new name. The v1 names (`--primary`, `--text-color`, `--border-base`, `--button-*`, `--link-*` and the rest) are no longer emitted.
- The main color role is `brand`, not `primary`: `$brand`, `--nu-brand`, `.bg-brand`, `bg(brand)`.
- `secondary` is removed as a color role. Use a palette hue instead.
- `$light-theme` and `$dark-theme` hold overrides only, keyed by the new token names. Values can reference a scale stop with `name stop` (for example `brand 800`).
- Mixin numbers are configuration keys: `p(4)` is spacing key 4 (`1rem` by default), the same value as the `.p-4` class. In v1 the mixin gave `4rem`. A unitless number that is not a key raises an error.
- Color mixins output tokens (`var(--nu-...)`) and follow the theme. In v1 they output fixed color values.
- `get-color()` raises an error for an unknown color instead of returning `currentcolor`, and never returns `var()`.
- Shade stops are 50, 100 to 900 and 950. In-between stops such as 450 raise an error. Shades are generated in OKLCH, so every shade value differs from v1.
- Palette shades are fixed across themes. Role tokens (brand, statuses, hue roles, surfaces, text, borders) change per theme.
- Tokens are emitted whenever the theme feature is on, even with `$generate-utility-classes: false`.
- Stricter validation: unknown keys and values for line height, easing, duration, z-index, font weight, font size, spacing, radius, border width, opacity, letter spacing, elevation, border style and backdrop filters raise compile errors instead of passing through or falling back. Negative raw lengths raise an error where negative keys do (padding, gap, sizing, radius, border width), and media and breakpoint-based container query mixins raise an error for a unitless number that is not a breakpoint name. Rotate and skew mixins raise an error for a unitless number other than 0 (for `rotate()`, other than a `$rotation-values` key such as 45); translate reads a unitless number as a spacing key, and scale as a scale key (`scale(150)` is 1.5).
- Internal utility custom properties (`--border-style`, `--flex-gap`, `--translate-*` and the rest) and the tooltip variables are renamed. See [Internal properties](#internal-properties).
- The Sass peer dependency is `>=1.79.0 <2`.
- The deprecated mixins `flex-inline`, `grid-inline`, `d-tbl`, `d-tbl-row`, `d-tbl-cell` and `text-size` are removed, and the grid flow and placement mixins are renamed to match their classes. See [Removed and renamed mixins](#removed-and-renamed-mixins).
- The `config-typo` feature flag is renamed `typography`, and `.flex` and `.grid` follow the `flex` and `grid` flags instead of `displays`. See [Feature flags](#feature-flags).
- `apply()` validates its modifiers: an unknown state (`p(4) hovr`), or more than one breakpoint or state on one item, raises an error. See [Other mixin changes](#other-mixin-changes).
- A role's fill token is the bare role name: `--nu-brand`, `--nu-danger`, `--nu-error` (not `--nu-brand-default`). A `{role}-default` key in a theme map raises an error naming the new key, and `token(brand-default)` raises an error pointing at `token(brand)`.
- Tooltips follow the `tooltips` feature flag alone and are emitted even with `$generate-utility-classes: false`.

## Requirements

| | 1.x | 2.0 |
| --- | --- | --- |
| Sass peer dependency | any Dart Sass | `>=1.79.0 <2` (the color space API is required for OKLCH shade generation) |
| Entry points | `@nuvoui/core` (SCSS), `dist/nuvoui.css` | Same paths. The `dist/` stylesheets are produced by `npm run build` from the v2 sources. |

## Configuration variables

| v1 variable | v2 | Notes |
| --- | --- | --- |
| `$primary` | `$brand` | Passing `$primary` in `with()` now fails with "This variable was not declared with !default". |
| `$secondary` | removed | Take a second color from the palette (`$color-primitives`) or add a custom theme token. |
| `$success`, `$danger`, `$warning`, `$info` | unchanged | |
| `$semantic-colors` | now a map of role name to color | Built from `$brand`, `$success`, `$danger`, `$warning` and `$info`. In v1 it was a list of names. |
| `$default-color` | removed | `get-color()` raises an error for an unknown color. |
| `$light-theme`, `$dark-theme` | override maps | Merged over built-in defaults. Keys are v2 token names without `--nu-`. See [Theme overrides](#theme-overrides). |
| (none) | `$high-contrast-light`, `$high-contrast-dark` | Override maps applied under `[data-contrast="high"]` in light and dark contexts. Empty by default. See [Theme behavior](#theme-behavior). 1.x had no high-contrast map. |
| `$theme-tokens` | no longer exported | Derived from the light theme keys inside the package; the package entry does not forward it. |
| `$color-names`, `$color-names-with-basic` | removed | |
| `$primitive-color-names` | not configurable | Derived from `$color-primitives`. |
| (none) | `$shade-stops` | Fixed list `(50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950)`, not configurable. |
| `$z-indexes`, `$z-index-levels` (in `utilities/_z-index`, not configurable) | `config/_z-index` | Now configurable (`!default`). With tooltips emitted, removing the `tooltip` level raises an error (tooltips read it for `--nu-tooltip--ZIndex`). |
| `$timing-functions`, `$durations`, `$delays` (in `utilities/_transitions`, not configurable) | `config/_transitions` | Now configurable (`!default`). |
| (hard-coded in `leading()`) | `$line-heights` | New map: `none`, `tight`, `snug`, `normal`, `relaxed`, `loose`. |
| (none) | `$control-heights`, `$control-padding-inline` | New maps (`sm`, `md`, `lg`) used by base buttons and inputs. |
| `$percentages` (read by opacity) | `$opacities` (`config/_opacity.scss`) | New map of key to opacity value with the 1.x keys (0, 5, 10, 20, 25, 30, 33, 40, 50, 60, 66, 70, 75, 80, 90, 100). `opacity()` and `.opacity-*` read it and emit `--nu-opacity-{key}`. `$percentages` still drives percentage widths and heights. |
| `$position-fractions` (not configurable) | `$position-fractions` with `!default` | Fraction keys for the `.top-25p` and similar classes and the offset mixins. |
| (none) | `$transition-default-duration`, `$transition-default-ease` | Keys (`200`, `in-out`) used by `transition()`, `.transition`, `hover-ready` and tooltips. Must be keys of `$durations` and `$timing-functions`. |
| `$units` | now `!default` | |

### Feature flags

| v1 | v2 | Notes |
| --- | --- | --- |
| `"config-typo"` | `"typography"` | A flag missing from `$feature-flags` counts as on, so `("config-typo": false)` no longer turns typography classes off. Rename the key. |
| `.flex`, `.grid` and their responsive variants under `"displays"` | under `"flex"` and `"grid"` | Each flag owns its classes: `displays: false` keeps flex and grid layouts working; `flex: false` removes every `.flex` class, `.container.flex` included (`grid` likewise). |
| Responsive `.truncate@{bp}`, `.truncate-{n}@{bp}`, `.overflow-label@{bp}` under `"config-typo"` | under `"displays"` | With the base classes. |
| (none) | `"base"` | New, on by default. Controls the base layer element styles (`base/_base.scss`, including `.sr-only`). It does not need `$generate-utility-classes`. The reset has no flag. |

```scss
// v1
@use "index" as * with (
    $primary: #4361ee,
    $secondary: #6c757d,
    $generate-utility-classes: true
);
```

```scss
@use "@nuvoui/core" as * with (
    $brand: #4361ee,
    $generate-utility-classes: true
);
```

### Theme overrides

`$light-theme`, `$dark-theme`, `$high-contrast-light` and `$high-contrast-dark` contain only the tokens you change. Each value is a CSS value or a scale reference written as a role or palette name and a stop separated by a space. A reference is emitted as `var(--nu-{name}-{stop})`.

```scss
@use "@nuvoui/core" as * with (
    $brand: #1ab5a5,
    $light-theme: (
        "brand": brand 800,
        "bg-base": #fff,
    ),
    $dark-theme: (
        "bg-base": #121212,
    )
);
```

Rules enforced at compile time:

- A key must be a built-in token name, or a new token present in both `$light-theme` and `$dark-theme` (in `$light-theme` alone when `$enable-dark-mode` is false). A typo raises "unknown tokens". Keys may be quoted or unquoted, including words Sass reads as colors (`tan`).
- A malformed reference (`brand600`, `brand-600`, `brand 450`) or a quoted string starting with `#` that is not a valid hex color (`"#ggg"`) raises an error. Every bad value of every map is listed in one error. Quoted hex colors, color names and comma-form `rgb()` values (`"#111"`, `"black"`, `"rgb(10, 20, 30)"`) are read like unquoted ones; a quoted space-syntax `rgb(10 20 30)` raises "not a valid color format". A quoted `hsl()`, `hwb()` or `oklch()` value for a `{role}` fill, `text-regular` or `text-inverted` cannot be used to compute `text-on-{role}`; it raises an error telling you to set the text-on token (or the `text-on-{role}` tokens). Write it unquoted, or set the `text-on-{role}` tokens.
- `error-*`, `text-error` and `text-on-error` cannot be set; they always follow `danger-*`.
- `text-on-{role}` is computed from the `{role}` fill in each theme: of that theme's `text-regular` and `text-inverted`, the one with the higher WCAG contrast. Setting `text-on-{role}` in a theme map overrides it; the explicit value also applies under high contrast unless the high-contrast map sets its own, so set `text-on-{role}` there too when a high-contrast map changes the `{role}` fill.
- A `{role}-default` key (`brand-default`, `error-default`) raises an error naming the bare key (`brand`); there is no fallback.
- A new token named `bg-*`, `text-*` or `border-*` with a color value also gets a utility class and works as a color word in `bg()`, `text-color()` and `border-color()`.
- A new key must not reuse a palette, basic color or scale token name (`red-500`, `white`, `space-4`).
- Role and hue names are checked too: a name in both `$semantic-colors` and `$color-primitives`, the name `error`, a basic color name (`black`, `white`, `transparent`), or a name whose generated tokens equal a built-in token (a hue named `link` would generate `text-link`) or a non-color scale token (a hue named `opacity` would generate `--nu-opacity-50`) raises an error. Keys may be quoted or unquoted.

## Custom properties

All v2 properties use the `--nu-` prefix with single hyphens. The full list with default values is in [TOKENS.md](./TOKENS.md).

### Color roles and palette

| v1 | v2 | Notes |
| --- | --- | --- |
| `--primary` | `--nu-brand` | v1 `--primary` was the 500 base and fixed. `--nu-brand` is the fill color for the current theme, a different stop per theme (default stops are in [TOKENS.md](./TOKENS.md)). For the exact base color use `--nu-brand-500`. |
| `--primary-50` to `--primary-900` | `--nu-brand-50` to `--nu-brand-900` | Fixed across themes. Values differ (new generator). `--nu-brand-950` is new. |
| `--secondary`, `--secondary-*` | removed | Use a palette hue such as `--nu-purple-500`. |
| `--success`, `--danger`, `--warning`, `--info` | `--nu-{role}` | Flips per theme. Exact base color: `--nu-{role}-500`. |
| `--success-50` etc. | `--nu-{role}-{stop}` | Fixed across themes. |
| `--red`, `--blue` and the other palette hues | `--nu-{hue}-500` | |
| `--red-500` and every palette shade | `--nu-red-500` etc. | Fixed across themes. Stop 950 is new. |
| `--black`, `--white`, `--transparent` | `--nu-black`, `--nu-white`, `--nu-transparent` | |

New role tokens: `--nu-{role}-hover`, `-active`, `-subtle`, `-border`, `--nu-text-{role}`, `--nu-text-on-{role}` for brand and each status; `--nu-error-*` aliases of `--nu-danger-*`; `--nu-{hue}-subtle`, `--nu-{hue}-border` and `--nu-text-{hue}` for each palette hue.

### Theme tokens

| v1 | v2 | Notes |
| --- | --- | --- |
| `--bg-base` | `--nu-bg-base` | |
| `--bg-surface` | `--nu-bg-surface` | |
| `--bg-alternate` | `--nu-bg-alternate` | Value changed. v1 light was near black; v2 defaults are gray 100 in light and `#242424` in dark. |
| `--text-color` | `--nu-text-regular` | |
| `--text-muted` | `--nu-text-muted` | Solid color (v1 used alpha). |
| `--text-subtle` | `--nu-text-subtle` | Solid color (v1 used alpha). |
| `--text-inverted` | `--nu-text-inverted` | |
| `--border-base` | `--nu-border-regular` | Dark value changed (v1 matched the surface). |
| `--inverted-bg-base`, `--inverted-text-color` and every `--inverted-*` | removed | For an opposite-theme region, set `data-theme="inverse"` on that element: the regular tokens (`--nu-bg-base`, `--nu-text-regular`, ...) take the opposite theme's values there (see [Theme behavior](#theme-behavior)). |
| `--button-text-color` | removed | Base buttons use `--nu-text-on-brand`. |
| `--button-bg-color` | removed | Base buttons use `--nu-brand`. |
| `--button-bg-color-hover` | removed | Base buttons use `--nu-brand-hover` (and `--nu-brand-active` when pressed). |
| `--link-color` | `--nu-text-link` | |
| `--link-hover-color` | `--nu-text-link-hover` | |
| `--font-family-base` | `--nu-font-family` | Emitted from `$font-family`; base elements read it. Set `$font-family` in `with()`, or override the token at runtime. |
| `--border-color` (set by border mixins) | removed | Border mixins set `border-color` directly. |

New theme tokens: `--nu-bg-raised`, `--nu-bg-hover`, `--nu-bg-selected`, `--nu-bg-disabled`, `--nu-border-strong`, `--nu-border-control`, `--nu-border-control-hover`, `--nu-border-focus`, `--nu-border-focus-width`, `--nu-border-focus-offset`.

### Non-color scales (new)

`--nu-space-{key}`, `--nu-radius-{key}`, `--nu-border-width-{key}`, `--nu-font-family`, `--nu-font-size-{key}`, `--nu-font-weight-{key}`, `--nu-line-height-{key}`, `--nu-shadow-{key}`, `--nu-opacity-{key}`, `--nu-z-{level}`, `--nu-duration-{key}`, `--nu-ease-{key}`, `--nu-control-height-{sm|md|lg}`, `--nu-control-padding-inline-{sm|md|lg}`. Decimal keys use `_` (`--nu-space-0_5`). Delays are not emitted as tokens.

### Internal properties

Utility and component variables also take the `--nu-` prefix. They are not tokens: `token()` does not accept them. The border mixins no longer set `--border-size`.

| v1 | v2 | Notes |
| --- | --- | --- |
| `--border-style` | `--nu-border-style` | Set by `border-style()` and the border mixins. |
| `--flex-gap` | `--nu-gap` | Set on the direct children of a gap container, not on the container. Registered with `@property` (`inherits: false`): a `.fill-{n}` item reads the gap of its direct parent only. |
| `--translate-x`, `--translate-y`, `--translate-z` | `--nu-translate-x`, `--nu-translate-y`, `--nu-translate-z` | Registered with `@property` (`inherits: false`). |
| `--scale-x`, `--scale-y` | `--nu-scale-x`, `--nu-scale-y` | Registered with `@property` (`inherits: false`). |
| `--scale-z` | removed | The transform no longer includes `scaleZ()`. |
| `--rotate` | `--nu-rotate` | Registered with `@property` (`inherits: false`). |
| `--skew-x`, `--skew-y` | `--nu-skew-x`, `--nu-skew-y` | Registered with `@property` (`inherits: false`). |
| `--backdrop-blur` and every `--backdrop-*` | `--nu-backdrop-blur` and so on | |
| `--tooltip-bg` | `--nu-tooltip--Background` | Tooltip variables follow the component grammar `--nu-{block}--{Name}`. |
| `--tooltip-text-color` | `--nu-tooltip--Color` | |
| `--tooltip-shadow-color` | `--nu-tooltip--ShadowColor` | |
| `--tooltip-transition-duration` | `--nu-tooltip--TransitionDuration` | |
| `--tooltip-transition-easing` | `--nu-tooltip--TransitionTimingFunction` | |
| `--tooltip-transition-delay` | `--nu-tooltip--TransitionDelay` | |
| `--tooltip-font-size` | `--nu-tooltip--FontSize` | |
| `--tooltip-font-weight` | `--nu-tooltip--FontWeight` | |
| `--tooltip-text-transform` | `--nu-tooltip--TextTransform` | |
| `--tooltip-small-width`, `--tooltip-medium-width`, `--tooltip-large-width` | `--nu-tooltip--WidthSmall`, `--nu-tooltip--WidthMedium`, `--nu-tooltip--WidthLarge` | |
| `--tooltip-border-radius` | `--nu-tooltip--BorderRadius` | |
| (none) | `--nu-tooltip--ZIndex` | |

Registered variables do not inherit: in v1 a child of a `.translate-x-4` element that also had `.rotate-45` inherited the parent's translation. The transform and `fill()` declarations read these variables without `var()` fallbacks (v1 wrote `var(--translate-x, 0)`); an unset variable takes its registered initial value (`0`, `0deg`, `1`, `0px`). Browsers without `@property` support (before Chrome 85, Safari 16.4, Firefox 128) treat such a declaration as invalid. Tooltips now also show on `:focus-visible` (v1 used `:focus`).

```scss
// v1
.card {
    background: var(--bg-surface);
    color: var(--text-color);
    border: 1px solid var(--border-base);
}
.card a {
    color: var(--link-color);
}
```

```scss
.card {
    background: var(--nu-bg-surface);
    color: var(--nu-text-regular);
    border: 1px solid var(--nu-border-regular);
}
.card a {
    color: var(--nu-text-link);
}
```

## Utility classes

Utility classes are generated only with `$generate-utility-classes: true` (`npm run build` compiles `dist/nuvoui.css` with them).

### Renamed and removed

| v1 class | v2 class | Notes |
| --- | --- | --- |
| `.bg-primary`, `.text-primary`, `.border-primary` | `.bg-brand`, `.text-brand`, `.border-brand` | |
| `.bg-primary-{stop}` etc. | `.bg-brand-{stop}` etc. | |
| `.bg-secondary*`, `.text-secondary*`, `.border-secondary*` | removed | Use a palette hue class such as `.bg-purple`. |
| `.text-color` | `.text-regular` | |
| `.border-base` | `.border-regular` | |
| `.text-on-{color}-{stop}` (for example `.text-on-red-700`) | removed | Use `.text-on-{role}` for role fills, or the `text-on-color()` mixin for any other color. |
| `.inverted-*` | removed | Use `data-theme="inverse"` on the region and the regular classes inside it. |
| `.gap-auto` | removed | `gap: auto` is not a valid CSS value. |
| `.backdrop-hue-{0\|90\|180\|270}` | `.backdrop-hue-rotate-{0\|90\|180\|270}` | Matches the `backdrop-hue-rotate()` mixin. |

### Changed behavior

| Class | v1 | v2 |
| --- | --- | --- |
| `.bg-{role}`, `.border-{role}` (brand, success, danger, warning, info) | Fixed 500 color | `--nu-{role}`, which flips per theme |
| `.text-{role}` | Fixed 500 color | `--nu-text-{role}`, which flips per theme |
| `.text-{hue}` (red, blue, ...) | Fixed 500 color | `--nu-text-{hue}`, which flips per theme |
| `.bg-{hue}`, `.border-{hue}` | Fixed 500 color | Fixed `--nu-{hue}-500` (unchanged meaning) |
| `.space-x-{key}` | `margin-left` | `margin-inline-start` (follows text direction, like `mx` and `px`) |
| `.space-y-{key}` | `margin-top` | `margin-block-start` (the same in horizontal writing modes) |
| `.container` | `margin-left` and `margin-right: auto` | `margin-inline: auto`; padding stays top and bottom only |
| `.col-span-{n}`, `.row-span-{n}` and responsive variants | Descendants of `.grid` (`.grid .col-span-2`) | Standalone classes, so they work in any grid, including one built with mixins, at one class of specificity |
| `.pill` | `border-radius: 9999px` | `var(--nu-radius-full)` (99in by default) |
| `.transition` and `.transition@{bp}` | `transition-property: all` only (0s until a `.duration-*` class was added) | Also the default duration and easing tokens (`var(--nu-duration-200)`, `var(--nu-ease-in-out)`), inside `:where()` so `.duration-*` and `.ease-*` override them |
| `.transition-colors`, `.transition-opacity`, `.transition-shadow`, `.transition-transform` | `transition-property` only (0s until a `.duration-*` class was added) | Also the default duration and easing, through the same `:where()` rule as `.transition` |
| `.hover-ready` | `0.2s ease-in-out` | The same default duration and easing tokens as `.transition`, inside `:where()` so `.duration-*` and `.ease-*` override them |
| `.show`, `.show@{bp}` | `display: initial` (inline for every element) | `display: revert`: the element's natural display (block for a `div`) |
| `.flex.stretch` | `justify-content: stretch` (no effect in flexbox) | Direct children share the main axis equally: `.flex:where(.stretch) > * { flex: 1 1 0% }` (one class of specificity). A child with `.fill-{n}`, `.grow` or `.no-grow` keeps its own flex value, also with `.stretch@{bp}` |
| `.opacity-{key}` | `opacity: calc(50 / 100)` | `opacity: var(--nu-opacity-50)` (same keys, from `$opacities`; 0.5 by default) |
| Tooltips (`data-tooltip`) | Needed `role="tooltip"` on the trigger | `[data-tooltip]` alone; remove `role="tooltip"` from triggers so they keep their real role |
| Tooltips without `data-tooltip-position` | No offset or arrow | Shown on top, as `data-tooltip-position="top"` |
| Tooltips on keyboard focus | Appeared without the slide | `:focus-visible` slides the tooltip in as hover does |
| Tooltip colors, size and stacking | 90% alpha background, 13px text, z-index 10 and 999 | `text-regular` as background and `text-inverted` as text (opaque, flipping with the theme), font size `sm` (14px), z-index `--nu-z-tooltip` (800) |
| Tooltips and `$generate-utility-classes` | Emitted only with `$generate-utility-classes: true` | Emitted whenever the `tooltips` flag is on (a component, like the base layer); set `"tooltips": false` to leave them out |
| Backdrop presets, `.backdrop-layer` and `.backdrop-none` | `backdrop-filter` only | `-webkit-backdrop-filter` and `backdrop-filter` |
| `.animate-shake` | Keyframes `anim-shake-5` | Keyframes `anim-shake-5px` (the name includes the unit) |
| `.border-0` | Also set `border-style` and `border-color` | Sets width only |
| Responsive `.w-auto@sm` and other sizing keyword classes | Emitted outside the media query | Inside the media query |
| `.gap-{key}`, `.gap-x-{key}` and their responsive variants | Set `--flex-gap` on the container (responsive variants did not set it) | Set `gap` on the container and `--nu-gap` on its direct children |
| `.mx-auto` | `margin-left` and `margin-right` | `margin-inline: auto` (logical, like `mx`) |
| `.sticky` | `top: 0` and `z-index: 999` at class specificity | Both inside `:where()`, so `.top-*` and `.z-*` override them. The value stays `999` (not the `z-sticky` token) |
| `.shadow-none` | `box-shadow: none !important` | No `!important`; responsive variants added |
| `.translate-{x,y}-{key}` | Fixed lengths | Spacing tokens for keys 0 to 20 (same class set as v1); fractions unchanged |
| `.w-33p`, `.w-66p` and the other percentage sizing classes for keys 33 and 66 | `33%` and `66%` | Exact thirds, `33.333%` and `66.667%`, matching `.top-33p` and `.translate-x-33p` |
| `.scale-{key}` | Factor | Unchanged factor (`.scale-150` is 1.5) |
| `.inset-*` | All inset classes, responsive ones included, emitted before `.top-*` and the other offsets | Non-responsive inset classes still come before the offsets, so a side class adjusts an inset (`inset-0 top-4`). Responsive inset classes come after every non-responsive position class, so `.inset-0@md` overrides `.top-4` |
| `.truncate`, `.truncate-{n}`, `.overflow-label` | Emitted after the display and overflow classes, `config-typo` flag | Emitted before them, `displays` flag. The responsive variants are still emitted with the responsive typography classes (also under `displays`), after the responsive display, overflow and sizing classes of every breakpoint: they override base classes such as `.whitespace-normal`, but a larger-breakpoint `.block@lg`, `.overflow-visible@lg` or `.min-w-*@lg` does not undo them (`truncate@sm overflow-visible@lg` stays truncated at `lg`). Undo a responsive truncation in your own styles |
| `.flex.inline`, `.grid.inline`, `.container.flex`, `.container.grid` | Two classes of specificity, so they beat `.hide`, `.py-0` and `.max-w-full` | `:where()` keeps them at one class (`.flex:where(.inline)`), so later utilities override them |
| `.mx-auto`, `.ms-auto` and the other auto margin classes | Emitted before `.m-*`, so `.m-4` won | Emitted after the `.m-*` classes of the same breakpoint |
| `.absolute-center` | The `-50%` translate at class specificity, after the translate classes | The translate inside `:where()`, so `.translate-*` classes (responsive ones included) adjust it |
| Media mixins (`media-up`, `media-down`, `media-between`) and the responsive sizing classes built on `media-up` | `@media screen and (min-width: ...)`; the other responsive classes already used `@media (min-width: ...)` | `@media (min-width: ...)` everywhere, so they also apply in print |
| `.ease-{name}` | Emitted twice | Emitted once, from `$timing-functions` |

### Added

- Role classes: `.text-on-brand`, `.text-on-success`, `.text-on-danger`, `.text-on-warning`, `.text-on-info`.
- Subtle backgrounds: `.bg-{role}-subtle` and `.bg-{hue}-subtle` (for example `.bg-danger-subtle`, `.bg-blue-subtle`). Color with alpha is provided through these classes only; there is no generated alpha syntax.
- Error aliases: `.bg-error`, `.text-error`, `.border-error`, `.bg-error-subtle`, `.text-on-error`.
- Theme classes: `.bg-raised`, `.bg-hover`, `.bg-selected`, `.bg-disabled`, `.text-link`, `.text-link-hover`, `.border-strong`, `.border-control`, `.border-control-hover`.
- Shade 950 for every role and hue (`.bg-red-950`).
- `active:` and `focus:` variants for the shade and theme word border color classes (`.focus:border-brand-300`, `.focus:border-control`). The base role and hue border classes (`.focus:border-red`) had them in v1.
- Logical utilities: `.ps-*`, `.pe-*`, `.ms-*`, `.me-*`, `.ms-auto`, `.me-auto`, `.start-*`, `.end-*`, `.border-s`, `.border-e`, `.border-s-{w}`, `.border-e-{w}`, `.rounded-s-*`, `.rounded-e-*`, `.rounded-ss-*`, `.rounded-se-*`, `.rounded-es-*`, `.rounded-ee-*`, `.text-start`, `.text-end`. Physical utilities (`.ml-*`, `.pr-*`, `.text-left`) remain for content that must keep its side in both directions.
- `.w-max` and `.h-max` (and their responsive variants). The mixins existed in v1 without classes.
- `hover:` and `group-hover:` forms of the non-responsive percentage width and height classes (`.hover:w-50p`, `.group-hover:h-50p`). v1 had them only with a breakpoint (`.hover:w-50p@md`).
- Decimal and fractional configuration keys are escaped in class names (`.p-0\.5` for a `0.5` key).

Role state words (`-hover`, `-active`, `-border`) have no utility class; use them through mixins (`bg(danger-hover)`) or `token()`.

```html
<!-- v1 -->
<div class="bg-primary text-white p-4">Saved</div>
<p class="text-color">Body</p>

<!-- v2 -->
<div class="bg-brand text-on-brand p-4">Saved</div>
<p class="text-regular">Body</p>
```

## Mixins and functions

### Numbers are configuration keys

Spacing, sizing, position, radius and border width mixins read a unitless number as a key of the matching map and output its token. Values with a unit pass through unchanged.

| Call | v1 output | v2 output |
| --- | --- | --- |
| `p(4)` | `padding: 4rem` | `padding: var(--nu-space-4)` (1rem) |
| `width(4)` | `width: 4rem` | `width: var(--nu-space-4)` (1rem) |
| `m(-4)` | `margin: -4rem` | `margin: calc(-1 * var(--nu-space-4))` |
| `gap(4)` | `gap: 4rem` | `gap: var(--nu-space-4)` |
| `border(1)` | `--border-size: 1px; border-width: 1px; border-style: solid; border-color: var(--border-base); --border-style: solid; --border-color: var(--border-base)` | `border-width: var(--nu-border-width-1); border-style: var(--nu-border-style); border-color: var(--nu-border-regular); --nu-border-style: solid` |
| `rounded(md)` | `border-radius: 0.5rem` | `border-radius: var(--nu-radius-md)` |
| `p(1.5rem)` | `padding: 1.5rem` | `padding: 1.5rem` (unchanged) |

A unitless number that is not a key raises an error that names the valid keys. `0` is always accepted. Write a unit for a custom value. Words are checked too: only the CSS keywords valid for the property pass through (for example `auto` for margin and sizing, `normal` for gap); any other word raises an error.

```scss
// Raises an error
.a { @include apply(p(7)); }
.a { @include apply(width(300)); }
.a { @include apply(border(3)); }
.a { @include apply(rounded(8)); }
.a { @include apply(p(auto)); }
.a { @include apply(gap(-2)); }
.a { @include apply(gap(auto)); }
.a { @include apply(width(foo)); }
```

```scss
.a {
    @include apply(p(7px), width(300px), border(3px), rounded(8px), m(-4), top(-2));
}
```

Negative keys work for margin, inset, top, right, bottom, left, translate and space mixins only. Padding, gap and sizing raise an error.

To keep a v1 result exactly, write the unit: v1 `p(4)` is v2 `p(4rem)`; v1 `width(300)` is v2 `width(300px)` or `width(300rem)`, depending on `$default-unit` in your v1 configuration.

### Color words

`bg()`, `text-color()` and `border-color()` take the short word used by the class name and output a token.

| Call | v2 output |
| --- | --- |
| `bg(brand)` | `var(--nu-brand)` |
| `bg(danger-subtle)`, `bg(danger-hover)` | `var(--nu-danger-subtle)`, `var(--nu-danger-hover)` |
| `bg(surface)` | `var(--nu-bg-surface)` |
| `bg(red)` | `var(--nu-red-500)` |
| `bg(red, 300)`, `bg(brand, 100)` | `var(--nu-red-300)`, `var(--nu-brand-100)` |
| `text-color(muted)` | `var(--nu-text-muted)` |
| `text-color(brand)`, `text-color(red)` | `var(--nu-text-brand)`, `var(--nu-text-red)` |
| `text-color(on-brand)` | `var(--nu-text-on-brand)` |
| `border-color(regular)`, `border-color(control)` | `var(--nu-border-regular)`, `var(--nu-border-control)` |
| `bg(#123456)`, `bg(var(--x))`, `text-color(inherit)` | Unchanged raw value |

In v1 these mixins resolved through `get-color()` to a fixed color (`bg(primary)` gave `#007bff`) and theme words gave `currentcolor` with a warning. `bg(primary)`, `bg(secondary)` and the prefixed form `bg(bg-surface)` now raise an error.

```scss
// v1
.badge {
    @include apply(bg(primary), text-color(white));
}
```

```scss
.badge {
    @include apply(bg(brand), text-color(on-brand));
}
```

### `get-color()`

- Returns a real color for Sass math. It never returns `var()`; `get-color(var(--x))` raises an error (v1 returned the variable).
- Role and palette names win over CSS named colors: `get-color(red)` is palette red (`#ef4444`), not CSS `red`. Other CSS names (`coral`) still work.
- An unknown name raises an error (v1 returned `currentcolor`).
- Stops: 50, 100 to 900, 950. Any other stop raises an error (v1 accepted 450 and similar).
- A color without its own shades raises an error only when another stop is requested: `get-color(transparent)` returns `transparent`, `get-color(transparent, 700)` raises an error. The same applies to a darker stop of pure black and a lighter stop of pure white.

```scss
@use "@nuvoui/core" as nuvo;
@use "sass:color";

.chart-bar {
    background: nuvo.get-color(brand, 600);
    border-color: color.mix(nuvo.get-color(red), #fff, 80%);
}
```

### `token()` (new)

`token(name)` returns `var(--nu-{name})` and raises an error for an unknown name, with close matches. Pass the name without the `--nu-` prefix.

```scss
@use "@nuvoui/core" as nuvo;

.panel {
    background: nuvo.token(bg-raised);
    box-shadow: nuvo.token(shadow-md);
    outline-color: nuvo.token(border-focus);
}
```

### Validation added

| Mixin | v1 | v2 |
| --- | --- | --- |
| `leading()` | Unknown names passed through | Key of `$line-heights`, a number, a length, `calc()`, `var()` or a keyword; anything else raises an error |
| `ease()` (new) | (none) | Key of `$timing-functions`, `cubic-bezier()`, `steps()`, `linear()`, `var()` or a CSS keyword |
| `duration()`, `delay()` | Any value | Key of `$durations` / `$delays`, a time in `s` or `ms`, `calc()` or `var()`; a negative `duration()` raises an error (a negative `delay()` is valid CSS and passes) |
| `z-index()` | Any value | Key of `$z-indexes`, a level of `$z-index-levels`, an integer, `auto`, `calc()` or `var()` |
| `font()` | Unknown weight warned and gave 400 | Key of `$font-weights` or a number from 1 to 1000; anything else raises an error |
| `font-size()` | Any value | Key of `$font-sizes`; a unitless number that is not a key, or a negative size, raises an error |
| `shadow()`, `shadow-inset()` | Validated | Validated (unchanged); `shadow(md)` now outputs `var(--nu-shadow-md)`; `shadow(none)` gives `box-shadow: none`, as `.shadow-none` |
| `translate-x()`, `translate-y()`, `translate-z()`, `translate()` | Any value; `translate-x(4)` emitted the invalid `--translate-x: 4` | A unitless number is a spacing key (`translate-x(4)` gives `var(--nu-space-4)`, `translate-x(-4)` gives `calc(-1 * var(--nu-space-4))`), the fraction keys `25p` to `100p` give percentages, values with units pass through. A number that is not a key raises an error |
| `translate-z()` | Any value | As `translate-x()`, except that a percentage or fraction key (`50%`, `50p`) raises an error: the z axis takes a length |
| `rotate()`, `skew-x()`, `skew-y()` | Any value; `rotate(45)` emitted an invalid angle | `rotate()` reads the `$rotation-values` keys (`rotate(45)` is `45deg`, as `.rotate-45`; `rotate(-45)` is `-45deg`). Other values need an angle unit (`rotate(30deg)`, `skew-x(6deg)`), `calc()` or `var()`; 0 is written `0deg`; any other unitless number or word raises an error |
| `scale()`, `scale-x()`, `scale-y()` | Raw factor; `scale(150)` gave `150` | A class key gives its factor (`scale(150)` is `1.5`, as `.scale-150`); other numbers, percentages, `calc()` and `var()` pass through; a word raises an error |
| `opacity()` | `calc(value / 100)` for any value; `opacity(0.5)` gave `0.005` | A `$opacities` key gives its token (`opacity(50)` is `var(--nu-opacity-50)`, 0.5 by default); a percentage, `calc()`, `var()` or a CSS-wide keyword passes through; anything else raises an error |
| `tracking()` | Any value; `tracking(2)` emitted `letter-spacing: 2` | A key (`tight`, `wide`), 0, a value with a unit, `calc()`, `var()` or a CSS-wide keyword; anything else raises an error |
| `elevation()` | Any level | A level from 1 to 5; anything else raises an error |
| `border-style()` | Any value | `solid`, `dashed`, `dotted`, `double`, `none`, a CSS-wide keyword or `var()`; anything else raises an error |
| `container-padding()` | Raw value | Key of `$spacings` (`container-padding(4)` gives `var(--nu-space-4)`), as `py()`; values with units pass through |
| Padding, gap, sizing, radius and border width mixins | Negative raw lengths passed through (`p(-1rem)`) | A negative raw length raises an error, as a negative key does. Margin, inset, offset, translate and space mixins still accept negative values |
| `backdrop-blur()`, `backdrop-brightness()` and the other backdrop filter mixins | A number key such as `90` was not matched and passed through (`brightness(90)`, 9000%) | A key as a number or string (`backdrop-brightness(90)` gives `brightness(90%)`); otherwise blur takes a length in px, rem or em, hue rotate an angle, the others a percentage, each also unitless 0, `calc()` or `var()`; anything else raises an error |
| `media-up()`, `media-down()`, `media-between()`, `media-only()`, `container-up()`, `container-down()`, `container-between()`, `container-only()`, `get-breakpoint-value()` | A unitless number passed through (`media-up(800)` gave `800rem`) | A breakpoint name (an unquoted `2xl` works) or a length; a unitless number that is not a name raises an error |
| `width()`, `height()`, `min-width()`, `min-height()`, `max-width()`, `max-height()` | Any value; `width(3xl)` emitted `width: 3xl` | A spacing key, a percentage key (`width(50p)` gives `50%`), a breakpoint name for the width mixins (`width(lg)` gives the `lg` breakpoint width, as `.w-lg`), a sizing keyword or a value with a CSS length unit; a number followed by other text raises an error |
| `top()`, `right()`, `bottom()`, `left()`, `inset-start()`, `inset-end()`, `inset()`, `inset-x()`, `inset-y()` | `right(25p)` emitted the invalid `right: 25p` | A `$position-fractions` key gives its percentage (`right(25p)` is `25%`, `right(-25p)` is `-25%`), as `.right-25p` does; a number followed by `p` that is not a key raises an error |
| `auto-fit()`, `auto-fill()` | `auto-fit(sm)` emitted the invalid `minmax(sm, 1fr)` | A `$grid-item-sizes` key gives its width (`auto-fit(sm)` is `minmax(250px, 1fr)`, as `.auto-fit-sm`); a length, percentage, `calc()` or `var()` passes through; a whole `minmax()` track is used as written (`auto-fill(minmax(100px, 20%))`); a unitless number (`auto-fit(4)`) or another word raises an error |
| `width-percent()`, `height-percent()` and the other percentage mixins | `width-percent(33)` gave `33%`; negative values passed | The keys 33 and 66 give exact thirds (`33.333%`, `66.667%`); an explicit percentage (`33%`) is unchanged; a negative value raises an error |
| `fill()` | `fill(0)` divided by zero | A whole number from 1 to `$column-count`; anything else (`fill(1.5)`) raises an error |
| `cols()`, `rows()`, `col-span()`, `row-span()` | Any value; `cols(foo)` emitted `repeat(foo, ...)` | A whole number of 1 or more, `calc()` or `var()`; anything else (`cols(0)`, `cols(1.5)`, `col-span(full)`) raises an error |
| `cols-custom()` | A quoted template only; every `_` became a space | An unquoted track list also works: `cols-custom(1fr 2fr)`. `_` becomes a space only outside brackets and parentheses (`"[main_start]_1fr"` keeps the line name) |
| `col-start()`, `col-end()`, `row-start()`, `row-end()`, `grid-place-at()`, `grid-col-at()`, `grid-row-at()` | Any value; an unquoted `1 / 3` emitted `0.333` | A number must be a whole line number; write a start / end pair as `"1 / 3"` or `list.slash(1, 3)` |
| `origin()` | Any value | An `$origin-values` key, or one to three position keywords, lengths, percentages, `calc()` or `var()` |
| `safe-area-inset()`, `supports()` | Any value | `safe-area-inset()` takes `top`, `right`, `bottom` or `left`; `supports()` a quoted declaration with a colon (`"display: grid"`) |
| `container()` | Any value; `container(size)` emitted `display: size` | `block`, `flex`, `grid`, `inline-block`, `inline-flex`, `inline-grid`, `flow-root`, a CSS-wide keyword or `var()`; anything else raises an error |
| `truncate-lines()`, `truncate()` | `truncate-lines()` took any value; `truncate()` took no argument | Line counts are a whole number of 1 or more, `calc()` or `var()`. `truncate($lines: 1)` takes a count like the classes: `truncate(2)` is `truncate-lines(2)`, as `.truncate-2` |
| `aspect-ratio()` | Emitted the argument as written (`16/9` unquoted was Sass division) | `aspect-ratio(16, 9)` and `aspect-ratio("16/9")` give `16 / 9`; a positive number, `auto`, `calc()` or `var()` passes through; anything else raises an error. An unquoted `16/9` is still Sass division (Sass warns) |
| `cursor()` | Any value | A CSS cursor keyword, a CSS-wide keyword, or a value holding `url()` or `var()`; anything else raises an error |
| `gradient()` | Stops written as passed | Color names resolve like `bg()` (`gradient(to right, brand, red 40%)` gives `var(--nu-brand), var(--nu-red-500) 40%`); unknown words raise the `bg()` error |
| `media-between()` | Any pair | Raises an error when the lower breakpoint is not smaller than the upper one (`media-between(lg, sm)`) |
| `animate-*()` `$props` | Unknown keys were ignored | An unknown key raises an error listing the valid keys |
| `bg()`, `text-color()`, `border-color()` | Color functions other than `rgb()` passed only in some load styles | Without a shade, any CSS color function (`hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, `color()`, `color-mix()`, `light-dark()`) passes through on every path; a quoted hex (`bg("#ff5733")`) is emitted unquoted. With a shade the value must be one Sass reads as a color (in a namespaced load only hex, `rgb()`, `rgba()` and CSS color names) |
| `animate-fade()` | An unknown type emitted empty keyframes | `in`, `out`, `in-up` or `in-down`; anything else raises an error |
| `animate-shake()`, `animate-bounce()`, `animate-ping()` | A unitless offset emitted invalid `translateX(8)` | Offsets are lengths (`(intensity: 8px)`): a unitless number other than 0, `calc()` or `var()` raises an error. `animate-ping()` takes a unitless scale. Quoted map values are read like unquoted ones |
| `container-query()` | Any value; `container-query(md)` emitted `min-width: md` and `container-query(30)` emitted `min-width: 30` | A breakpoint name resolves to its width (`md` gives 768px), a length or `calc()` is used as is; any other word or a unitless number raises an error |
| Scale mixins given a list (`p(4px 8px)`, `m(0 auto)`) | Failed inside `fix-units()` with an unrelated message | Raise `{mixin}: unknown value 4px 8px`, as through namespaced `nu.apply()` |
| Color strings (`get-color("#ggg")`) | An invalid hex or rgb() string warned | Raises an error |

### Removed and renamed mixins

| v1 | v2 | Notes |
| --- | --- | --- |
| `flex-inline` | `inline-flex` | Deprecated in 1.x, removed. |
| `grid-inline` | `inline-grid` | Deprecated in 1.x, removed. |
| `d-tbl`, `d-tbl-row`, `d-tbl-cell` | `table`, `table-row`, `table-cell` | Deprecated in 1.x, removed. |
| `text-size($size)` | `font-size($size)` | Deprecated in 1.x, removed. |
| `flow-in-row`, `flow-in-col`, `flow-dense-items` | `flow-row`, `flow-col`, `flow-dense` | Now match the `.flow-row`, `.flow-col`, `.flow-dense` classes. |
| `grid-position($col, $row)` | `grid-place-at($col, $row)` | |
| `position-col($col)` | `grid-col-at($col)` | |
| `position-row($row)` | `grid-row-at($row)` | |
| `responsive-config-typo($breakpoint)` | `responsive-typography($breakpoint)` | Follows the flag rename. |
| `stretch` | `stretch` | Same name, new behavior: sets `flex: 1 1 0%` on direct children (`& > *`) instead of `justify-content: stretch`. Takes no argument. |
| `show` | `show` | Same name: `display: revert` instead of `display: initial`. |

A removed name raises "Undefined mixin" (direct `@include`) or "Mixin not found" (inside `apply()`). `justify()`, `align()` and `place()` keep their names; they set `justify-items`, `align-items` and `place-items` and are meant for grid containers (for flex use `start`, `center`, `between` and the `x-*` mixins).

### Other mixin changes

- `apply()` modifiers: each item takes at most one breakpoint and one state. A state is one of `hover`, `focus`, `focus-visible`, `focus-within`, `active`, `visited`, `disabled`, `enabled`, `checked`, `required`, `invalid`, `valid`, `placeholder-shown`, `read-only`, `first-child`, `last-child`, `only-child`, `first-of-type`, `last-of-type`, `empty`, `target` or `group-hover`; v1 wrapped any word in `&:word`, so a typo (`hovr`) or a third modifier compiled silently (`hover md lg` kept only the last breakpoint with `@use ... as *` and emitted `.x:md lg` in a namespaced load). `group-hover` emits `.group:hover &` like the `group-hover:` classes (v1 emitted the invalid `&:group-hover`).
- Scale error messages name the mixin: `width(foo)` raises `width: unknown value foo` and `p(7)` raises `p: 7 is not a configured key`, the same through direct calls, `apply()` and `nu.apply()`.
- Backdrop filter value maps (`$backdrop-blur-values`, `$backdrop-brightness-values` and the rest) and `$backdrop-filter-presets` are `!default`, so a `with()` clause can change them.
- `$container-names` is forwarded by the package entry and configurable.
- `transition-colors`, `transition-opacity`, `transition-shadow` and `transition-transform` set the default duration and easing like `transition()`; include `duration()` or `ease()` after them to change one.

- `text-on-color(role)` outputs `var(--nu-text-on-{role})`. Any other color, or a role with a shade, is computed at compile time and picks the theme text color with the higher WCAG contrast (v1 used a fixed luminance threshold).
- `space-x()` sets `margin-inline-start` and `space-y()` sets `margin-block-start`.
- `container-base()` and `container()` center with `margin-inline: auto`.
- `transition()` sets `transition-property: all` plus the default duration and easing tokens, from `$transition-default-duration` and `$transition-default-ease`; include `duration()` or `ease()` after it to change one. `hover-ready` uses the same defaults.
- `border-top()`, `border-right()`, `border-bottom()`, `border-left()`, `border-start()` and `border-end()` take an optional color as a third argument (`border-top(1, solid, danger)`), resolved like `border()`.
- `border-all()` gives the same output as `border()` with all three arguments: the style goes through `--nu-border-style`.
- `pill` uses `var(--nu-radius-full)`.
- `media-down()` and `media-between()` end 0.02px below the breakpoint (v1: 0.01px), like `media-only()` and the container query mixins; em and rem breakpoints subtract 0.00125 of their unit. `landscape` and `portrait` no longer include `screen and`. `container-query()` interpolates its size (v1 emitted `(min-width: $size)` literally).
- `animate-shake`, `animate-ping`, `animate-pulse` and `animate-bounce` build valid keyframes names from decimal values (`.` becomes `_`); `animate-shake` includes the unit in the name.
- New logical mixins: `ps()`, `pe()`, `ms()`, `me()`, `ms-auto`, `me-auto`, `inset-start()`, `inset-end()`, `border-start()`, `border-end()`, `rounded-s()`, `rounded-e()`, `rounded-ss()`, `rounded-se()`, `rounded-es()`, `rounded-ee()`, `text-start`, `text-end`.
- `border()` with no color uses `--nu-border-regular`. `border(0)` sets the width only.
- `dark-mode { ... }` applies where the dark tokens resolve: on and under `[data-theme="dark"]`, an inverse section that resolves dark, and (through `prefers-color-scheme: dark`) `:root:not([data-theme])`, stopping at a nested `data-theme` section that resolves light; v1 also matched inside a light section of a dark page. The output is CSS `@scope` (Chrome 118, Safari 17.4, Firefox 146); a browser without `@scope` ignores the dark-mode styles. v1 read `[data-theme="system"]` for the OS case; that value is no longer recognized. Omit `data-theme` on the root element to follow the OS.
- `mx-auto` sets `margin-inline: auto`.
- `gap()` and `gap-x()` set `--nu-gap` on direct children (`& > *`), so they need a selector. `gap(normal)` emits `gap: normal` (v1 emitted `normalrem`).
- `container-name()` emits the name unquoted (v1 emitted a quoted string, which is not a valid container name).
- `cols-custom("1fr 2fr")` emits the template unquoted (v1 emitted a quoted string). `_` still works as a space: `cols-custom("1fr_auto")`.
- `create-color-scale()` takes a color or a string holding one (`"#007bff"`); any other value raises an error.
- `to-css-var()` is no longer forwarded by the package entry and has no fallback parameter. Use `token()` for `--nu-*` tokens.
- `to-color()`, `from-hex()`, `hex-to-dec()`, `luminance()`, `is-valid-color()`, `is-valid-shade()`, `validate-theme-tokens()`, the `validate-tokens` mixin, `$translate-values`, `$negative-translate-values`, `$colors-primitives`, `$digit-map`, `$colors` and `$color-cache` are no longer public. The `apply()` internals `pam()`, `pai()`, `am()` and `$ac` are not forwarded.
- A CSS `inset()` value (`clip-path: inset(50%)`) in a stylesheet that loads the package with `as *` now compiles; in v1 it resolved to the `apply()` registry.
- With a namespaced load (`@use "@nuvoui/core" as nu`), `nu.apply()` receives its items as text. Numeric arguments are converted to real numbers (`12px`, `250ms`, `-0.5`) and CSS functions written as text (`clamp(1rem, 2vw, 2rem)`) are accepted, so `nu.apply()` takes the same inputs as `apply()` and the direct `@include`, with these exceptions set by Sass: a map argument cannot be written into a text item, so pass such an item as a call (`nu.apply(nu.animate-spin((duration: 2s)))`); a color function other than `rgb()` or `rgba()` with a shade raises an error (it arrives as text, not a color); and `opacity(...)` with anything but a number (below). A quoted argument is read as the value it spells in every mixin and every load style (`font-size("1.25rem")` gives `1.25rem`, `cols("3")` gives `repeat(3, ...)`); v1 emitted some quoted values as invalid CSS. In a namespaced load Sass resolves `opacity(inherit)`, `opacity("50")` and any other non-number argument to its built-in color function before `nu.apply()` sees it; call the package function instead, `nu.apply(nu.opacity(inherit), nu.opacity("50") hover)`, or write `opacity(50)` for a key. Likewise Sass evaluates the color functions it knows (`hwb(0 0% 0%)`, `rgb(255, 0, 0)`) before `nu.apply()` sees them, so a result that prints as a palette name (`red`) resolves as the palette color.
- `apply()` caches parsed items and resolved values. Bounded inputs (keys, theme words, role and hue names) are cached as in v1; raw values (`p(13px)`, `bg(#ff5733, 600)`) go in size-capped caches (128 entries per generation, two generations), so repeated raw values are resolved once and a stylesheet of unique values compiles in linear time. v1 cached every item in one cache, which made compile time grow quadratically with the number of unique values.
- `to-number()` returns a real number with its unit (`to-number("12px")` is `12px`; v1 returned the string `12px`). `$append-unit` takes a unit name or a unit number (`to-number("8", 1rem)` is `8rem`).
- `origin()` resolves `$origin-values` keys (`origin(top-left)` gives `transform-origin: top left`, like `.origin-top-left`); other values must be valid `transform-origin` parts.
- `container()` and `.container` work with em and rem breakpoints (`calc(40em - 100px)`), and so does the breakpoint debugger. `media-only()` with a length in another unit than the breakpoints (`media-only(50em)` with px breakpoints) raises an error.
- `text-on-color()` names itself in its errors; with the theme feature flag off, color names in `bg()`, `text-color()` and `border-color()` raise an error that says so.
- `to-number()` returns `null` for a string with no digit before its first other character (`"."`).
- `find-text-color($background, $text-colors: null)` takes an optional pair of candidate colors; without it, it uses the light theme `text-regular` and `text-inverted`.

## Theme behavior

- **Fixed palette, flipping roles.** Palette shades (`--nu-red-100`) never change. The dark theme re-points role and theme tokens at other stops of the same scale (default stops are listed in [TOKENS.md](./TOKENS.md)). `text-on-{role}` is computed in both themes and becomes dark in dark mode when the fill is light (the default dark role fills, stop 400, all take the dark text `#1a1a1a`).
- **Selectors.** Fixed tokens (palette, basic colors, non-color scales, `--nu-font-family`) are on `:root` only. Light theme tokens are on `:root, [data-theme="light"]`, so a runtime `:root { --nu-font-family: ... }` override also applies inside a `[data-theme="light"]` section. Dark tokens are on `[data-theme="dark"]` and, through `prefers-color-scheme: dark`, on `:root:not([data-theme])` only. In v1 the fallback selector also matched every element without a `data-theme` attribute, which overrode nested light sections.
- **Inverse sections.** `data-theme="inverse"` (replaces the v1 `inverted-*` layer) gives a section the opposite theme of the page: the dark values on a light page (`[data-theme="inverse"]`), the light values under an explicit dark page (`[data-theme="dark"] [data-theme="inverse"]`) or the OS fallback (`:root:not([data-theme]) [data-theme="inverse"]` inside `prefers-color-scheme: dark`). An inverse section inside another inverse section flips back (`[data-theme="inverse"] [data-theme="inverse"]` takes the light values; `[data-theme="dark"] [data-theme="inverse"] [data-theme="inverse"]` and the fallback form take the dark values): what counts is whether the outer inverse section has a `[data-theme="dark"]` ancestor or the fallback root, and a `data-theme="light"` or `"dark"` section between the two inverse sections is not taken into account. Deeper inverse nesting is not supported. Every theme token is set, so the regular classes and mixins work inside it. It resolves against the nearest `[data-theme="dark"]` ancestor or the page: inside a `[data-theme="light"]` section that sits in a dark page it still gives the light values, so set `data-theme="dark"` there instead. It is not emitted when `$enable-dark-mode` is false.
- **Nested themes.** Because every role is a custom property, `data-theme="dark"` or `data-theme="light"` on any element re-themes that subtree.
- **High contrast.** `[data-contrast="high"]` on the root, on an element that sets `data-theme`, or on an ancestor of either applies `$high-contrast-light` where the theme resolves to light and `$high-contrast-dark` where it resolves to dark: explicit themes, the `prefers-color-scheme` fallback, inverse and nested inverse sections alike. Every theme selector gets a twin compounded with `:is([data-contrast="high"], [data-contrast="high"] *)`, emitted after the theme blocks in the same order, so the twin that wins is always the twin of the theme block that wins. Each twin carries the keys of both maps; a key its own map lacks keeps the base theme value, so a key set in only one map never leaks into the other theme. An element without `data-theme` inherits its tokens and is not restyled by its own `data-contrast` attribute. Both maps are empty by default, so nothing is emitted until you set values; `$high-contrast-dark` is ignored when `$enable-dark-mode` is false. Keys and values follow the same rules as `$light-theme`.
- **Tokens without classes.** Tokens are emitted whenever the `theme` feature flag is on, independent of `$generate-utility-classes`. Mixin-only projects get them. With the `theme` flag off, scale mixins output raw values, color words and `token()` raise an error, and `text-on-color()` computes its color at compile time. `border()` without a color emits no `border-color` then (its default is the `--nu-border-regular` token), so the border takes `currentcolor`; pass a color value for another one. `--nu-font-family` is not emitted either, and base elements use the `$font-family` value.
- **Base layer.** Controlled by the `base` feature flag (on by default). `body` sets `background-color: var(--nu-bg-base)` and `color: var(--nu-text-regular)` (v1 referenced an undefined `--text-default` and set no background). Buttons (`button` and `input` of type `submit`, `button`, `reset`) and form fields (including `input` without a `type`) are styled from tokens, with a visible `:focus-visible` ring (`--nu-border-focus`, width and offset tokens). Invalid fields use `--nu-danger`, or `--nu-border-control` when the configuration has no `danger` role. A `select` with `multiple` or a `size` other than 1 keeps its natural height, and only inline `code` (not code inside `pre`) is kept on one line. Base `<code>` padding is `0 var(--nu-space-1)` (0 and 4px; was 2px and 6px). Headings use the `tight` line height (1.25, was 1.2). The base layer reads these configuration keys and raises an error naming the map when one is removed: `$spacings` 1, 2 and 4, `$border-radii` `xs`, `$border-widths` 1 and 4, `$font-sizes` `sm`, `base`, `lg`, `xl`, `2xl`, `3xl` and `4xl`, `$font-weights` `normal` and `bold`, `$line-heights` `normal` and `tight`, `$control-heights` and `$control-padding-inline` `md`, and the transition default keys.
- **Reduced motion.** As in 1.x, the reset shortens every animation and transition to 0.01ms (one iteration) and disables smooth scrolling under `prefers-reduced-motion: reduce`, with `!important`. This is deliberate (WCAG 2.3.3): it covers animations written by hand or with NuvoUI mixins alike, which a selector list of NuvoUI classes could not. Because important declarations in an earlier cascade layer win, an essential animation (a progress spinner) is restored inside the same layer, for example `@layer reset { @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 1s !important; animation-iteration-count: infinite !important; } } }`.

```html
<html data-theme="dark">
  <body>
    <section data-theme="light">Light section inside a dark page</section>
    <section data-theme="inverse">Always the opposite of the page (light here)</section>
  </body>
</html>
```

```scss
@use "@nuvoui/core" as * with (
    $high-contrast-light: ("text-muted": #000, "border-control": gray 900),
    $high-contrast-dark: ("text-muted": #fff)
);
```

## Upgrade checklist

1. Upgrade Sass to 1.79.0 or later.
2. In `with()`: rename `$primary` to `$brand`; remove `$secondary` and `$default-color`; rewrite `$light-theme` and `$dark-theme` as override maps with v2 token names; rename the `"config-typo"` feature flag to `"typography"`.
3. Search your styles for `var(--` and replace each v1 property using the tables above, including internal ones (`--flex-gap`, `--translate-*`, `--tooltip-*`). Remove uses of `--secondary*`, `--inverted-*`, `--button-*` and `--font-family-base`.
4. Search templates for `primary`, `secondary`, `text-color`, `border-base`, `text-on-`, `inverted-`, `backdrop-hue-` and `gap-auto` classes and rename or remove them (`inverted-*` regions become `data-theme="inverse"`, `.backdrop-hue-90` becomes `.backdrop-hue-rotate-90`, `.gap-auto` has no replacement). Remove `role="tooltip"` from tooltip triggers. Check `.stretch` (children now share the row) and `.show` (now restores the natural display).
5. Rename removed and renamed mixins: `flex-inline`, `grid-inline`, `d-tbl*`, `text-size`, `flow-in-*`, `flow-dense-items`, `grid-position`, `position-col`, `position-row` (see [Removed and renamed mixins](#removed-and-renamed-mixins)); a removed mixin raises an error. Also search for the functions that are no longer public (`to-css-var()`, `to-color()`, `from-hex()`, `hex-to-dec()`, `luminance()`, `is-valid-color()`, `is-valid-shade()`, `validate-theme-tokens()`): Sass does not report an unknown function, it writes the call into the CSS as plain text.
6. Review every numeric mixin argument: `p(4)` is now 1rem, not 4rem, and `translate-x(4)` is spacing key 4. Add units where you meant a raw value, including skew (`6deg`) and rotate angles that are not `$rotation-values` keys (`rotate(30deg)`; `rotate(45)` is the key, 45deg). Check `scale()` (`scale(150)` is now 1.5) and `opacity()` (keys such as 50, not 0.5).
7. Replace `bg(primary)` with `bg(brand)`, theme colors with their short words (`bg(surface)`, `text-color(muted)`, `border-color(regular)`), and check calls that relied on `currentcolor` fallbacks.
8. Replace `get-color(var(...))` with the variable itself, and any stop outside 50, 100 to 900, 950 with a valid stop.
9. Check RTL layouts that used `space-x-*`: it now follows text direction. `space-y-*` uses `margin-block-start`, which differs from `margin-top` only in vertical writing modes.
10. Add a unit to numeric breakpoints in media and container query mixins (`media-up(800px)`), and check custom `.transition` styles: the class now has a default duration.
11. Compile. Unknown keys, names, modifiers and removed mixins are reported as Sass errors naming the valid keys or names. A removed function is not (see step 5), so search the compiled CSS for `to-css-var(`, `to-color(` and the other names of step 5.
12. Review both themes visually: shade values, `bg-alternate`, dark borders and role fills changed.

## From @nuvoui/core 2.x to @wovenui/core 2.2

NuvoUI is renamed WovenUI in 2.2.0. The mixins, functions, configuration variables and token names after the prefix are unchanged; the names below change.

| | `@nuvoui/core` 2.0 and 2.1 | `@wovenui/core` 2.2 |
| --- | --- | --- |
| Package | `npm i @nuvoui/core` | `npm i @wovenui/core` |
| Sass entries | `@use "@nuvoui/core"`, `@nuvoui/core/mixins`, `pkg:@nuvoui/core` | `@use "@wovenui/core"`, `@wovenui/core/mixins`, `pkg:@wovenui/core` |
| Custom property prefix | `--nu-` (`--nu-brand`, `--nu-gap`, `--nu-tooltip--Background`) | `--wu-` (`--wu-brand`, `--wu-gap`, `--wu-tooltip--Background`) |
| Prebuilt CSS | `dist/nuvoui.css`, `dist/nuvoui.min.css` | `dist/wovenui.css`, `dist/wovenui.min.css` |
| Debugger classes | `.NuvoUI-Debugger-*` | `.WovenUI-Debugger-*` |
| `$default-container-name` default | `nuvoui-container` | `wovenui-container` |

Steps:

1. Replace the dependency: remove `@nuvoui/core` and install `@wovenui/core`.
2. Replace `@nuvoui/core` with `@wovenui/core` in every `@use`, `@forward` and `<link>` path, and `dist/nuvoui` with `dist/wovenui` in file paths.
3. Find and replace `--nu-` with `--wu-` in stylesheets, templates and scripts (hand-written `var(--nu-...)`, inline styles, `getPropertyValue("--nu-...")`). The prefix is fixed and not configurable. Calls to `token()` and the keys of `$light-theme`, `$dark-theme` and the high-contrast maps carry no prefix and stay as they are. If a project also uses other packages that still emit `--nu-` names, limit the replacement to core tokens.
4. Rename `.NuvoUI-Debugger-` to `.WovenUI-Debugger-` in any style that targets the debugger overlay, and update any code that reads `$default-container-name`.
5. Compile and search the output for `--nu-`: a remaining hand-written `var(--nu-...)` is not reported by Sass and resolves to nothing in the browser.
