# char-width

[![npm](https://img.shields.io/npm/v/char-width.svg)](https://www.npmjs.com/package/char-width)

A TypeScript/JavaScript port of Rust's [`unicode-width`](https://github.com/unicode-rs/unicode-width):
sequence-aware Unicode display width for terminals, with *O(1)* work per code point.

### Attention to Accuracy
- 🎯 Verified against every output of Rust's `unicode-width` crate
- 🧬 Sequence-aware: flags, keycaps, emoji ZWJ and presentation/modifier sequences, etc.
- 🌏 Unicode 17.0, with a `cjk` mode for East Asian (ambiguous-wide) contexts


## Getting Started

Install char-width via npm:

```bash
npm i char-width
```


## Usage

```ts
import { charWidth, strWidth } from 'char-width';

charWidth('a'); // 1
charWidth('好'); // 2
charWidth('\x1b'); // undefined (control character)

strWidth('hello'); // 5
strWidth('❤️'); // 2 (emoji presentation sequence)
strWidth('👩‍👩‍👧‍👦'); // 2 (ZWJ sequence)
strWidth('🇦🇺'); // 2 (flag)
```

### Function Parameters:

**charWidth()**:
- `char`: The string whose first code point is measured.
- `cjk`: Optional; treats East Asian Ambiguous characters as wide.

**strWidth()**:
- `str`: The string to measure.
- `cjk`: Optional; treats East Asian Ambiguous characters as wide.

### Scope of Output

**charWidth()**:
- `0`, `1`, `2`, or `3`: width of the **first code point** of `char`.
- `undefined`: when it's a control character (C0, DEL, C1) or the string is empty.

**strWidth()**:
- non-negative width of `str`: control characters and `"\r\n"` each count as width 1.


## Documentation

The behavior exactly follows that of the `unicode-width` crate — see its
[documentation](https://docs.rs/unicode-width/latest/unicode_width/#rules-for-determining-width).

### TL;DR:

- A character's width can depend on what **follows** it (VS16, ZWJ), so `strWidth` scans once, back to front — O(1) work per code point.
- Canonically equivalent strings get the same width.
- Widths predict terminal behavior; no library matches every terminal.

### ⚠️ One deliberate divergence

A **lone surrogate** — possible in a JS string, impossible in a Rust
one — has width 1.


## Updating to a new Unicode version

```bash
git clone https://github.com/unicode-rs/unicode-width # reference crate
(cd unicode-width && python3 scripts/unicode.py)      # regenerate Rust tables from the UCD
npm run gen                                           # convert them to src/gen/*.ts
npm run gen:truth                                     # re-dump ground truth (needs cargo)
npm test                                              # 1.1M-code-point conformance check
```

## Feedback

Found something odd?  
Feel free to [open an issue](https://github.com/dawsonhuang0/char-width/issues).


## Acknowledgments

- Width algorithm, state machine, and tables derived from [`unicode-width`](https://github.com/unicode-rs/unicode-width) by the Rust Project Developers and the unicode-rs maintainers (MIT OR Apache-2.0, used under the MIT option).
- Character data from the [Unicode Character Database](https://www.unicode.org/ucd/) (Unicode License v3).

See [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) for more.


## License

Distributed under the MIT License.
See [`LICENSE`](LICENSE) for more information.


### Looking for a POSIX-compliant port?

Try [`wcwidth-o1`](https://www.npmjs.com/package/wcwidth-o1).
