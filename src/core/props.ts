// Port of unicode-width's src/props.rs and src/gen/props.rs (character properties).
// Derived from https://github.com/unicode-rs/unicode-width
// (MIT OR Apache-2.0, used under the MIT option). See THIRD-PARTY-NOTICES.md.

import {
  NON_TRANSPARENT_ZERO_WIDTHS,
  SOLIDUS_TRANSPARENT,
  EMOJI_PRESENTATION_LEAVES,
  EMOJI_PRESENTATION_TOP_BITS,
  TEXT_PRESENTATION_TOP_BITS,
  TEXT_PRESENTATION_LEAVES,
  EMOJI_MODIFIER_TOP_BITS,
  EMOJI_MODIFIER_LEAVES,
  JOINING_GROUP_LAM,
  LIGATURE_TRANSPARENT,
} from "../gen/tables";
import { lookupWidth, packedWidth } from "./lookup";

/** Binary search sorted [lo, hi, lo, hi, ...] pairs for `cp`. */
function inRangePairs(cp: number, pairs: Uint32Array): boolean {
  let lo = 0;
  let hi = (pairs.length >> 1) - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < pairs[mid << 1]) hi = mid - 1;
    else if (cp > pairs[(mid << 1) + 1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Linear scan of a small sorted [lo, hi][] range list. */
function inRanges(cp: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  for (let i = 0; i < ranges.length; i++) {
    if (cp < ranges[i][0]) return false;
    if (cp <= ranges[i][1]) return true;
  }
  return false;
}

/** Whether this character has Joining_Group=Lam. */
export function isJoiningGroupLam(cp: number): boolean {
  return inRanges(cp, JOINING_GROUP_LAM);
}

/**
 * Whether this character is a default-ignorable combining mark or ZWJ.
 * These characters won't interrupt non-Arabic ligatures.
 */
export function isLigatureTransparent(cp: number): boolean {
  return inRanges(cp, LIGATURE_TRANSPARENT);
}

/**
 * Whether this character is a zero-width character with
 * Joining_Type=Transparent. Used by the Alef-Lamed ligatures.
 */
export function isTransparentZeroWidth(cp: number): boolean {
  if (packedWidth(lookupWidth(cp, false)) !== 0) return false;
  return !inRangePairs(cp, NON_TRANSPARENT_ZERO_WIDTHS);
}

/**
 * Whether this character is transparent wrt the effect of
 * U+0338 COMBINING LONG SOLIDUS OVERLAY on its base character.
 */
export function isSolidusTransparent(cp: number): boolean {
  return isLigatureTransparent(cp) || inRangePairs(cp, SOLIDUS_TRANSPARENT);
}

/**
 * Whether this character forms an emoji presentation sequence
 * (width 2) when followed by U+FE0F.
 */
export function startsEmojiPresentationSeq(cp: number): boolean {
  const topBits = cp >> 10;
  let leaf = -1;
  for (let i = 0; i < EMOJI_PRESENTATION_TOP_BITS.length; i++) {
    if (EMOJI_PRESENTATION_TOP_BITS[i][0] === topBits) {
      leaf = EMOJI_PRESENTATION_TOP_BITS[i][1];
      break;
    }
  }
  if (leaf < 0) return false;
  const leafByte = EMOJI_PRESENTATION_LEAVES[(leaf << 7) | ((cp >> 3) & 0x7f)];
  return ((leafByte >> (cp & 7)) & 1) === 1;
}

/** Binary search a sorted (lo, hi) byte-range leaf for the low byte of `cp`. */
function inByteRangeLeaf(cp: number, topBitsMap: ReadonlyArray<readonly [number, number]>, leaves: ReadonlyArray<Uint8Array>): boolean {
  const topBits = cp >> 8;
  let leaf: Uint8Array | undefined;
  for (let i = 0; i < topBitsMap.length; i++) {
    if (topBitsMap[i][0] === topBits) {
      leaf = leaves[topBitsMap[i][1]];
      break;
    }
  }
  if (!leaf) return false;
  const bottomBits = cp & 0xff;
  let lo = 0;
  let hi = (leaf.length >> 1) - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bottomBits < leaf[mid << 1]) hi = mid - 1;
    else if (bottomBits > leaf[(mid << 1) + 1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Whether `cp` has default emoji presentation but forms a text presentation
 * sequence (width 1) when followed by U+FE0E, and is not ideographic.
 */
export function startsNonIdeographicTextPresentationSeq(cp: number): boolean {
  return inByteRangeLeaf(cp, TEXT_PRESENTATION_TOP_BITS, TEXT_PRESENTATION_LEAVES);
}

/** Whether `cp` is an Emoji_Modifier_Base. */
export function isEmojiModifierBase(cp: number): boolean {
  return inByteRangeLeaf(cp, EMOJI_MODIFIER_TOP_BITS, EMOJI_MODIFIER_LEAVES);
}
