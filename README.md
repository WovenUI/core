# WovenUI Core

The foundation layer of the WovenUI design system: design tokens, utility classes and SCSS mixins, written in Sass.

WovenUI is a utility-first framework for Sass projects and an alternative to Tailwind CSS. Use the classes in markup, or the same utilities as mixins through `apply()` in your stylesheets. See the [comparison with Tailwind CSS](https://wovenui.com/vs/tailwind/) and the [setup guides](https://wovenui.com/guides/).

[![GitHub stars](https://img.shields.io/github/stars/WovenUI/core?style=flat-square&color=FFB000)](https://github.com/WovenUI/core)
[![GitHub forks](https://img.shields.io/github/forks/WovenUI/core?style=flat-square&color=FFB000)](https://github.com/WovenUI/core)
[![npm version](https://img.shields.io/npm/v/@wovenui/core?style=flat-square&color=FF6F00)](https://www.npmjs.com/package/@wovenui/core)
[![Discord](https://img.shields.io/discord/1307989034638905345?style=flat-square&label=Discord&color=5865F2)](https://discord.gg/dhxxKTK5Zx)

## Overview

`@wovenui/core` provides:

- **Design tokens** emitted as CSS custom properties with the `--wu-` prefix, with light and dark themes built from one token model.
- **Utility classes** with human-readable names (`between`, `x-center`), responsive suffixes (`p-4@md`) and state prefixes (`hover:`, `focus:`, `active:`, `group-hover:`).
- **SCSS mixins** through `@include apply(...)`, which output the same tokens as the classes, so styles written in SCSS follow the active theme.
- **Base styles** for plain HTML elements, including buttons and form controls built on tokens.

Core is SCSS and CSS only. It has no JavaScript runtime.

Version 2.0 is a breaking release. Projects upgrading from 1.x should read the [migration guide](docs/MIGRATION-v2.md).

## Requirements

- Dart Sass `>=1.79.0 <2` (peer dependency). The color space API in Sass 1.79 is required for OKLCH shade generation.

## Installation

```bash
npm install @wovenui/core sass
# or
pnpm add @wovenui/core sass
# or
yarn add @wovenui/core sass
```

## Usage

### SCSS

```scss
@use "@wovenui/core" as * with (
    $brand: #4361ee,
    $light-theme: (
        "brand": brand 800,
        "bg-base": #fff,
    ),
    $dark-theme: (
        "bg-base": #121212,
    ),
    $generate-utility-classes: true
);
```

- `$brand` sets the main color role. `$success`, `$danger`, `$warning` and `$info` set the status roles.
- `$light-theme`, `$dark-theme`, `$high-contrast-light` and `$high-contrast-dark` hold overrides only. Keys are token names without `--wu-`. A value is a CSS value or a scale reference written as a name and a stop (`brand 800`), emitted as `var(--wu-brand-800)`. Unknown keys and malformed references raise compile errors.
- Tokens and base styles are emitted by default. Utility classes are emitted only with `$generate-utility-classes: true`; mixin-only projects can leave it off.
- Every compiled entry that `@use`s `@wovenui/core` emits the tokens, reset, base layer, tooltips and `@property` registrations (about 42 KB with `--style=compressed`, under 6 KB gzipped). Load it once, in the global stylesheet; component styles load `@wovenui/core/mixins` (see [Component styles](#component-styles)).

`@use "@wovenui/core"` resolves through the package `sass` export in bundlers that support it, such as Vite, Next.js (Turbopack and webpack), Astro and webpack `sass-loader`. With the Dart Sass command line or JavaScript API, use the Node package importer:

```scss
@use "pkg:@wovenui/core" as *;
```

```bash
sass --pkg-importer=node src/app.scss dist/app.css
```

### Component styles

`@wovenui/core/mixins` is the same API as `@wovenui/core` (`apply()`, every mixin, `token()`, `get-color()`, the variables and the same `with()` configuration) with no CSS output. Use it in CSS modules, Vue and Svelte `<style>` blocks and any other per-component compile, so the tokens and base styles are not repeated in every component and a component never resets the configured brand. Write the configuration once in a partial:

```scss
// src/styles/_woven.scss
@forward "@wovenui/core/mixins" with ($brand: #4361ee);

// src/styles/global.scss, loaded once by the app: tokens, base styles and classes with the same configuration
@use "woven";
@use "@wovenui/core";

// Card.module.scss: outputs only .card
@use "../styles/woven" as *;

.card {
    @include apply(p(4), bg(surface), rounded(md), shadow(md) hover, p(6) md);
}
```

In `global.scss`, `@use "woven"` must come before `@use "@wovenui/core"`: both load the same configured modules, and configuring them after `@wovenui/core` has loaded raises an error. Put `$generate-utility-classes: true` in the partial to get the classes in the global stylesheet; component compiles still output nothing extra.

### Prebuilt CSS

`npm run build` compiles the default configuration with every utility class to `dist/wovenui.css` and `dist/wovenui.min.css`, the files the package `style` and `./css` exports point at:

```html
<link rel="stylesheet" href="node_modules/@wovenui/core/dist/wovenui.min.css">
```

## Design tokens

Every token is a CSS custom property named `--wu-{name}` with single hyphens (`--wu-text-muted`, `--wu-space-4`). Tokens fall into two groups:

| Tier                     | Examples                                                                                                                      | Behavior                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Palette, basic and scale | `--wu-red-500`, `--wu-white`, `--wu-space-4`, `--wu-radius-md`, `--wu-font-size-lg`, `--wu-font-family`                    | Fixed. The same value in every theme. Emitted on `:root` only.                |
| Theme and role           | `--wu-bg-surface`, `--wu-text-muted`, `--wu-border-regular`, `--wu-brand`, `--wu-danger-subtle`, `--wu-text-on-brand`         | Flip per theme. The dark theme points roles at other stops of the same scale. |

Roles are `brand`, `success`, `danger`, `warning` and `info`. The bare name is the fill (`--wu-brand`), with `-hover`, `-active`, `-subtle` and `-border`, plus `--wu-text-{role}` and `--wu-text-on-{role}`. `--wu-error` and the other `--wu-error-*` tokens alias `--wu-danger-*`.

Fixed tokens are declared on `:root` only, and the light block (`:root, [data-theme="light"]`) holds the theme tokens, so a runtime override on `:root` (for example `:root { --wu-font-family: "Inter", sans-serif; }`) also applies inside `data-theme="light"` sections.

Themes are selected with the `data-theme` attribute:

- `data-theme="light"` or `data-theme="dark"` on any element themes that element and its subtree, so sections can be nested.
- Without a `data-theme` attribute on the root element, the page follows the operating system through `prefers-color-scheme`.
- `data-theme="inverse"` gives a section the opposite theme of the page: dark values on a light page, light values under a dark page (explicit or from the operating system).
- `data-contrast="high"` on the root, on an element that sets `data-theme`, or on an ancestor of either applies `$high-contrast-light` where the theme resolves to light and `$high-contrast-dark` where it resolves to dark, inverse and nested inverse sections included. Every theme selector has a high-contrast twin of higher specificity, and each twin carries the keys of both maps (a key its own map lacks keeps the base theme value), so a value from the other map never leaks. An element without `data-theme` inherits; it is not restyled by a `data-contrast` attribute of its own. Both maps are empty by default, so nothing is emitted until values are set.

```html
<html data-theme="dark">
  <body>
    <section data-theme="light">A light section inside a dark page</section>
    <section data-theme="inverse">The opposite of the page (light here)</section>
  </body>
</html>
```

The full token list with light and dark values is in the [token reference](docs/TOKENS.md).

## Utility classes

```html
<article class="bg-surface border border-regular rounded-md p-4 p-6@md">
  <h2 class="text-regular font-bold">Invoice 1042</h2>
  <p class="text-muted ms-4">Due in 3 days</p>
  <div class="bg-danger-subtle text-danger rounded-md p-2">Payment failed</div>
  <button class="bg-brand text-on-brand px-4 py-2">Pay now</button>
</article>

<div class="grid cols-12 gap-4">
  <div class="col-span-12 col-span-6@md col-span-4@lg">Sidebar</div>
  <div class="col-span-12 col-span-6@md col-span-8@lg">Content</div>
</div>

<div class="flex between x-center wrap">
  <span>Left</span>
  <span>Right</span>
</div>
```

- Color classes use theme words (`bg-surface`, `text-muted`, `border-regular`), roles (`bg-brand`, `text-danger`, `text-on-brand`, `bg-danger-subtle`) and palette shades (`bg-blue-100`).
- Logical classes (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `text-end`) follow the text direction. Physical classes (`ml-*`, `pr-*`, `text-left`) remain for content that keeps its side in both directions.
- A breakpoint suffix applies from that width up: `p-6@md`, `col-span-4@lg`.

## Mixins with `apply()`

`apply()` takes mixin calls separated by commas. A state and a breakpoint follow the call, in either order.

```scss
@use "@wovenui/core" as *;

.card {
    @include apply(bg(surface), text-color(regular), border(1), rounded(md), p(4), shadow(md));
    @include apply(p(6) md, bg(hover) hover, bg(selected) hover lg);
}

.badge {
    @include apply(bg(danger-subtle), text-color(danger), px(2), rounded(sm), ms(2));
}
```

- A unitless number is a configuration key: `p(4)` outputs `padding: var(--wu-space-4)`, the same value as the `.p-4` class. A number that is not a key raises an error. Values with units pass through: `p(1.5rem)`.
- Color mixins take the class words and output tokens: `bg(brand)` gives `var(--wu-brand)`, `text-color(muted)` gives `var(--wu-text-muted)`.
- With a namespaced load (`@use "@wovenui/core" as woven`), write `woven.apply(...)`. One item needs the namespace inside it: Sass reads a bare `opacity(inherit)` or `opacity("50")` as its built-in color function, so write `woven.apply(woven.opacity(inherit))` (`opacity(50)` works as it is).

## Performance

`apply()` compile time, measured with Dart Sass 1.103.1 (the `sass` npm package) on Node 24, Apple M2 Pro, median of three runs, `@use "@wovenui/core" as *`:

| Stylesheet | Time | Output |
| --- | --- | --- |
| `@use` line only (package load, tokens, base) | 191 ms | 1,390 lines |
| 5,000 rules, six repeated items each | 2,049 ms | 96,389 lines |
| 2,000 rules, two unique raw values each | 2,686 ms | 29,389 lines |
| 5,000 rules, two unique raw values each | 6,420 ms | 71,389 lines |

```scss
@for $i from 1 through 2000 {
    .card-#{$i} {
        @include apply(p(#{$i}px) md, m(#{$i * 0.01}rem) lg, bg(red, 500) hover);
    }
}
```

- A repeated item costs about 60 µs. A unique raw value costs about 0.6 ms, the same at 2,000 and 5,000 rules, so compile time grows linearly with the number of unique values.
- The package load is a fixed cost per compiled entry. Compile one entry that imports your partials.
- `pnpm test:perf` guards `apply()` against the last release, including the namespaced path, where parsed items go into size-capped caches.

Run the loop in the [playground](https://wovenui.com/playground/).

## `token()`

`token($name)` returns `var(--wu-{name})` and raises an error with close matches for an unknown name. Use it for tokens in hand-written CSS properties.

```scss
@use "@wovenui/core" as woven;

.panel {
    background: woven.token(bg-raised);
    box-shadow: woven.token(shadow-md);
    outline: woven.token(border-focus-width) solid woven.token(border-focus);
    outline-offset: woven.token(border-focus-offset);
}
```

`get-color($name, $stop)` returns a real color value for Sass math, for example `color.mix(woven.get-color(brand, 600), #fff, 80%)`.

## Documentation

- [Migration guide](docs/MIGRATION-v2.md)
- [Token reference](docs/TOKENS.md)
- [Changelog](CHANGELOG.md)
- [Documentation site](https://wovenui.com/)

## Browser support

Current versions of evergreen browsers. The output relies on CSS custom properties, cascade layers, logical properties and `:focus-visible`; the `dark-mode` mixin emits `@scope` (Chrome 118, Safari 17.4, Firefox 146). Transform and flex gap variables are registered with `@property` so they do not inherit, and the declarations that read them have no `var()` fallback: browsers without `@property` support (before Chrome 85, Safari 16.4, Firefox 128) treat those declarations as invalid.

## Community and support

- [GitHub Issues](https://github.com/WovenUI/core/issues)

## License

WovenUI is open source under the [MIT License](https://github.com/WovenUI/core/blob/main/LICENSE).
