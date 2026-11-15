# Changelog

All notable changes to `@wovenui/core` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.1] - 2026-11-15

### Fixed

- `apply()` emits one `@media` block per breakpoint, holding the items without a state and then one rule per state (was one `@media` block per item). Repeated states share one rule, with or without a breakpoint. Order and declarations are unchanged.

## [2.4.0] - 2026-11-12

### Visual changes

- Light role fills for `brand` and `danger` move from stop 700 to 600, with hover at 700 and active at 800. `success` and `info` keep 700, 800 and 900 as light exceptions, like `warning`, which is unchanged.
- Light `text-inverted` is now `#fff` (was `#f1f1f1`).
- Form fields (`input`, `textarea`, `select`) focus with a 2 px outline at offset 0, so the edge turns the focus color. Buttons keep the offset ring.

### Added

- Autofilled fields (`:autofill`, `:-webkit-autofill`) keep the `bg-surface` background and the `text-regular` color.

## [2.3.0] - 2026-11-11

### Changed

- Border tokens `border-regular`, `border-strong`, `border-control` and `border-control-hover` are now semi-transparent black in light (`rgb(0 0 0 / 8%)`, `12%`, `45%`, `60%`) and semi-transparent white in dark (`rgb(255 255 255 / 4%)`, `12%`, `41%`, `60%`), so edges adapt to the surface under them. `border-control` keeps 3:1 contrast on the page, surface, raised and hover backgrounds in both themes.

### Fixed

- Dark theme `bg-hover` is now `#454545` (was `#3a3a3a`, the same as `bg-raised`), so hover shows on raised surfaces such as menus and popovers.
- Dark theme `text-muted` is now `#b2b2b2` (was `#a8a8a8`), so muted text keeps 4.5:1 contrast on `bg-hover`.
- Placeholders in the base field styles use `text-muted` (was `text-subtle`, 3.03:1 on `bg-surface`), so placeholder text reaches 4.5:1 in both themes.
- Light `text-warning` is now warning stop 900 (was 800, 4.42:1 on gray 100), so warning text reaches 4.5:1 on every light surface. The accepted contrast exception is removed.

## [2.2.3] - 2026-11-09

### Changed

- Faster load: `@wovenui/core/mixins` and the full entry load faster per compilation. Theme validation and the token maps do less work at load, and the theme declarations of each setting are computed once. Output is unchanged.

## [2.2.2] - 2026-10-27

### Added

- `apply()` reports an unknown mixin with its own message instead of Sass's raw error, and links to the docs search: `apply(font-weight(semibold)): unknown mixin font-weight. Docs: https://wovenui.com/search?q=font-weight`.
- A text item that passes arguments to a mixin that takes none raises `apply(transition(colors)): transition takes no arguments. Docs: https://wovenui.com/search?q=transition`. A no-argument mixin called with arguments through its function form with `as *` (`apply(flex(1))`) keeps Sass's own error, so valid code compiles as fast as before.

## [2.2.1] - 2026-10-23

### Fixed

- Breakpoint order: `$breakpoints` is sorted by width after configuration, so responsive classes (`.p-4@tablet`) and `apply()` breakpoint items are emitted from the smallest width up whatever the key order. Before, a key added after `2xl` (`"tablet": 900px`) came last in the CSS and overrode the larger breakpoints. When the widths are not all numbers in compatible units (`em` and `rem` mixed, `calc()`), the configured order is kept. The default breakpoints give the same CSS as before.
- `docs/llms-full.txt`: the utility class format now states that color classes have no breakpoint form, with or without a state prefix, and points to `apply()` (`text-color(white) hover md`); it adds the `hover:opacity-75@sm` example and documents the breakpoint order.

- Combining transition property classes and mixins: `class="transition-colors transition-transform"` and `apply(transition-colors, transition-transform)` transitioned only the last group, because each one set `transition-property` on its own. Each group (`colors`, `opacity`, `shadow`, `transform`) now sets its own internal variable, `--wu-transition-colors`, `--wu-transition-opacity`, `--wu-transition-shadow` or `--wu-transition-transform`, and every group class and mixin writes one combined `transition-property: var(--wu-transition-colors, --wu-none), ...` list, so any combination transitions every group it names. The variables are registered with `@property` (`syntax: "*"`, `inherits: false`) whenever the package loads, so a child does not take its parent's groups. A single group transitions the same properties as before; its computed `transition-property` now also lists `--wu-none`, a property name nothing animates, once for each unset group. `.transition` and `.transition-none` still come before the group classes, so a group class on the same element replaces them; in `apply()` the last of them decides.

## [2.2.0] - 2026-10-23

### Changed

- Doc comments in the source follow the SassDoc standard: `///` blocks on every public mixin, function and `!default` variable, and one `////` poster per file.

### Added

- `@wovenui/core/sassdoc.json` export: the SassDoc data of every documented mixin, function and variable, for editor tooling.

---

Earlier releases (2024 to 2026) were published under a previous name; their notes are in the repository history.
