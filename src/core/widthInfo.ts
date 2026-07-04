// Port of unicode-width's src/width_info.rs (WidthInfo bit operations).
// Derived from https://github.com/unicode-rs/unicode-width
// (MIT OR Apache-2.0, used under the MIT option). See THIRD-PARTY-NOTICES.md.

import { WI } from "../gen/widthInfoStates";

/** States are u16 bit patterns; all ops mask to 16 bits. */
const U16 = 0xffff;

/** Guard bit consulted by the setter operations below. */
const LIGATURE_TRANSPARENT_MASK = 0b0010_0000_0000_0000;

const SET_EMOJI_PRESENTATION_BITS =
  WI.VARIATION_SELECTOR_16 & ~WI.VARIATION_SELECTOR_15 & ~WI.VARIATION_SELECTOR_1_2_OR_3 & U16;
const SET_TEXT_PRESENTATION_BITS =
  WI.VARIATION_SELECTOR_15 & ~WI.VARIATION_SELECTOR_16 & ~WI.VARIATION_SELECTOR_1_2_OR_3 & U16;
const SET_VS_1_2_3_BITS =
  WI.VARIATION_SELECTOR_1_2_OR_3 & ~WI.VARIATION_SELECTOR_15 & ~WI.VARIATION_SELECTOR_16 & U16;

/** Whether this width mode is ligature_transparent (5th MSB set). */
export function isLigatureTransparentInfo(info: number): boolean {
  return (info & 0b0000_1000_0000_0000) === 0b0000_1000_0000_0000;
}

/** Sets 6th MSB. */
export function setZwjBit(info: number): number {
  return info | 0b0000_0100_0000_0000;
}

/** Has top bit set. */
export function isEmojiPresentation(info: number): boolean {
  return (info & WI.VARIATION_SELECTOR_16) === WI.VARIATION_SELECTOR_16;
}

export function isZwjEmojiPresentation(info: number): boolean {
  return (info & 0b1011_0000_0000_0000) === 0b1001_0000_0000_0000;
}

/** Set top bit. */
export function setEmojiPresentation(info: number): number {
  if (
    (info & LIGATURE_TRANSPARENT_MASK) === LIGATURE_TRANSPARENT_MASK ||
    (info & 0b1001_0000_0000_0000) === 0b0001_0000_0000_0000
  ) {
    return info | SET_EMOJI_PRESENTATION_BITS;
  }
  return WI.VARIATION_SELECTOR_16;
}

/** Clear top bit. */
export function unsetEmojiPresentation(info: number): number {
  if ((info & LIGATURE_TRANSPARENT_MASK) === LIGATURE_TRANSPARENT_MASK) {
    return info & ~WI.VARIATION_SELECTOR_16 & U16;
  }
  return WI.DEFAULT;
}

/** Has 2nd bit set. */
export function isTextPresentation(info: number): boolean {
  return (info & WI.VARIATION_SELECTOR_15) === WI.VARIATION_SELECTOR_15;
}

/** Set 2nd bit. */
export function setTextPresentation(info: number): number {
  if ((info & LIGATURE_TRANSPARENT_MASK) === LIGATURE_TRANSPARENT_MASK) {
    return info | SET_TEXT_PRESENTATION_BITS;
  }
  return WI.VARIATION_SELECTOR_15;
}

/** Clear 2nd bit. */
export function unsetTextPresentation(info: number): number {
  return info & ~WI.VARIATION_SELECTOR_15 & U16;
}

/** Has 7th bit set. */
export function isVs123(info: number): boolean {
  return (info & WI.VARIATION_SELECTOR_1_2_OR_3) === WI.VARIATION_SELECTOR_1_2_OR_3;
}

/** Set 7th bit. */
export function setVs123(info: number): number {
  if ((info & LIGATURE_TRANSPARENT_MASK) === LIGATURE_TRANSPARENT_MASK) {
    return info | SET_VS_1_2_3_BITS;
  }
  return WI.VARIATION_SELECTOR_1_2_OR_3;
}

/** Clear 7th bit. */
export function unsetVs123(info: number): number {
  return info & ~WI.VARIATION_SELECTOR_1_2_OR_3 & U16;
}
