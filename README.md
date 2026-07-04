# char-width

A TypeScript/JavaScript port of Rust's [`unicode-width`](https://github.com/unicode-rs/unicode-width):
sequence-aware Unicode display width for terminals, with *O(1)* work per code point.

- 🎯 Bit-for-bit identical results with the Rust crate, verified against it for
  every Unicode code point and thousands of sequences
- 🧬 Sequence-aware: emoji ZWJ sequences, presentation/modifier sequences,
  flags, keycaps, `"\r\n"`, and script-specific ligatures measure as units
- 🌏 Unicode 17.0, with a `cjk` mode for East Asian (ambiguous-wide) contexts
- ⚡️ Single reverse pass, no allocations, ~30 KB of packed tables

Looking for POSIX/glibc `wcwidth(3)` semantics instead? Use
[`wcwidth-o1`](https://www.npmjs.com/package/wcwidth-o1).

## Getting Started

```bash
npm i char-width
```

## Usage

```ts
import { charWidth, strWidth } from 'char-width';

charWidth('a');        // 1
charWidth('好');       // 2
charWidth('\x1b');     // undefined (control character)

strWidth('hello');  // 5
strWidth('❤️');      // 2 (emoji presentation sequence)
strWidth('👩‍👩‍👧‍👦');    // 2 (ZWJ sequence)
strWidth('🇨🇦');     // 2 (flag)
```

### `charWidth(char, options?)`

Display width of the **first code point** of `char`:
`0`, `1`, `2`, or `3` columns, or `undefined` if it is a control character
(C0, DEL, C1) or the string is empty.

### `strWidth(str, options?)`

Display width of a string in terminal columns. Never negative; control
characters count as width 1 and `"\r\n"` counts as 1.

### Options

Both functions accept `{ cjk: true }` to treat East Asian Ambiguous
characters as 2 columns wide, per the [UAX #11] recommendation for CJK
contexts:

```ts
charWidth('§');               // 1
charWidth('§', { cjk: true }); // 2
```

[UAX #11]: https://www.unicode.org/reports/tr11/

## Behavior

The width rules are exactly those of the `unicode-width` crate — see its
[documented rules](https://docs.rs/unicode-width/latest/unicode_width/#rules-for-determining-width).
Highlights:

- A character's width can depend on what **follows** it (variation selectors,
  ZWJ), so `strWidth` scans the string once, back to front, threading a
  small state machine — O(1) work per code point.
- Canonically equivalent strings get the same width.
- Widths are best-effort predictions of terminal behavior; no library can
  match every terminal for every sequence.

One deliberate divergence, since Rust strings cannot represent it: a **lone
surrogate** (possible in a JS string) has width 1.

## Updating to a new Unicode version

```bash
git clone https://github.com/unicode-rs/unicode-width  # reference crate
(cd unicode-width && python3 scripts/unicode.py)       # regenerate Rust tables from the UCD
npm run gen                                            # convert them to src/gen/*.ts
npm run gen:truth                                      # re-dump ground truth (needs cargo)
npm test                                               # 1.1M-code-point conformance check
```

## Acknowledgments

- Width algorithm, state machine, and tables derived from
  [`unicode-width`](https://github.com/unicode-rs/unicode-width) by the Rust
  Project Developers and the unicode-rs maintainers (MIT OR Apache-2.0, used
  under the MIT option).
- Character data from the [Unicode Character Database](https://www.unicode.org/ucd/)
  (Unicode License v3).

See [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

## License

Distributed under the MIT License.
See [`LICENSE`](LICENSE) for more information.
