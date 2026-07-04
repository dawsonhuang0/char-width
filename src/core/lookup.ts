// Port of unicode-width's src/gen/lookup.rs (per-code-point trie walk).
// Derived from https://github.com/unicode-rs/unicode-width
// (MIT OR Apache-2.0, used under the MIT option). See THIRD-PARTY-NOTICES.md.

import {
  WIDTH_ROOT,
  WIDTH_ROOT_CJK,
  WIDTH_MIDDLE,
  WIDTH_LEAVES,
  WIDTH_SPECIALS,
  WIDTH_SPECIALS_DEFAULT,
  WIDTH_SPECIALS_CJK,
  WIDTH_SPECIALS_CJK_DEFAULT,
} from "../gen/tables";
import { WI } from "../gen/widthInfoStates";

/**
 * (width, widthInfo) results are packed into one integer to avoid a tuple
 * allocation per code point: bits 0-3 hold width + 1 (width may be -1 in the
 * string state machine), the remaining bits hold the widthInfo state.
 */
export const pack = (width: number, info: number): number => (info << 4) | (width + 1);
export const packedWidth = (packed: number): number => (packed & 0xf) - 1;
export const packedInfo = (packed: number): number => packed >>> 4;

/**
 * UAX #11 based width of code point `cp` via the three-level trie:
 * root (cp >> 13) → middle 64-byte block → leaf of 2-bit packed widths.
 * Width 3 is a sentinel for special-cased code points.
 */
export function lookupWidth(cp: number, isCjk: boolean): number {
  const t1 = (isCjk ? WIDTH_ROOT_CJK : WIDTH_ROOT)[cp >> 13];
  const t2 = WIDTH_MIDDLE[(t1 << 6) | ((cp >> 7) & 0x3f)];
  const packedWidths = WIDTH_LEAVES[(t2 << 5) | ((cp >> 2) & 0x1f)];
  const width = (packedWidths >> ((cp & 0b11) << 1)) & 0b11;

  if (width < 3) return pack(width, WI.DEFAULT);

  const specials = isCjk ? WIDTH_SPECIALS_CJK : WIDTH_SPECIALS;
  for (let i = 0; i < specials.length; i++) {
    const [lo, hi, w, info] = specials[i];
    if (cp < lo) break;
    if (cp <= hi) return pack(w, info);
  }
  const [w, info] = isCjk ? WIDTH_SPECIALS_CJK_DEFAULT : WIDTH_SPECIALS_DEFAULT;
  return pack(w, info);
}
