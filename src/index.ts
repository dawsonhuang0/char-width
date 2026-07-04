import { lookupWidth, packedWidth } from "./core/lookup";
import { strWidth as strWidthImpl } from "./core/strWidth";
import { UNICODE_VERSION } from "./gen/tables";

export { UNICODE_VERSION };

/**
 * Display width of a single Unicode code point.
 *
 * - Only the first code point of `char` is considered.
 * - Returns `undefined` for control characters (C0, DEL, C1) and for an
 *   empty string.
 * - A lone surrogate (invalid in well-formed UTF-16, but representable in a
 *   JS string) has width 1. This case cannot occur in the Rust crate this
 *   package is derived from; the rule is specific to this package.
 *
 * @param char String whose first code point is measured.
 * @param cjk Treat East Asian Ambiguous characters as wide (2 columns), per
 *   the UAX #11 recommendation for CJK contexts. Defaults to false (narrow).
 * @returns 0, 1, 2, or 3 columns, or `undefined` if not printable.
 */
export function charWidth(char: string, cjk?: boolean): number | undefined {
  const cp = char.codePointAt(0);
  if (cp === undefined) return undefined;

  if (cp < 0x7f) {
    // U+0020 to U+007F (exclusive) are single-width ASCII codepoints;
    // below U+0020 are control codes.
    return cp >= 0x20 ? 1 : undefined;
  }
  // U+007F to U+00A0 (exclusive) are control codes.
  if (cp < 0xa0) return undefined;
  // Lone surrogate: see doc comment.
  if (cp >= 0xd800 && cp <= 0xdfff) return 1;

  return packedWidth(lookupWidth(cp, cjk === true));
}

/**
 * Display width of a string in terminal columns.
 *
 * Sequence-aware: emoji ZWJ sequences, emoji presentation/modifier sequences,
 * `"\r\n"`, and several script-specific ligatures are measured as units, so
 * the result can be less than the sum of per-code-point widths. Never returns
 * a negative value; control characters count as width 1.
 *
 * @param str Input string to measure.
 * @param cjk Treat East Asian Ambiguous characters as wide (2 columns), per
 *   the UAX #11 recommendation for CJK contexts. Defaults to false (narrow).
 * @returns Total display width in columns.
 */
export function strWidth(str: string, cjk?: boolean): number {
  if (!str) return 0;
  return strWidthImpl(str, cjk === true);
}

export default charWidth;

module.exports = charWidth;
module.exports.default = charWidth;

module.exports.charWidth = charWidth;
module.exports.strWidth = strWidth;
module.exports.UNICODE_VERSION = UNICODE_VERSION;
