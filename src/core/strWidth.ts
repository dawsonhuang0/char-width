// Port of unicode-width's src/lookup.rs `width_in_generic` state machine and
// `str_width` reverse fold.
// Derived from https://github.com/unicode-rs/unicode-width
// (MIT OR Apache-2.0, used under the MIT option). See THIRD-PARTY-NOTICES.md.
//
// The width of a character can depend on what FOLLOWS it (e.g. a variation
// selector or a ZWJ sequence), so strings are scanned back-to-front, threading
// a `widthInfo` state describing the suffix already seen. Rust match arms are
// ported as an if-chain in identical order — order is significant.

import { WI } from "../gen/widthInfoStates";
import { lookupWidth, pack, packedInfo, packedWidth } from "./lookup";
import {
  isLigatureTransparentInfo,
  setZwjBit,
  isEmojiPresentation,
  isZwjEmojiPresentation,
  setEmojiPresentation,
  unsetEmojiPresentation,
  isTextPresentation,
  setTextPresentation,
  unsetTextPresentation,
  isVs123,
  setVs123,
  unsetVs123,
} from "./widthInfo";
import {
  isJoiningGroupLam,
  isLigatureTransparent,
  isTransparentZeroWidth,
  isSolidusTransparent,
  startsEmojiPresentationSeq,
  startsNonIdeographicTextPresentationSeq,
  isEmojiModifierBase,
} from "./props";

/**
 * Width contribution of `cp` given the state of the string suffix after it.
 * Returns pack(delta, nextState); delta is in -1..=3.
 */
