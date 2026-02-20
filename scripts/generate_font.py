#!/usr/bin/env python3
"""
Generate a ZX Spectrum pixel font (WOFF2) from the 48K ROM character set.

The ZX Spectrum 48K ROM contains an 8x8 bitmap character set at offset 0x3D00,
covering 96 printable ASCII characters (codes 32-127). This script extracts
those bitmaps and converts them into a TrueType font with vector outlines
(each pixel becomes a square path), then compresses to WOFF2.

Requires: pip install fonttools brotli
"""

import sys
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib.tables._g_l_y_f import Glyph


ROM_PATH = Path(__file__).parent.parent / "roms" / "48.rom"
OUTPUT_PATH = Path(__file__).parent.parent / "public" / "fonts" / "zx-spectrum.woff2"

CHARSET_OFFSET = 0x3D00
CHAR_COUNT = 96
CHAR_WIDTH = 8
CHAR_HEIGHT = 8
FIRST_CHAR = 32  # space

UNITS_PER_EM = 800
PIXEL_SIZE = UNITS_PER_EM // CHAR_WIDTH  # 100
ASCENT = 700
DESCENT = -100


def read_rom_charset(rom_path):
    """Read the 96 character bitmaps from the ROM."""
    with open(rom_path, "rb") as f:
        f.seek(CHARSET_OFFSET)
        data = f.read(CHAR_COUNT * CHAR_HEIGHT)

    chars = []
    for i in range(CHAR_COUNT):
        bitmap = []
        for row in range(CHAR_HEIGHT):
            byte = data[i * CHAR_HEIGHT + row]
            bits = [(byte >> (7 - bit)) & 1 for bit in range(CHAR_WIDTH)]
            bitmap.append(bits)
        chars.append(bitmap)
    return chars


def bitmap_to_rects(bitmap):
    """Convert an 8x8 bitmap to a list of (x, y, w, h) pixel rectangles."""
    rects = []
    for row_idx, row in enumerate(bitmap):
        y = (CHAR_HEIGHT - 1 - row_idx) * PIXEL_SIZE - DESCENT
        col = 0
        while col < CHAR_WIDTH:
            if row[col]:
                start = col
                while col < CHAR_WIDTH and row[col]:
                    col += 1
                x = start * PIXEL_SIZE
                w = (col - start) * PIXEL_SIZE
                rects.append((x, y, w, PIXEL_SIZE))
            else:
                col += 1
    return rects


def rects_to_glyph(rects):
    """Convert rectangles to a TTF Glyph object using TTGlyphPen."""
    pen = TTGlyphPen(None)
    for x, y, w, h in rects:
        pen.moveTo((x, y))
        pen.lineTo((x + w, y))
        pen.lineTo((x + w, y + h))
        pen.lineTo((x, y + h))
        pen.closePath()
    return pen.glyph()


def build_font(charsets):
    """Build a TrueType font from the extracted character bitmaps."""
    glyph_names = [".notdef"]
    char_map = {}

    for i in range(CHAR_COUNT):
        code = FIRST_CHAR + i
        name = f"uni{code:04X}"
        glyph_names.append(name)
        char_map[code] = name

    fb = FontBuilder(UNITS_PER_EM, isTTF=True)
    fb.setupGlyphOrder(glyph_names)
    fb.setupCharacterMap(char_map)

    # Build glyph objects
    glyphs = {}
    glyphs[".notdef"] = Glyph()  # empty glyph

    for i, bitmap in enumerate(charsets):
        rects = bitmap_to_rects(bitmap)
        name = glyph_names[i + 1]
        if rects:
            glyphs[name] = rects_to_glyph(rects)
        else:
            glyphs[name] = Glyph()  # empty (e.g., space)

    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({gname: (UNITS_PER_EM, 0) for gname in glyph_names})
    fb.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT)

    fb.setupNameTable({
        "familyName": "ZXSpectrum",
        "styleName": "Regular",
        "psName": "ZXSpectrum-Regular",
        "manufacturer": "Generated from ZX Spectrum ROM",
        "description": "ZX Spectrum 8x8 pixel font extracted from 48K ROM",
    })

    fb.setupOS2(
        sTypoAscender=ASCENT,
        sTypoDescender=DESCENT,
        sTypoLineGap=0,
        usWinAscent=ASCENT,
        usWinDescent=abs(DESCENT),
        sxHeight=500,
        sCapHeight=700,
        fsType=0,
    )

    fb.setupPost()
    return fb.font


def main():
    if not ROM_PATH.exists():
        print(f"Error: ROM file not found at {ROM_PATH}", file=sys.stderr)
        sys.exit(1)

    print(f"Reading ROM charset from {ROM_PATH}...")
    charsets = read_rom_charset(ROM_PATH)
    print(f"Extracted {len(charsets)} characters")

    print("Building font...")
    font = build_font(charsets)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(str(OUTPUT_PATH))

    size = OUTPUT_PATH.stat().st_size
    print(f"Saved {OUTPUT_PATH} ({size:,} bytes)")


if __name__ == "__main__":
    main()
