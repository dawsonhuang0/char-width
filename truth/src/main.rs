//! Dumps ground truth from the real unicode-width crate, for conformance
//! testing the TypeScript port. Run via `npm run gen:truth` from the package
//! root (paths below are relative to it).

use std::fmt::Write as _;
use std::fs;
use unicode_width::{UnicodeWidthChar, UnicodeWidthStr};

fn main() {
    // Per-code-point widths: two bytes per code point (width, width_cjk).
    // 255 encodes None (control character), 254 a surrogate (no Rust char).
    let mut buf = Vec::with_capacity(0x110000 * 2);
    for cp in 0..=0x10FFFFu32 {
        match char::from_u32(cp) {
            Some(c) => {
                buf.push(c.width().map_or(255, |w| w as u8));
                buf.push(c.width_cjk().map_or(255, |w| w as u8));
            }
            None => {
                buf.push(254);
                buf.push(254);
            }
        }
    }
    fs::write("truth/char_widths.bin", &buf).unwrap();

    // Sequence widths: one "width width_cjk" line per sequences.txt line.
    let seqs = fs::read_to_string("test/fixtures/sequences.txt").unwrap();
    let mut out = String::new();
    for line in seqs.lines() {
        if line.is_empty() {
            continue;
        }
        let s: String = line
            .split_whitespace()
            .map(|h| char::from_u32(u32::from_str_radix(h, 16).unwrap()).unwrap())
            .collect();
        writeln!(out, "{} {}", s.width(), s.width_cjk()).unwrap();
    }
    fs::write("truth/seq_widths.txt", out).unwrap();

    eprintln!("wrote truth/char_widths.bin and truth/seq_widths.txt");
}
