// Converts unicode-width's generated Rust tables into TypeScript modules.
//
// Pipeline for a Unicode update:
//   1. (in ./unicode-width)  python3 scripts/unicode.py   — regenerates src/gen/*.rs
//   2. (here)                npm run gen                  — regenerates src/gen/*.ts
//
// Derived from https://github.com/unicode-rs/unicode-width
// (MIT OR Apache-2.0, used under the MIT option). See THIRD-PARTY-NOTICES.md.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const genDir = join(root, "unicode-width", "src", "gen");
const outDir = join(root, "src", "gen");

const tablesRs = readFileSync(join(genDir, "tables.rs"), "utf8");
const propsRs = readFileSync(join(genDir, "props.rs"), "utf8");
const lookupRs = readFileSync(join(genDir, "lookup.rs"), "utf8");
const widthInfoRs = readFileSync(join(genDir, "width_info.rs"), "utf8");

// ---------- generic Rust parsing helpers ----------

/** Strip // comments (safe here: generated files hold no string literals with slashes). */
const stripComments = (s) => s.replace(/\/\/[^\n]*/g, "");

/** Extract the literal (balanced) that initializes `static NAME: ... = <literal>;`. */
function staticLiteral(src, name) {
  const re = new RegExp(`static ${name}[^=]*=`);
  const m = re.exec(src);
  if (!m) throw new Error(`static ${name} not found`);
  let i = m.index + m[0].length;
  while (src[i] !== "[" && src[i] !== "(" && !/\w/.test(src[i])) i++;
  const start = i;
  // literal may be wrapped: Align128([ ... ]) — scan to the matching `;`
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    else if (ch === ";" && depth === 0) break;
  }
  return src.slice(start, i);
}

