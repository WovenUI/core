# Doc blocks

`@wovenui/core` documents its source with standard [SassDoc](http://sassdoc.com/) comments. The blocks serve two purposes: inline documentation in the source, and the input for generated documentation (the site reads the SassDoc data, so a new mixin documents itself on the next build). Only standard SassDoc annotations are used; there are no custom tags. `npm test` runs `test/docblocks.mjs`, which parses every file with SassDoc, validates every block and poster, and compiles every example. `npm run docs:sassdoc` prints the parsed SassDoc data as JSON to stdout.

## What gets a block

- **Public items** get a `///` block directly above them:
  - every mixin and function exported by `src/styles/index.scss` (what a consumer gets from `@use "@wovenui/core" as *`), plus `apply()` in `mixins-map.scss`. The `apply()` registry functions in `mixins-map.scss` are not documented; each one stands for the mixin of the same name.
  - every exported configuration variable declared with `!default`. An exported variable without `!default` may carry a block in the same format; it is not required.
- **Every file with public items** starts with one `////` poster.
- **Everything else uses `//`**: inline comments inside bodies, section dividers, comments above non-exported variables, and private (`-name`) and internal non-exported helpers, which get one short `//` line directly above (required for `-name` helpers).

## Item block

```scss
/// One sentence, plain English, accurate to the current behavior.
///
/// Further detail (optional), one line per paragraph, paragraphs separated by a bare `///` line.
/// @param {Number|Length} $size - Description
/// @param {String} $style [solid] - Description
/// @content Description of the @content block
/// @output One line describing the emitted CSS
/// @example scss
///   .card {
///     @include name(4); // padding: var(--wu-space-4)
///   }
/// @link https://developer.mozilla.org/en-US/docs/Web/CSS/padding padding on MDN
/// @see {mixin} other-name
/// @see {function} token
@mixin name($size, $style: solid) {
```

Functions need exactly one `@return`:

```scss
/// Returns the custom property reference for a token name.
/// @param {String} $name - Token name without the --wu- prefix
/// @return {String} - A var(--wu-*) reference
/// @example scss
///   .card {
///     color: token(text-muted);
///   }
@function token($name) {
```

Configuration variables need exactly one `@type`:

```scss
/// Spacing scale: key to length; keys are the numbers mixins and classes accept.
/// @type Map
$spacings: (
```

### Rules

- The block sits directly above the item line (`@mixin`, `@function` or `$name:` at the start of the line), with no blank line or other comment in between. A `///` block that is not followed directly by a public item fails the check.
- Every line is `///` followed by one space and text, or a bare `///`.
- **Description first.** The first line is the description: one sentence (the checker fails a first line with a sentence end followed by a capital letter, outside backticks; put the next sentence in its own paragraph). Further paragraphs (former `@note` text) follow after a bare `///`. Each paragraph is one line, a markdown list (consecutive lines starting with `- `), or a fenced code block (the checker accepts fenced code in item descriptions, as in posters). Never two bare lines in a row, never a bare line directly before a tag.
- **Tags after the description, in this order:** `@type`, `@param`, `@content`, `@return`, `@output`, `@example`, `@deprecated`, `@link`, `@see`. No other tag is allowed: not `@mixin`, `@function`, `@description`, `@note`, `@since`, `@group` (posters only), `@throw` (SassDoc reads it from `@error`), `@require`, `@prop`, `@access`, `@author`, `@todo`, or any custom tag.
- Every tag except `@example` is one line, with no continuation lines.
- **`@type`**: variables only, exactly one. `Map`, `List`, `Number`, `Length`, `Color`, `Boolean` or `String`, combined with `|`. No `@prop`: values live in `docs/TOKENS.md` and the source.
- **`@param`**: mixins and functions; one per parameter, in signature order, with the name exactly as in the signature. A rest parameter is written without the dots (`$args`). Syntax `{Type} $name - Description`, or `{Type} $name [default] - Description`; a parameter with a default in the signature must show that default exactly (whitespace collapsed): `[null]`, `[()]`, `[md]`. Types are capitalized and separated by `|`: `Number`, `String`, `Length`, `Color`, `Map`, `List`, `Boolean`, `Null`, `Any`, `Duration`, `Percentage`, `Calculation`.
- **`@content`**: mixins only; required exactly when the mixin body uses `@content` (`//` comments are ignored when testing the body).
- **`@return`**: functions only, exactly one: `{Type} - Description`. The description after the type has no `{` or `}`: SassDoc reads the type up to the last `}` on the line. The same holds for `@param` and `@type`.
- **`@output`**: mixins only, at most one line describing the emitted CSS.
- **`@example`**: required on every mixin and function (optional on variables). The line is exactly `/// @example scss`. Every code line is indented two spaces after `/// ` (`///   .a {`); SassDoc strips the indent. An unindented line that starts with `@` would be read as a new tag, so the indent is mandatory on every code line. A bare `///` is allowed between code lines. An item may have several examples.
- **Examples compile.** Each example must compile without warnings when prefixed with `@use "index" as *;`. Wrap declarations in a selector. A trailing `//` comment showing the output is welcome: `@include p(4); // padding: var(--wu-space-4)`. Examples may start with `@use "sass:map";` or `@use "sass:list";` and must declare every built-in module they call. Global built-ins such as `map-get` emit deprecation warnings and fail the check. Examples of deprecated items may raise their deprecation warning.
- **`@deprecated`**: ``Use `name` instead.``
- **`@link`**: mixins only, at most one, and only to the MDN page of the single CSS property the mixin writes, in the form `https://developer.mozilla.org/en-US/docs/Web/CSS/<property> <property> on MDN`. The mixin must write that property directly in its own body (an `@include` of a helper counts), not inside a nested selector, and no other property; a mixin that writes several properties, or writes on a nested selector, gets no link. The `animate-*` mixins keep their link: their `@keyframes` sit in a nested block and do not count. Never any other URL.
- **`@see`**: one per line, typed: `@see {mixin} name`, `@see {function} name` or `@see {variable} name` (without `$`). The target must be a public item of that type. An untyped `@see` defaults to function in SassDoc and fails for mixins.
- No em dash, arrow or rocket characters. No stale markers (`todo: doc`, `SKIP Documentation`, `todo: add to doc`, `Removal in v2`).

## File poster

Each file with public items starts with one poster: a run of `////` lines, the first lines of the file, followed by a blank line. It sets the group of every item in the file, and its text becomes the group description.

```scss
////
//// @group flex
//// Flexbox layout system for creating flexible page layouts.
////
//// Gap utilities are defined in _spacing.scss.
////
//// ```html
//// <div class="flex row between x-center">
////   <div class="fill-6">Left column</div>
//// </div>
//// ```
////
//// Direction:
////
//// - row: Sets flex-direction to row
//// - col: Sets flex-direction to column
////

@use "sass:list";
```

### Rules

- Exactly one poster per file, at the very top, with no blank lines inside. Every line is `////` followed by one space and text, or a bare `////`.
- The first line and the last line are a bare `////`. The second line is `//// @group <name>`. SassDoc takes the group description from the lines after `@group`; text before `@group` is lost, so the description always comes after it.
- `@group` is the only tag. Any other tag in a poster (`@example`, `@see`, `@author`) is applied by SassDoc to every item of the file, so it is not allowed. No poster line may start with `@`: indent code lines inside fenced blocks.
- The description is required. It holds what the former `Section`, `Module`, `Note`, `@component`, `@description`, `@classes`, `@responsive` and `@customization` lines said, as plain text: paragraphs of one line, markdown lists (`- `), and fenced code blocks for HTML examples (```` ```html ````). Paragraphs, lists and fences are separated by a bare `////`. `Section` and `Module` lines are dropped; the folder gives the section.
- A file without public items has no poster. Entry files (`index.scss`, `mixins/index.scss`, `build.scss`) get a poster with group `entry` only when they hold doc text; otherwise their comments are plain `//`.

### Group names

| Folder | Group |
| --- | --- |
| `utilities/`, `layouts/`, `tools/` | The file name without `_` and `.scss`: `flex`, `spacing`, `media-queries` |
| `config/` | `config` |
| `functions/` | `functions` |
| `themes/` | `themes` |
| `base/` | `base` |
| `components/` | The file name: `tooltips` |
| `mixins-map.scss` | `apply` |
| Entry files | `entry` |

## Writing accurate blocks

- Describe what the code emits. When a mixin writes a logical property (`padding-inline`, `margin-block-start`), say inline or block, not left and right.
- Mixin numbers are keys: `p(4)` emits `padding: var(--wu-space-4)`. A unitless number that is not a configured key raises an error; values with units, `calc()` and `var()` pass through.
- Check the code for `@error` versus `@warn` before writing "raises an error" or "warns".
- Color mixins and utility classes emit `var(--wu-...)` references; `get-color()` returns a real color value for Sass math.
- Use American English (color, behavior, centering).

## Checking

```bash
node test/docblocks.mjs                          # every file under src/styles
node test/docblocks.mjs utilities/_spacing.scss  # report only these files (relative to src/styles); all files are still parsed
node test/docblocks.mjs --no-compile             # format only, examples are not compiled
npm run -s docs:sassdoc > /tmp/sassdoc.json      # SassDoc data as JSON; warnings go to stderr (-s keeps npm's own output out of the file)
```

The checker parses every file with SassDoc (`sassdoc.Parser`, the same parser as `sassdoc src/styles`) and reports:

- every SassDoc warning (unknown annotation, more than one poster, an unresolved `@see`, an annotation on the wrong item type), with its file;
- a public item without a block, a block that uses `//`, a block SassDoc reads with an empty description, and a `///` block on a non-public item or not attached to any item (for example inside a rule body, or above a blank line);
- a brace in the text after the type of a `@param`, `@return` or `@type` line, a first description line with more than one sentence, an `@link` on a mixin that writes another property or writes on a nested selector,
- forbidden tags, tag order, continuation lines, paragraph layout, malformed `@param`, `@return`, `@type`, `@see`, `@link` and `@deprecated` lines, parameters or defaults that do not match the signature, a function without `@return`, a mixin whose `@content` tag does not match its body, a missing `@example`, unindented example code lines, and every example that fails to compile or warns;
- a missing, repeated, misplaced or malformed poster, a poster without the expected `@group`, a tag in a poster, and a poster in a file without public items;
- `///` or `////` comments indented inside a body, trailing `///` comments, more than four slashes, stale markers and banned characters.

It prints a per-file problem count and exits with code 1 when anything is reported.

The `apply()` poster and block live in the templates of the generator (`build.js` in the WovenUI tools repository), which generates `src/styles/mixins-map.scss`. Edit the templates and regenerate; never edit `mixins-map.scss` by hand.
