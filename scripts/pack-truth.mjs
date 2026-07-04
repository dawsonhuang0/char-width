// Packs the raw ground-truth dumps from truth/ into compressed test fixtures.

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const raw = readFileSync(join(root, "truth", "char_widths.bin"));
writeFileSync(join(root, "test", "fixtures", "char_widths.bin.gz"), gzipSync(raw, { level: 9 }));
copyFileSync(join(root, "truth", "seq_widths.txt"), join(root, "test", "fixtures", "seq_widths.txt"));

console.log("packed fixtures into test/fixtures/");
