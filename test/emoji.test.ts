// Port of the crate's `emoji_test_file` (tests/tests.rs): every
// fully-qualified or component emoji sequence in Unicode's emoji-test.txt
// has width 2, in both non-CJK and CJK modes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

import { strWidth } from "../src/index";

test("every emoji-test.txt sequence has width 2", () => {
  const lines = gunzipSync(readFileSync(join(__dirname, "fixtures", "emoji-test.txt.gz")))
    .toString("utf8")
    .split("\n");

  let checked = 0;
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;

    const [cps, rest] = line.split(";");
    const status = rest.trim();
    if (!status.startsWith("fully-qualified") && !status.startsWith("component")) continue;

    const emoji = cps
      .trim()
      .split(" ")
      .map((h) => String.fromCodePoint(Number.parseInt(h, 16)))
      .join("");

    const w = strWidth(emoji);
    const wCjk = strWidth(emoji, true);
    if (w !== 2 || wCjk !== 2) {
      assert.fail(`emoji ${JSON.stringify(emoji)} [${cps.trim()}]: got ${w}/${wCjk}, want 2/2`);
    }
    checked++;
  }
  assert.ok(checked > 3000, `only ${checked} emoji checked`);
});