export function widthInStr(cp: number, nextInfo: number, isCjk: boolean): number {
  if (isEmojiPresentation(nextInfo)) {
    if (startsEmojiPresentationSeq(cp)) {
      const width = isZwjEmojiPresentation(nextInfo) ? 0 : 2;
      return pack(width, WI.EMOJI_PRESENTATION);
    }
    nextInfo = unsetEmojiPresentation(nextInfo);
  }

  if (
    isCjk &&
    (nextInfo === WI.COMBINING_LONG_SOLIDUS_OVERLAY || nextInfo === WI.SOLIDUS_OVERLAY_ALEF) &&
    (cp === 0x3c || cp === 0x3d || cp === 0x3e) // '<' | '=' | '>'
  ) {
    return pack(2, WI.DEFAULT);
  }

  if (cp <= 0xa0) {
    if (cp === 0x0a) return pack(1, WI.LINE_FEED);
    if (cp === 0x0d && nextInfo === WI.LINE_FEED) return pack(0, WI.DEFAULT);
    return pack(1, WI.DEFAULT);
  }

  // Not part of the Rust crate: a Rust `char` can never be a lone surrogate,
  // but a JS string can contain one. We define its width as 1.
  if (cp >= 0xd800 && cp <= 0xdfff) {
    return pack(1, WI.DEFAULT);
  }

  // Fast path
  if (nextInfo !== WI.DEFAULT) {
    if (cp === 0xfe0f) return pack(0, setEmojiPresentation(nextInfo));

    if (isCjk) {
      if (cp === 0xfe00 || cp === 0xfe02) return pack(0, setVs123(nextInfo));
    } else {
      if (cp === 0xfe01) return pack(0, setVs123(nextInfo));
      if (cp === 0xfe0e) return pack(0, setTextPresentation(nextInfo));
      if (isTextPresentation(nextInfo)) {
        if (startsNonIdeographicTextPresentationSeq(cp)) return pack(1, WI.DEFAULT);
        nextInfo = unsetTextPresentation(nextInfo);
      }
    }

    if (isVs123(nextInfo)) {
      // '\u{2018}' | '\u{2019}' | '\u{201C}' | '\u{201D}'
      if (cp === 0x2018 || cp === 0x2019 || cp === 0x201c || cp === 0x201d) {
        return pack(isCjk ? 1 : 2, WI.DEFAULT);
      }
      nextInfo = unsetVs123(nextInfo);
    }

    if (isLigatureTransparentInfo(nextInfo)) {
      if (cp === 0x200d) return pack(0, setZwjBit(nextInfo));
      if (isLigatureTransparent(cp)) return pack(0, nextInfo);
    }

    // The big `match (next_info, c)` — same arm order as the Rust source.
    if (isCjk && nextInfo === WI.COMBINING_LONG_SOLIDUS_OVERLAY && isSolidusTransparent(cp)) {
      return pack(packedWidth(lookupWidth(cp, isCjk)), WI.COMBINING_LONG_SOLIDUS_OVERLAY);
    }
    if (isCjk && nextInfo === WI.JOINING_GROUP_ALEF && cp === 0x338) {
      return pack(0, WI.SOLIDUS_OVERLAY_ALEF);
    }

    // Arabic Lam-Alef ligature
    if (nextInfo === WI.JOINING_GROUP_ALEF && isJoiningGroupLam(cp)) {
      return pack(0, WI.DEFAULT);
    }
    if (isCjk && nextInfo === WI.SOLIDUS_OVERLAY_ALEF && isJoiningGroupLam(cp)) {
      return pack(0, WI.DEFAULT);
    }
    if (nextInfo === WI.JOINING_GROUP_ALEF && isTransparentZeroWidth(cp)) {
      return pack(0, WI.JOINING_GROUP_ALEF);
    }

    // Hebrew Alef-ZWJ-Lamed ligature
    if (nextInfo === WI.ZWJ_HEBREW_LETTER_LAMED && cp === 0x05d0) {
      return pack(0, WI.DEFAULT);
    }

    // Khmer coeng signs
    if (nextInfo === WI.KHMER_COENG_ELIGIBLE_LETTER && cp === 0x17d2) {
      return pack(-1, WI.DEFAULT);
    }

    // Buginese <a, -i> ZWJ ya ligature
    if (nextInfo === WI.ZWJ_BUGINESE_LETTER_YA && cp === 0x1a17) {
      return pack(0, WI.BUGINESE_VOWEL_SIGN_I_ZWJ_LETTER_YA);
    }
    if (nextInfo === WI.BUGINESE_VOWEL_SIGN_I_ZWJ_LETTER_YA && cp === 0x1a15) {
      return pack(0, WI.DEFAULT);
    }

    // Tifinagh bi-consonants
    if (
      (nextInfo === WI.TIFINAGH_CONSONANT || nextInfo === WI.ZWJ_TIFINAGH_CONSONANT) &&
      cp === 0x2d7f
    ) {
      return pack(1, WI.TIFINAGH_JOINER_CONSONANT);
    }
    if (
      nextInfo === WI.ZWJ_TIFINAGH_CONSONANT &&
      ((cp >= 0x2d31 && cp <= 0x2d65) || cp === 0x2d6f)
    ) {
      return pack(0, WI.DEFAULT);
    }
    if (
      nextInfo === WI.TIFINAGH_JOINER_CONSONANT &&
      ((cp >= 0x2d31 && cp <= 0x2d65) || cp === 0x2d6f)
    ) {
      return pack(-1, WI.DEFAULT);
    }

    // Lisu tone letter combinations
    if (nextInfo === WI.LISU_TONE_LETTER_MYA_NA_JEU && cp >= 0xa4f8 && cp <= 0xa4fb) {
      return pack(0, WI.DEFAULT);
    }

    // Old Turkic ligature
    if (nextInfo === WI.ZWJ_OLD_TURKIC_LETTER_ORKHON_I && cp === 0x10c32) {
      return pack(0, WI.DEFAULT);
    }

    // Emoji modifier
    if (nextInfo === WI.EMOJI_MODIFIER && isEmojiModifierBase(cp)) {
      return pack(0, WI.EMOJI_PRESENTATION);
    }

    // Regional indicator
    if (
      (nextInfo === WI.REGIONAL_INDICATOR || nextInfo === WI.SEVERAL_REGIONAL_INDICATOR) &&
      cp >= 0x1f1e6 &&
      cp <= 0x1f1ff
    ) {
      return pack(1, WI.SEVERAL_REGIONAL_INDICATOR);
    }

    // ZWJ emoji
    if (
      (nextInfo === WI.EMOJI_PRESENTATION ||
        nextInfo === WI.SEVERAL_REGIONAL_INDICATOR ||
        nextInfo === WI.EVEN_REGIONAL_INDICATOR_ZWJ_PRESENTATION ||
        nextInfo === WI.ODD_REGIONAL_INDICATOR_ZWJ_PRESENTATION ||
        nextInfo === WI.EMOJI_MODIFIER) &&
      cp === 0x200d
    ) {
      return pack(0, WI.ZWJ_EMOJI_PRESENTATION);
    }
    if (nextInfo === WI.ZWJ_EMOJI_PRESENTATION && cp === 0x20e3) {
      return pack(0, WI.KEYCAP_ZWJ_EMOJI_PRESENTATION);
    }
    if (nextInfo === WI.VS16_ZWJ_EMOJI_PRESENTATION && startsEmojiPresentationSeq(cp)) {
      return pack(0, WI.EMOJI_PRESENTATION);
    }
    if (
      nextInfo === WI.VS16_KEYCAP_ZWJ_EMOJI_PRESENTATION &&
      ((cp >= 0x30 && cp <= 0x39) || cp === 0x23 || cp === 0x2a) // '0'..='9' | '#' | '*'
    ) {
      return pack(0, WI.EMOJI_PRESENTATION);
    }
    if (nextInfo === WI.ZWJ_EMOJI_PRESENTATION && cp >= 0x1f1e6 && cp <= 0x1f1ff) {
      return pack(1, WI.REGIONAL_INDICATOR_ZWJ_PRESENTATION);
    }
    if (
      (nextInfo === WI.REGIONAL_INDICATOR_ZWJ_PRESENTATION ||
        nextInfo === WI.ODD_REGIONAL_INDICATOR_ZWJ_PRESENTATION) &&
      cp >= 0x1f1e6 &&
      cp <= 0x1f1ff
    ) {
      return pack(-1, WI.EVEN_REGIONAL_INDICATOR_ZWJ_PRESENTATION);
    }
    if (
      nextInfo === WI.EVEN_REGIONAL_INDICATOR_ZWJ_PRESENTATION &&
      cp >= 0x1f1e6 &&
      cp <= 0x1f1ff
    ) {
      return pack(3, WI.ODD_REGIONAL_INDICATOR_ZWJ_PRESENTATION);
    }
    if (nextInfo === WI.ZWJ_EMOJI_PRESENTATION && cp >= 0x1f3fb && cp <= 0x1f3ff) {
      return pack(0, WI.EMOJI_MODIFIER);
    }
    if (nextInfo === WI.ZWJ_EMOJI_PRESENTATION && cp === 0xe007f) {
      return pack(0, WI.TAG_END_ZWJ_EMOJI_PRESENTATION);
    }
    if (nextInfo === WI.TAG_END_ZWJ_EMOJI_PRESENTATION && cp >= 0xe0061 && cp <= 0xe007a) {
      return pack(0, WI.TAG_A1_END_ZWJ_EMOJI_PRESENTATION);
    }
    if (nextInfo === WI.TAG_A1_END_ZWJ_EMOJI_PRESENTATION && cp >= 0xe0061 && cp <= 0xe007a) {
      return pack(0, WI.TAG_A2_END_ZWJ_EMOJI_PRESENTATION);
    }
    if (nextInfo === WI.TAG_A2_END_ZWJ_EMOJI_PRESENTATION && cp >= 0xe0061 && cp <= 0xe007a) {
      return pack(0, WI.TAG_A3_END_ZWJ_EMOJI_PRESENTATION);
    }
    if (nextInfo === WI.TAG_A3_END_ZWJ_EMOJI_PRESENTATION && cp >= 0xe0061 && cp <= 0xe007a) {
      return pack(0, WI.TAG_A4_END_ZWJ_EMOJI_PRESENTATION);
    }
    if (nextInfo === WI.TAG_A4_END_ZWJ_EMOJI_PRESENTATION && cp >= 0xe0061 && cp <= 0xe007a) {
      return pack(0, WI.TAG_A5_END_ZWJ_EMOJI_PRESENTATION);
    }
    if (nextInfo === WI.TAG_A5_END_ZWJ_EMOJI_PRESENTATION && cp >= 0xe0061 && cp <= 0xe007a) {
      return pack(0, WI.TAG_A6_END_ZWJ_EMOJI_PRESENTATION);
    }
    if (
      (nextInfo === WI.TAG_END_ZWJ_EMOJI_PRESENTATION ||
        nextInfo === WI.TAG_A1_END_ZWJ_EMOJI_PRESENTATION ||
        nextInfo === WI.TAG_A2_END_ZWJ_EMOJI_PRESENTATION ||
        nextInfo === WI.TAG_A3_END_ZWJ_EMOJI_PRESENTATION ||
        nextInfo === WI.TAG_A4_END_ZWJ_EMOJI_PRESENTATION) &&
      cp >= 0xe0030 &&
      cp <= 0xe0039
    ) {
      return pack(0, WI.TAG_D1_END_ZWJ_EMOJI_PRESENTATION);
    }
    if (nextInfo === WI.TAG_D1_END_ZWJ_EMOJI_PRESENTATION && cp >= 0xe0030 && cp <= 0xe0039) {
      return pack(0, WI.TAG_D2_END_ZWJ_EMOJI_PRESENTATION);
    }
    if (nextInfo === WI.TAG_D2_END_ZWJ_EMOJI_PRESENTATION && cp >= 0xe0030 && cp <= 0xe0039) {
      return pack(0, WI.TAG_D3_END_ZWJ_EMOJI_PRESENTATION);
    }
    if (
      (nextInfo === WI.TAG_A3_END_ZWJ_EMOJI_PRESENTATION ||
        nextInfo === WI.TAG_A4_END_ZWJ_EMOJI_PRESENTATION ||
        nextInfo === WI.TAG_A5_END_ZWJ_EMOJI_PRESENTATION ||
        nextInfo === WI.TAG_A6_END_ZWJ_EMOJI_PRESENTATION ||
        nextInfo === WI.TAG_D3_END_ZWJ_EMOJI_PRESENTATION) &&
      cp === 0x1f3f4
    ) {
      return pack(0, WI.EMOJI_PRESENTATION);
    }
    if (
      nextInfo === WI.ZWJ_EMOJI_PRESENTATION &&
      packedInfo(lookupWidth(cp, isCjk)) === WI.EMOJI_PRESENTATION
    ) {
      return pack(0, WI.EMOJI_PRESENTATION);
    }

    if (nextInfo === WI.KIRAT_RAI_VOWEL_SIGN_E && cp === 0x16d63) {
      return pack(0, WI.DEFAULT);
    }
    if (nextInfo === WI.KIRAT_RAI_VOWEL_SIGN_E && cp === 0x16d67) {
      return pack(0, WI.KIRAT_RAI_VOWEL_SIGN_AI);
    }
    if (nextInfo === WI.KIRAT_RAI_VOWEL_SIGN_E && cp === 0x16d68) {
      return pack(1, WI.KIRAT_RAI_VOWEL_SIGN_E);
    }
    if (nextInfo === WI.KIRAT_RAI_VOWEL_SIGN_E && cp === 0x16d69) {
      return pack(0, WI.DEFAULT);
    }
    if (nextInfo === WI.KIRAT_RAI_VOWEL_SIGN_AI && cp === 0x16d63) {
      return pack(0, WI.DEFAULT);
    }

    // Fallback
  }

  return lookupWidth(cp, isCjk);
}

/**
 * Display width of a string: single reverse pass, O(1) work per code point.
 * UTF-16 surrogate pairs are stitched manually to avoid allocating a
 * code-point array. `initInfo` seeds the state machine and is only meant for
 * conformance tests; real strings start from WI.DEFAULT.
 */
export function strWidth(str: string, isCjk: boolean, initInfo: number = WI.DEFAULT): number {
  let sum = 0;
  let info: number = initInfo;
  for (let i = str.length - 1; i >= 0; i--) {
    let cp = str.charCodeAt(i);
    if (cp >= 0xdc00 && cp <= 0xdfff && i > 0) {
      const high = str.charCodeAt(i - 1);
      if (high >= 0xd800 && high <= 0xdbff) {
        cp = 0x10000 + ((high - 0xd800) << 10) + (cp - 0xdc00);
        i--;
      }
    }
    const r = widthInStr(cp, info, isCjk);
    sum += packedWidth(r);
    info = packedInfo(r);
  }
  return sum;
}
