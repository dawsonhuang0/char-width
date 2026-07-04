// Port of the crate's `test_normalization` (src/test.rs): canonically
// equivalent strings must have the same width, from every state-machine
// start state the generator deems reachable. 20,034 cases × ~40 states.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

import { strWidth } from "../src/core/strWidth";
import { WI } from "../src/gen/widthInfoStates";

interface Fixture {
  inits: string[];
  initsCjk: string[];
  entries: [string, string, string, string, string][];
}

const fixture: Fixture = JSON.parse(
  gunzipSync(readFileSync(join(__dirname, "fixtures", "normalization.json.gz"))).toString("utf8")
);

const states = (names: string[]): number[] =>
  names.map((n) => {
    const v = (WI as Record<string, number>)[n];
    assert.notEqual(v, undefined, `unknown WidthInfo state ${n}`);
    return v;
  });

function run(isCjk: boolean, inits: number[]) {
  for (const [orig, nfc, nfd, nfkc, nfkd] of fixture.entries) {
    for (const init of inits) {
      const wOrig = strWidth(orig, isCjk, init);
      if (wOrig !== strWidth(nfc, isCjk, init) || wOrig !== strWidth(nfd, isCjk, init)) {
        assert.fail(
          `width of ${JSON.stringify(orig)} differs from NFC/NFD form with init 0x${init.toString(16)}`
        );
      }
      if (strWidth(nfkc, isCjk, init) !== strWidth(nfkd, isCjk, init)) {
        assert.fail(
          `width of NFKC ${JSON.stringify(nfkc)} differs from NFKD form with init 0x${init.toString(16)}`
        );
      }
    }
  }
}

test("canonically equivalent strings have equal width (non-CJK)", () => {
  run(false, states(fixture.inits));
});

test("canonically equivalent strings have equal width (CJK)", () => {
  run(true, states(fixture.initsCjk));
});
