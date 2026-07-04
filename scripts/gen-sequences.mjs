// Generates test/fixtures/sequences.txt: a deterministic corpus of code-point
// sequences (space-separated hex, one sequence per line) exercising every
// ligature family and the emoji state machine. The Rust `truth` binary
// computes the crate's widths for the same corpus.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "test", "fixtures", "sequences.txt");

// Code points that drive the state machine plus assorted bystanders.
const ALPHABET = [
  0x0a, 0x0d, 0x20, 0x23, 0x2a, 0x30, 0x39, 0x3c, 0x3d, 0x3e, 0x41, 0x7e,
  0xa0, 0x301, 0x338, 0x34f, 0x5d0, 0x5dc, 0x61f, 0x622, 0x644, 0x6b5, 0x76a,
  0x882, 0x8a6, 0x8c7, 0x115f, 0x1160, 0x11a8, 0x1780, 0x17a0, 0x17a4, 0x17d2,
  0x17d8, 0x1a10, 0x1a15, 0x1a17, 0x2018, 0x2019, 0x201c, 0x201d, 0x200b,
  0x200d, 0x20e3, 0x2764, 0x263a, 0x2d31, 0x2d65, 0x2d6f, 0x2d7f, 0x3000,
  0x4e00, 0xa4f8, 0xa4fb, 0xa4fc, 0xa4fd, 0xac00, 0xfe00, 0xfe01, 0xfe02,
  0xfe0e, 0xfe0f, 0xff01, 0x10c03, 0x10c32, 0x16d63, 0x16d67, 0x16d68,
  0x16d69, 0x1f1e6, 0x1f1e8, 0x1f1ff, 0x1f3f4, 0x1f3fb, 0x1f3ff, 0x1f466,
  0x1f469, 0x1f600, 0xe0030, 0xe0039, 0xe0061, 0xe0067, 0xe007a, 0xe007f,
  0xe0100, 0x180b, 0x180f, 0x17b4,
];

// Hand-picked full sequences (well-known emoji + script ligatures).
const CURATED = [
  [0x1f469, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466], // family ZWJ
  [0x2764, 0xfe0f], // red heart, emoji presentation
  [0x2764, 0xfe0e], // red heart, text presentation
  [0x1f1e8, 0x1f1e6], // flag: CA
  [0x1f1e8, 0x1f1e6, 0x1f1e8, 0x1f1e6], // two flags
  [0x1f1e8, 0x1f1e6, 0x1f1e8], // 3 regional indicators
  [0x1f469, 0x1f3fd], // woman + skin tone
  [0x23, 0xfe0f, 0x20e3], // keycap #
  [0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f], // England flag tag seq
  [0x644, 0x622], // Lam-Alef
  [0x644, 0x34f, 0x622], // Lam-CGJ-Alef
  [0x5d0, 0x200d, 0x5dc], // Alef-ZWJ-Lamed
  [0x1a15, 0x1a17, 0x200d, 0x1a10], // Buginese <a,-i> ya
  [0x17d2, 0x1780], // Khmer coeng ka
  [0xa4f8, 0xa4fc], // Lisu tone
  [0x10c32, 0x200d, 0x10c03], // Old Turkic ligature
  [0x2d31, 0x2d7f, 0x2d31], // Tifinagh joiner
  [0x2d31, 0x200d, 0x2d31], // Tifinagh ZWJ
  [0x16d68, 0x16d67, 0x16d63], // Kirat Rai
  [0x0d, 0x0a], // CRLF
  [0x0a, 0x0d], // LF CR (not a unit)
  [0x3d, 0x338], // = with solidus overlay (CJK rule)
  [0x2018, 0xfe01], // quote + VS2
  [0x2018, 0xfe00], // quote + VS1
];

// Deterministic PRNG (mulberry32) so fixtures are reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0xc4a2_2026 % 0xffffffff);
const lines = CURATED.map((seq) => seq.map((c) => c.toString(16)).join(" "));

for (let n = 0; n < 5000; n++) {
  const len = 1 + Math.floor(rand() * 12);
  const seq = [];
  for (let i = 0; i < len; i++) {
    seq.push(ALPHABET[Math.floor(rand() * ALPHABET.length)]);
  }
  lines.push(seq.map((c) => c.toString(16)).join(" "));
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, lines.join("\n") + "\n");
console.log(`wrote ${lines.length} sequences to test/fixtures/sequences.txt`);