/** All integer tokens of a Rust literal, in order. */
function numbers(literal) {
  const out = [];
  const body = stripComments(literal).replace(/^\s*[A-Za-z_]\w*\s*\(/, "");
  for (const m of body.matchAll(/0x[0-9A-Fa-f_]+|\d[\d_]*/g)) {
    out.push(Number.parseInt(m[0].replaceAll("_", ""), m[0].startsWith("0x") ? 16 : 10));
  }
  return out;
}

/** Parse `'\u{HEX}'` escapes; returns code point. */
const cpOf = (tok) => Number.parseInt(tok, 16);

/**
 * Parse the char set of a `matches!(c, ...)` body into sorted [lo, hi] ranges.
 * Handles `'\u{A}'` and `'\u{A}'..='\u{B}'` alternatives.
 */
function matchesRanges(src, fnName) {
  const fn = fnSource(src, fnName);
  const body = /matches!\(\s*c,([\s\S]*?)\)\s*\}/.exec(fn);
  if (!body) throw new Error(`matches!() not found in ${fnName}`);
  const ranges = [];
  const re = /'\\u\{([0-9A-Fa-f]+)\}'(?:\s*\.\.=\s*'\\u\{([0-9A-Fa-f]+)\}')?/g;
  for (const m of body[1].matchAll(re)) {
    ranges.push([cpOf(m[1]), m[2] ? cpOf(m[2]) : cpOf(m[1])]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

/** Slice out one `fn name(...) ... }` (to the next `\npub` / end). */
function fnSource(src, name) {
  const i = src.indexOf(`fn ${name}`);
  if (i < 0) throw new Error(`fn ${name} not found`);
  const j = src.indexOf("\npub", i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}

/** Parse `match top_bits { 0xN => <idx or &LEAF_k>, ... }` into [[topBits, k], ...]. */
function topBitsMap(src, fnName) {
  const fn = fnSource(src, fnName);
  const out = [];
  for (const m of fn.matchAll(/(0x[0-9A-Fa-f]+)\s*=>\s*(?:&[A-Z_]+_LEAF_)?(\d+)/g)) {
    out.push([Number.parseInt(m[1], 16), Number(m[2])]);
  }
  if (out.length === 0) throw new Error(`no top-bits arms in ${fnName}`);
  return out;
}

/**
 * Parse the width==3 special-case `match c { ... }` of lookup_width /
 * lookup_width_cjk into { cases: [lo, hi, width, infoName][], default: [width, infoName] }.
 */
function specialCases(src, fnName) {
  const fn = fnSource(src, fnName);
  const body = /match c \{([\s\S]*?)\n\s*\}\n/.exec(fn);
  if (!body) throw new Error(`special-case match not found in ${fnName}`);
  const cases = [];
  let def = null;
  const armRe =
    /(?:'\\u\{([0-9A-Fa-f]+)\}'(?:\s*\.\.=\s*'\\u\{([0-9A-Fa-f]+)\}')?|_)\s*=>\s*\((\d+),\s*WidthInfo::([A-Z0-9_]+)\)/g;
  for (const m of body[1].matchAll(armRe)) {
    if (m[1] === undefined) {
      def = [Number(m[3]), m[4]];
    } else {
      cases.push([cpOf(m[1]), m[2] ? cpOf(m[2]) : cpOf(m[1]), Number(m[3]), m[4]]);
    }
  }
  if (!def) throw new Error(`no default arm in ${fnName}`);
  return { cases: cases.sort((a, b) => a[0] - b[0]), default: def };
}

// ---------- parse width_info.rs constants ----------

const wiConsts = {};
for (const m of widthInfoRs.matchAll(
  /const ([A-Z0-9_]+): Self = Self\((0b[01_]+|\d+)\);/g
)) {
  wiConsts[m[1]] = Number.parseInt(m[2].replace("0b", "").replaceAll("_", ""), m[2].startsWith("0b") ? 2 : 10);
}
if (!("DEFAULT" in wiConsts) || !("VARIATION_SELECTOR_16" in wiConsts)) {
  throw new Error("width_info constants incomplete");
}

// ---------- parse tables.rs ----------

const versionMatch = /UNICODE_VERSION[^=]*=\s*\((\d+),\s*(\d+),\s*(\d+)\)/.exec(tablesRs);
const unicodeVersion = `${versionMatch[1]}.${versionMatch[2]}.${versionMatch[3]}`;

const widthRoot = numbers(staticLiteral(tablesRs, "WIDTH_ROOT"));
const widthRootCjk = numbers(staticLiteral(tablesRs, "WIDTH_ROOT_CJK"));
const widthMiddle = numbers(staticLiteral(tablesRs, "WIDTH_MIDDLE"));
const widthLeaves = numbers(staticLiteral(tablesRs, "WIDTH_LEAVES"));
const emojiLeaves = numbers(staticLiteral(tablesRs, "EMOJI_PRESENTATION_LEAVES"));

if (widthRoot.length !== 256 || widthRootCjk.length !== 256)
  throw new Error("WIDTH_ROOT size mismatch");
if (widthMiddle.length % 64 || widthLeaves.length % 32 || emojiLeaves.length % 128)
  throw new Error("table size not a multiple of its block size");

/** 6-bytes-per-pair LE range tables → flat [lo, hi, ...] */
function rangePairs(name) {
  const n = numbers(staticLiteral(tablesRs, name));
  if (n.length % 6) throw new Error(`${name} size mismatch`);
  const out = [];
  for (let i = 0; i < n.length; i += 6) {
    out.push(n[i] | (n[i + 1] << 8) | (n[i + 2] << 16), n[i + 3] | (n[i + 4] << 8) | (n[i + 5] << 16));
  }
  return out;
}
const nonTransparentZeroWidths = rangePairs("NON_TRANSPARENT_ZERO_WIDTHS");
const solidusTransparent = rangePairs("SOLIDUS_TRANSPARENT");

/** TEXT_PRESENTATION_LEAF_k / EMOJI_MODIFIER_LEAF_k → array of flat [lo, hi, ...] byte ranges */
function leafSeries(prefix) {
  const out = [];
  for (let k = 0; ; k++) {
    if (!tablesRs.includes(`${prefix}_LEAF_${k}:`)) break;
    const n = numbers(staticLiteral(tablesRs, `${prefix}_LEAF_${k}`));
    if (n.length % 2) throw new Error(`${prefix}_LEAF_${k} size mismatch`);
    out.push(n);
  }
  if (out.length === 0) throw new Error(`no ${prefix} leaves found`);
  return out;
}
const textPresentationLeaves = leafSeries("TEXT_PRESENTATION");
const emojiModifierLeaves = leafSeries("EMOJI_MODIFIER");

// ---------- parse props.rs / lookup.rs structure ----------

const joiningGroupLam = matchesRanges(propsRs, "is_joining_group_lam");
const ligatureTransparent = matchesRanges(propsRs, "is_ligature_transparent");
const emojiPresentationTopBits = topBitsMap(propsRs, "starts_emoji_presentation_seq");
const textPresentationTopBits = topBitsMap(propsRs, "starts_non_ideographic_text_presentation_seq");
const emojiModifierTopBits = topBitsMap(propsRs, "is_emoji_modifier_base");

const specials = specialCases(lookupRs, "lookup_width(");
const specialsCjk = specialCases(lookupRs, "lookup_width_cjk");

// ---------- emit ----------

mkdirSync(outDir, { recursive: true });

/**
 * Base64 with run-length compression: repeated table bytes (e.g. whole
 * "all width 1" leaf blocks) surface as long single-character runs in
 * base64, emitted as `${V(n)}` template substitutions. A per-character
 * helper (V, A, q, ...) is defined for each run char that is a valid JS
 * identifier; anything else (/, +, digits, =) falls back to `R("c", n)`.
 */
// Run-length helpers (${V(n)} etc.) shrink the payload ~55% but clutter the
// file; off by default, re-enable with --rle.
const RLE = process.argv.includes("--rle");
const RUN_MIN = 8; // below this, the ${V(n)} call site is longer than the run
const RUN_MIN_R = 14; // ${R("c", n)} is 5 chars longer
const REP_MIN = 4; // 4-char-pattern repeats for ${Tk5O(n)}
const REP_MIN_R = 6; // repeats for the R("Tk5O", n) fallback
// A 4-char base64 pattern could spell a JS keyword; those get the R fallback.
const RESERVED = new Set(["this", "void", "with", "case", "else", "enum", "true", "null"]);
const isIdent = (p) => /^[A-Za-z][0-9A-Za-z]*$/.test(p) && !RESERVED.has(p);
const usedHelpers = new Set();
let usesR = false;
const b64 = (arr) => {
  const s = Buffer.from(Uint8Array.from(arr)).toString("base64");
  if (!RLE) return s;
  let out = "";
  let i = 0;
  while (i < s.length) {
    // Single-character run (phase-aligned repeated byte, e.g. 0x55 → "VVVV…").
    let j = i;
    while (j < s.length && s[j] === s[i]) j++;
    const n = j - i;
    if (n >= RUN_MIN && isIdent(s[i])) {
      usedHelpers.add(s[i]);
      out += `\${${s[i]}(${n})}`;
      i = j;
      continue;
    }
    if (n >= RUN_MIN_R) {
      usesR = true;
      out += `\${R("${s[i]}", ${n})}`;
      i = j;
      continue;
    }
    // Repeating 4-char block (unaligned repeated byte, e.g. 0x4E → "Tk5OTk5O…").
    const p = s.slice(i, i + 4);
    if (p.length === 4) {
      let k = 1;
      while (s.startsWith(p, i + 4 * k)) k++;
      if (k >= REP_MIN && isIdent(p)) {
        usedHelpers.add(p);
        out += `\${${p}(${k})}`;
        i += 4 * k;
        continue;
      }
      if (k >= REP_MIN_R) {
        usesR = true;
        out += `\${R("${p}", ${k})}`;
        i += 4 * k;
        continue;
      }
    }
    out += s[i];
    i++;
  }
  return out;
};
/**
 * Sparse alternative: most tables sit on a constant background byte (0x00
 * for bitset leaves, 0x08 for WIDTH_ROOT). Emit only the deviating segments
 * as (offset, base64) patches over a fill — a fresh Uint8Array is already
 * zero-filled, so a zero background costs nothing at decode time.
 */
let usesSparse = false;
const GAP_MIN = 8; // background bytes between segments before splitting pays off
function sparseEnc(arr) {
  const counts = new Map();
  for (const byte of arr) counts.set(byte, (counts.get(byte) ?? 0) + 1);
  const fill = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // Maximal non-fill segments, merged across short fill gaps.
  const segments = [];
  let start = -1;
  let lastNonFill = -1;
  for (let i = 0; i <= arr.length; i++) {
    const isFill = i === arr.length || arr[i] === fill;
    if (!isFill) {
      if (start < 0) start = i;
      else if (i - lastNonFill > GAP_MIN) {
        segments.push([start, lastNonFill + 1]);
        start = i;
      }
      lastNonFill = i;
    }
  }
  if (start >= 0) segments.push([start, lastNonFill + 1]);

  const patches = segments
    .map(([lo, hi]) => `[${lo}, \`${b64(arr.slice(lo, hi))}\`]`)
    .join(", ");
  return `sparse(${arr.length}, [${patches}]${fill ? `, 0x${fill.toString(16)}` : ""})`;
}

/**
 * `--plain` emits tables as raw number arrays (for hand experimentation);
 * the default emits the shortest of the compact encodings.
 */
const PLAIN = process.argv.includes("--plain");
const FILL = process.argv.includes("--fill");
let usesDecode = false;
let usesAssemble = false;

const modeByte = (arr) => {
  const counts = new Map();
  for (const b of arr) counts.set(b, (counts.get(b) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0];
};

/** "most common byte NN ×count" for a table's doc comment. */
const modeOf = (arr) => {
  const [byte, n] = modeByte(arr);
  return `most common byte ${byte} ×${n}/${arr.length}`;
};

/** Emit whichever encoding of this table is shorter. */
function enc(arr) {
  if (FILL) {
    usesAssemble = true;
    const [fill] = modeByte(arr);
    // Group patches by byte: byte → [single indexes, [start, range] runs]
    const groups = new Map();
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === fill) continue;
      let j = i;
      while (j + 1 < arr.length && arr[j + 1] === arr[i]) j++;
      let g = groups.get(arr[i]);
      if (!g) groups.set(arr[i], (g = { pts: [], runs: [] }));
      if (j === i) g.pts.push(i);
      else g.runs.push([i, j - i]);
      i = j;
    }
    const entries = [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([b, g]) => {
        const runs = g.runs.length
          ? `,[${g.runs.map(([s, r]) => `[${s},${r}]`).join(",")}]`
          : "";
        return `${b}:[[${g.pts.join(",")}]${runs}]`;
      });
    return `assemble(${arr.length}, ${fill}, {\n  ${entries.join(",\n  ")},\n})`;
  }
  if (PLAIN) return `Uint8Array.from([${arr.join(",")}])`;
  const plain = `decode(\`${b64(arr)}\`)`;
  const sparse = sparseEnc(arr);
  if (process.env.DEBUG_ENC) {
    console.error(`enc(${arr.length} bytes): plain ${plain.length}, sparse ${sparse.length}`);
  }
  if (sparse.length < plain.length) {
    usesSparse = true;
    return sparse;
  }
  usesDecode = true;
  return plain;
}

// Default: one concatenated blob split at recorded offsets (measured smaller
// than five separate decode() calls). --separate restores per-table exports.
const SPLIT = !PLAIN && !FILL && !process.argv.includes("--separate");

let tableSection;
if (SPLIT) {
  // One concatenated blob, split at 4 recorded offsets on decode.
  const blob = [...widthRoot, ...widthRootCjk, ...widthMiddle, ...widthLeaves, ...emojiLeaves];
  const cuts = [];
  let off = 0;
  for (const a of [widthRoot, widthRootCjk, widthMiddle, widthLeaves]) {
    off += a.length;
    cuts.push(off);
  }
  usesDecode = true;
  tableSection = `/**
 * Width lookup trie, one blob split at ${cuts.join("/")}:
 * root (cp >> 13 → middle block; ${modeOf(widthRoot)}),
 * CJK root (${modeOf(widthRootCjk)}),
 * middle (${widthMiddle.length / 64} × 64 B; ${modeOf(widthMiddle)}),
 * leaves (${widthLeaves.length / 32} × 32 B of 2-bit widths; ${modeOf(widthLeaves)}),
 * emoji presentation bitset (${modeOf(emojiLeaves)}).
 */
const split = (a: Uint8Array, cuts: number[]): Uint8Array[] => {
  let p = 0;
  return [...cuts, a.length].map((c) => {
    const s = a.subarray(p, c);
    p = c;
    return s;
  });
};
export const [WIDTH_ROOT, WIDTH_ROOT_CJK, WIDTH_MIDDLE, WIDTH_LEAVES, EMOJI_PRESENTATION_LEAVES] =
  split(decode(\`${b64(blob)}\`), [${cuts.join(", ")}]);`;
} else {
  const encRoot = enc(widthRoot);
  const encRootCjk = enc(widthRootCjk);
  const encMiddle = enc(widthMiddle);
  const encLeaves = enc(widthLeaves);
  const encEmoji = enc(emojiLeaves);
  tableSection = `/** Top level of the width lookup trie: cp >> 13 → middle-block index; ${modeOf(widthRoot)}. */
export const WIDTH_ROOT = ${encRoot};
/** CJK variant of the trie top level; ${modeOf(widthRootCjk)}. */
export const WIDTH_ROOT_CJK = ${encRootCjk};
/** Middle level, ${widthMiddle.length / 64} blocks × 64 bytes: (block << 6) | (cp >> 7 & 0x3F) → leaf index; ${modeOf(widthMiddle)}. */
export const WIDTH_MIDDLE = ${encMiddle};
/** Leaf level, ${widthLeaves.length / 32} blocks × 32 bytes of 2-bit packed widths; ${modeOf(widthLeaves)}. */
export const WIDTH_LEAVES = ${encLeaves};
/** ${emojiLeaves.length / 128} × 128-byte bitset leaves for emoji presentation; ${modeOf(emojiLeaves)}. */
export const EMOJI_PRESENTATION_LEAVES = ${encEmoji};`;
}
const helperDefs = [
  ...[...usedHelpers].sort().map((p) => `const ${p} = (n: number): string => "${p}".repeat(n);`),
  ...(usesR ? ['const R = (p: string, n: number): string => p.repeat(n);'] : []),
  ...(usesSparse
    ? [
        `
/** Patches over a constant background byte; a new Uint8Array is already 0-filled. */
const sparse = (
  len: number,
  patches: ReadonlyArray<readonly [number, string]>,
  fill = 0
): Uint8Array => {
  const a = new Uint8Array(len);
  if (fill) a.fill(fill);
  for (const [off, chunk] of patches) a.set(decode(chunk), off);
  return a;
};`,
      ]
    : []),
].join("\n");

const assembleDef = usesAssemble
  ? `/**
 * Fill with the table's most common byte, then apply per-byte patches:
 * byte → [single indexes, optional [start, range] runs], where a run
 * covers start..start+range inclusive.
 */
const assemble = (
  len: number,
  fill: number,
  groups: Record<number, [number[], number[][]?]>
): Uint8Array => {
  const a = new Uint8Array(len).fill(fill);
  for (const key in groups) {
    const b = +key;
    const [pts, runs = []] = groups[key];
    for (const i of pts) a[i] = b;
    for (const [start, range] of runs) a.fill(b, start, start + range + 1);
  }
  return a;
};
`
  : "";

const decodeAndHelpers =
  usesDecode || usesSparse
    ? `function decode(s: string): Uint8Array {
  // Node's Buffer decodes base64 fastest but is absent in browsers; look it
  // up as an optional global so this file typechecks without Node typings.
  const B = (globalThis as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer;
  if (B) return new Uint8Array(B.from(s, "base64"));
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}${
        helperDefs
          ? `

/** Run-length helpers for the base64 payloads: V(36) === "V".repeat(36). */
${helperDefs}`
          : ""
      }`
    : assembleDef;

const header = `// AUTO-GENERATED by scripts/convert.mjs from unicode-width's generated tables.
// Do not edit directly. Derived from https://github.com/unicode-rs/unicode-width
// (MIT OR Apache-2.0, used under the MIT option); data ultimately from the
// Unicode Character Database (Unicode License v3). See THIRD-PARTY-NOTICES.md.
`;

const wiLines = Object.entries(wiConsts)
  .map(([k, v]) => `  ${k}: 0x${v.toString(16).toUpperCase().padStart(4, "0")},`)
  .join("\n");

const specialsFlat = (s) =>
  s.cases.map(([lo, hi, w, info]) => `  [0x${lo.toString(16)}, 0x${hi.toString(16)}, ${w}, WI.${info}],`).join("\n");

writeFileSync(
  join(outDir, "widthInfoStates.ts"),
  `${header}
/** State-machine states ("WidthInfo" in unicode-width). Values are u16 bit patterns. */
export const WI = {
${wiLines}
} as const;
`
);

writeFileSync(
  join(outDir, "tables.ts"),
  `${header}
import { WI } from "./widthInfoStates";

/** Unicode version the tables were generated from. */
export const UNICODE_VERSION = "${unicodeVersion}";

${decodeAndHelpers}

${tableSection}

/** Sorted [lo, hi] pairs: zero-width chars that are NOT Joining_Type=Transparent. */
export const NON_TRANSPARENT_ZERO_WIDTHS = new Uint32Array([
  ${nonTransparentZeroWidths.map((n) => `0x${n.toString(16)}`).join(", ")},
]);

/** Sorted [lo, hi] pairs: chars transparent wrt U+0338 COMBINING LONG SOLIDUS OVERLAY. */
export const SOLIDUS_TRANSPARENT = new Uint32Array([
  ${solidusTransparent.map((n) => `0x${n.toString(16)}`).join(", ")},
]);

/** [cp >> 10, leaf index] pairs for the emoji-presentation bitset. */
export const EMOJI_PRESENTATION_TOP_BITS: ReadonlyArray<readonly [number, number]> = [
  ${emojiPresentationTopBits.map(([t, k]) => `[0x${t.toString(16)}, ${k}]`).join(", ")},
];

/** cp >> 8 → sorted (lo, hi) byte-range leaf, for text presentation sequences. */
export const TEXT_PRESENTATION_TOP_BITS: ReadonlyArray<readonly [number, number]> = [
  ${textPresentationTopBits.map(([t, k]) => `[0x${t.toString(16)}, ${k}]`).join(", ")},
];
export const TEXT_PRESENTATION_LEAVES: ReadonlyArray<Uint8Array> = [
${textPresentationLeaves.map((leaf) => `  Uint8Array.from([${leaf.map((n) => `0x${n.toString(16)}`).join(", ")}]),`).join("\n")}
];

/** cp >> 8 → sorted (lo, hi) byte-range leaf, for Emoji_Modifier_Base. */
export const EMOJI_MODIFIER_TOP_BITS: ReadonlyArray<readonly [number, number]> = [
  ${emojiModifierTopBits.map(([t, k]) => `[0x${t.toString(16)}, ${k}]`).join(", ")},
];
export const EMOJI_MODIFIER_LEAVES: ReadonlyArray<Uint8Array> = [
${emojiModifierLeaves.map((leaf) => `  Uint8Array.from([${leaf.map((n) => `0x${n.toString(16)}`).join(", ")}]),`).join("\n")}
];

/** Sorted [lo, hi] ranges with Joining_Group=Lam. */
export const JOINING_GROUP_LAM: ReadonlyArray<readonly [number, number]> = [
  ${joiningGroupLam.map(([lo, hi]) => `[0x${lo.toString(16)}, 0x${hi.toString(16)}]`).join(", ")},
];

/** Sorted [lo, hi] ranges of default-ignorable combining marks / ZWJ (ligature transparent). */
export const LIGATURE_TRANSPARENT: ReadonlyArray<readonly [number, number]> = [
  ${ligatureTransparent.map(([lo, hi]) => `[0x${lo.toString(16)}, 0x${hi.toString(16)}]`).join(", ")},
];

/**
 * Special cases hit when the trie yields the sentinel width 3:
 * sorted [lo, hi, width, widthInfo] rows, with a catch-all default.
 */
export const WIDTH_SPECIALS: ReadonlyArray<readonly [number, number, number, number]> = [
${specialsFlat(specials)}
];
export const WIDTH_SPECIALS_DEFAULT: readonly [number, number] = [${specials.default[0]}, WI.${specials.default[1]}];

export const WIDTH_SPECIALS_CJK: ReadonlyArray<readonly [number, number, number, number]> = [
${specialsFlat(specialsCjk)}
];
export const WIDTH_SPECIALS_CJK_DEFAULT: readonly [number, number] = [${specialsCjk.default[0]}, WI.${specialsCjk.default[1]}];
`
);

console.log(
  `Generated src/gen for Unicode ${unicodeVersion}: ` +
    `${widthMiddle.length / 64} middle blocks, ${widthLeaves.length / 32} leaf blocks, ` +
    `${Object.keys(wiConsts).length} width-info states, ` +
    `${specials.cases.length}/${specialsCjk.cases.length} special cases.`
);

// ---------- test fixtures ported from the crate's generated tests ----------

const fixturesDir = join(root, "test", "fixtures");
mkdirSync(fixturesDir, { recursive: true });

// tables_test.rs: NORMALIZATION_TEST — (orig, NFC, NFD, NFKC, NFKD) tuples of
// r#"..."# raw strings, plus the WidthInfo start states to test under.
{
  const testRs = readFileSync(join(genDir, "tables_test.rs"), "utf8");

  const initNames = (name) => {
    const lit = staticLiteral(testRs, name);
    return [...lit.matchAll(/WidthInfo::([A-Z0-9_]+)/g)].map((m) => m[1]);
  };

  const strings = [...testRs.matchAll(/r#"([\s\S]*?)"#/g)].map((m) => m[1]);
  if (strings.length === 0 || strings.length % 5 !== 0) {
    throw new Error(`unexpected NORMALIZATION_TEST raw-string count: ${strings.length}`);
  }
  const entries = [];
  for (let i = 0; i < strings.length; i += 5) entries.push(strings.slice(i, i + 5));

  const fixture = {
    inits: initNames("NORMALIZATION_TEST_WIDTHS:"),
    initsCjk: initNames("NORMALIZATION_TEST_WIDTHS_CJK"),
    entries,
  };
  writeFileSync(
    join(fixturesDir, "normalization.json.gz"),
    gzipSync(JSON.stringify(fixture), { level: 9 })
  );
  console.log(
    `Packed ${entries.length} normalization cases ` +
      `(${fixture.inits.length}/${fixture.initsCjk.length} start states) into test/fixtures/.`
  );
}

// tests/emoji-test.txt: Unicode's emoji sequence data (downloaded by unicode.py).
{
  const emojiTest = join(root, "unicode-width", "tests", "emoji-test.txt");
  if (existsSync(emojiTest)) {
    writeFileSync(
      join(fixturesDir, "emoji-test.txt.gz"),
      gzipSync(readFileSync(emojiTest), { level: 9 })
    );
    console.log("Packed emoji-test.txt into test/fixtures/.");
  } else {
    console.warn("emoji-test.txt not found (run unicode.py); skipping that fixture.");
  }
}
