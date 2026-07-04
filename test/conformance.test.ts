// Conformance: the TS port must match the Rust unicode-width crate exactly,
// for every Unicode code point and for a 5000+ sequence corpus.
// Fixtures are produced by `npm run gen:truth` (see truth/src/main.rs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

import { charWidth, strWidth } from "../src/index";

const fixtures = join(__dirname, "fixtures");

test("charWidth matches Rust for all 1,114,112 code points (non-CJK and CJK)", () => {
  const truth = gunzipSync(readFileSync(join(fixtures, "char_widths.bin.gz")));
  assert.equal(truth.length, 0x110000 * 2);

  let checked = 0;
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    const expected = truth[cp * 2];
    if (expected === 254) continue; // surrogate: no Rust ground truth

    const s = String.fromCodePoint(cp);
    const got = charWidth(s);
    const gotCjk = charWidth(s, { cjk: true });

    const want = expected === 255 ? undefined : expected;
    const wantCjk = truth[cp * 2 + 1] === 255 ? undefined : truth[cp * 2 + 1];

    if (got !== want || gotCjk !== wantCjk) {
      assert.fail(
        `U+${cp.toString(16).toUpperCase()}: got ${got}/${gotCjk}, want ${want}/${wantCjk}`
      );
    }
    checked++;
  }
  assert.equal(checked, 0x110000 - 2048); // all code points except surrogates
});

test("strWidth matches Rust for the sequence corpus", () => {
  const sequences = readFileSync(join(fixtures, "sequences.txt"), "utf8").trim().split("\n");
  const widths = readFileSync(join(fixtures, "seq_widths.txt"), "utf8").trim().split("\n");
  assert.equal(sequences.length, widths.length);

  for (let i = 0; i < sequences.length; i++) {
    const s = sequences[i]
      .split(" ")
      .map((h) => String.fromCodePoint(Number.parseInt(h, 16)))
      .join("");
    const [want, wantCjk] = widths[i].split(" ").map(Number);

    const got = strWidth(s);
    const gotCjk = strWidth(s, { cjk: true });
    if (got !== want || gotCjk !== wantCjk) {
      assert.fail(
        `sequence ${i} [${sequences[i]}]: got ${got}/${gotCjk}, want ${want}/${wantCjk}`
      );
    }
  }
});
