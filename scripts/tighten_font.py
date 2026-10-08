#!/usr/bin/env python3
"""
tighten_font.py — Adjust handwriting glyph side bearings to create joined cursive flow.

Reads Myfont-Regular.ttf and generates Myfont-Tight.ttf with:
- Tightened LSB and small negative RSB on letter glyphs so strokes naturally connect
- Expanded space glyph advance width so word boundaries remain unmistakable
- Recalculated head, hhea, OS/2 metrics and glyf bounding boxes
- Side-by-side comparison test sheet image generation via Pillow
"""

import os
import sys
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

# =====================================================================
# TUNABLE CONFIGURATION CONSTANTS (expressed in em units)
# =====================================================================
LSB_TARGET = 0.01      # Target Left Side Bearing for letter glyphs (em)
RSB_TARGET = -0.02     # Target Right Side Bearing for letter glyphs (em, negative creates stroke join)
SPACE_WIDTH = 0.32     # Target advance width for space & nbsp (em)
PUNCT_LSB = 0.01       # Target LSB for punctuation (em)
PUNCT_RSB = 0.03       # Target RSB for punctuation (em)

# Punctuation glyph names in this font
PUNCTUATION_GLYPHS = {
    'exclam', 'quotedbl', 'quotesingle', 'comma', 'period',
    'colon', 'semicolon', 'question'
}

SPACE_GLYPHS = {'space', 'nbsp', 'uni0020', 'uni00A0'}

def is_letter_glyph(name: str) -> bool:
    """Return True if glyph represents an ASCII letter (A-Z, a-z)."""
    return len(name) == 1 and name.isalpha()

def tighten_font(
    input_path: str = "public/fonts/Myfont-Regular.ttf",
    output_path: str = "public/fonts/Myfont-Tight.ttf",
    lsb_em: float = LSB_TARGET,
    rsb_em: float = RSB_TARGET,
    space_em: float = SPACE_WIDTH,
    punct_lsb_em: float = PUNCT_LSB,
    punct_rsb_em: float = PUNCT_RSB
) -> TTFont:
    print(f"Loading base font: {input_path}")
    font = TTFont(input_path)

    units_per_em = font['head'].unitsPerEm
    glyf = font['glyf']
    hmtx = font['hmtx']

    target_lsb_units = round(lsb_em * units_per_em)
    target_rsb_units = round(rsb_em * units_per_em)
    target_space_units = round(space_em * units_per_em)
    target_punct_lsb_units = round(punct_lsb_em * units_per_em)
    target_punct_rsb_units = round(punct_rsb_em * units_per_em)

    print(f"unitsPerEm: {units_per_em}")
    print(f"Target letter LSB: {target_lsb_units} ({lsb_em:.3f} em)")
    print(f"Target letter RSB: {target_rsb_units} ({rsb_em:.3f} em)")
    print(f"Target space advance: {target_space_units} ({space_em:.3f} em)")

    # 1. Modify glyph outlines and advances
    for name in font.getGlyphOrder():
        g = glyf[name]
        is_empty = (g.numberOfContours == 0)

        if name in SPACE_GLYPHS or (is_empty and name in ('space', 'nbsp')):
            hmtx[name] = (target_space_units, 0)
            continue

        if is_empty:
            continue

        if is_letter_glyph(name):
            # Letter glyph: shift to target LSB and adjust advance to target RSB
            dx = target_lsb_units - g.xMin
            g.coordinates.translate((dx, 0))
            g.recalcBounds(glyf)

            new_lsb = g.xMin
            new_adv = g.xMax + target_rsb_units
            hmtx[name] = (new_adv, new_lsb)

        elif name in PUNCTUATION_GLYPHS:
            # Punctuation: tighten LSB and set comfortable RSB
            dx = target_punct_lsb_units - g.xMin
            g.coordinates.translate((dx, 0))
            g.recalcBounds(glyf)

            new_lsb = g.xMin
            new_adv = g.xMax + target_punct_rsb_units
            hmtx[name] = (new_adv, new_lsb)

    # 2. Recalculate font-level bounding boxes and metrics
    non_empty = [g for g in glyf.values() if g.numberOfContours > 0]
    font_xMin = min(g.xMin for g in non_empty)
    font_yMin = min(g.yMin for g in non_empty)
    font_xMax = max(g.xMax for g in non_empty)
    font_yMax = max(g.yMax for g in non_empty)

    head = font['head']
    head.xMin = font_xMin
    head.yMin = font_yMin
    head.xMax = font_xMax
    head.yMax = font_yMax

    all_advances = [adv for adv, _ in hmtx.metrics.values()]
    all_lsbs = [lsb for _, lsb in hmtx.metrics.values()]
    all_rsbs = [
        adv - glyf[name].xMax
        for name, (adv, _) in hmtx.metrics.items()
        if glyf[name].numberOfContours > 0
    ]

    hhea = font['hhea']
    hhea.advanceWidthMax = max(all_advances)
    hhea.minLeftSideBearing = min(all_lsbs)
    hhea.minRightSideBearing = min(all_rsbs)
    hhea.xMaxExtent = max(g.xMax for g in non_empty)

    if 'OS/2' in font:
        font['OS/2'].xAvgCharWidth = round(sum(all_advances) / len(all_advances))

    # Save output font
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    font.save(output_path)
    print(f"Tightened font successfully saved to: {output_path}")

    # Also sync to dist/fonts if dist exists
    dist_path = "dist/fonts/Myfont-Tight.ttf"
    if os.path.exists("dist/fonts"):
        font.save(dist_path)
        print(f"Synced tightened font to: {dist_path}")

    return font

def validate_font(tight_font_path: str, orig_font_path: str):
    """Validate tightened font metrics vs original."""
    orig = TTFont(orig_font_path)
    tight = TTFont(tight_font_path)

    print("\n" + "="*70)
    print("VALIDATION REPORT: Original vs Tightened")
    print("="*70)

    u_orig = orig['head'].unitsPerEm
    u_tight = tight['head'].unitsPerEm

    print(f"{'Metric':<30} | {'Original':<18} | {'Tightened':<18}")
    print("-"*70)

    # Space width
    sp_orig = orig['hmtx']['space'][0]
    sp_tight = tight['hmtx']['space'][0]
    print(f"{'Space advance width':<30} | {sp_orig} ({sp_orig/u_orig:.3f} em)    | {sp_tight} ({sp_tight/u_tight:.3f} em)")

    # Letter averages
    letters = [name for name in orig.getGlyphOrder() if is_letter_glyph(name)]
    orig_lsbs = [orig['hmtx'][l][1] for l in letters]
    orig_rsbs = [orig['hmtx'][l][0] - orig['glyf'][l].xMax for l in letters]
    tight_lsbs = [tight['hmtx'][l][1] for l in letters]
    tight_rsbs = [tight['hmtx'][l][0] - tight['glyf'][l].xMax for l in letters]

    avg_orig_lsb = sum(orig_lsbs) / len(letters)
    avg_orig_rsb = sum(orig_rsbs) / len(letters)
    avg_tight_lsb = sum(tight_lsbs) / len(letters)
    avg_tight_rsb = sum(tight_rsbs) / len(letters)

    print(f"{'Average letter LSB':<30} | {avg_orig_lsb:.1f} ({avg_orig_lsb/u_orig:.3f} em)   | {avg_tight_lsb:.1f} ({avg_tight_lsb/u_tight:.3f} em)")
    print(f"{'Average letter RSB':<30} | {avg_orig_rsb:.1f} ({avg_orig_rsb/u_orig:.3f} em)   | {avg_tight_rsb:.1f} ({avg_tight_rsb/u_tight:.3f} em)")
    print(f"{'Avg letter gap (RSB+LSB)':<30} | {avg_orig_lsb+avg_orig_rsb:.1f} ({(avg_orig_lsb+avg_orig_rsb)/u_orig:.3f} em) | {avg_tight_lsb+avg_tight_rsb:.1f} ({(avg_tight_lsb+avg_tight_rsb)/u_tight:.3f} em)")

    # Verification: letter gap vs word gap
    tight_letter_gap_em = (avg_tight_lsb + avg_tight_rsb) / u_tight
    tight_word_gap_em = sp_tight / u_tight
    print(f"{'Word gap to letter gap ratio':<30} | {sp_orig/(avg_orig_lsb+avg_orig_rsb):.2f}x               | {tight_word_gap_em/max(0.001, tight_letter_gap_em) if tight_letter_gap_em > 0 else 'Joined (<0)':<18}")

    print("="*70)

def render_comparison_test_sheet(
    orig_path: str,
    tight_path: str,
    output_png: str,
    sizes = (26, 38, 54)
):
    """Render a visual side-by-side comparison test sheet image."""
    phrase = "say hello, write to me. leave a blot on this page and I will find it."

    width = 1500
    # Calculate required height
    total_height = 80 + len(sizes) * 260 + 60
    img = Image.new('RGB', (width, total_height), (251, 250, 246)) # paper background
    draw = ImageDraw.Draw(img)

    # Title banner
    title_font = ImageFont.load_default()
    draw.rectangle([(0, 0), (width, 60)], fill=(22, 22, 22))
    draw.text((25, 20), "TYPOGRAPHY AUDIT: Original vs Tightened Handwriting Font Comparison", fill=(251, 250, 246), font=title_font)

    y_cursor = 80

    for size in sizes:
        f_orig = ImageFont.truetype(orig_path, size)
        f_tight = ImageFont.truetype(tight_path, size)

        # Section header
        draw.text((25, y_cursor), f"--- Font Size: {size}px ---", fill=(35, 84, 230), font=title_font)
        y_cursor += 30

        # Original
        draw.text((30, y_cursor), f"[Original — Myfont-Regular.ttf ({size}px)]", fill=(120, 120, 120), font=title_font)
        y_cursor += 22
        draw.text((30, y_cursor), phrase, fill=(22, 22, 22), font=f_orig)
        y_cursor += size + 25

        # Tightened
        draw.text((30, y_cursor), f"[Tightened — Myfont-Tight.ttf ({size}px) — Connected Handwriting Flow]", fill=(35, 84, 230), font=title_font)
        y_cursor += 22
        draw.text((30, y_cursor), phrase, fill=(22, 22, 22), font=f_tight)
        y_cursor += size + 40

        # Separator line
        draw.line([(25, y_cursor - 15), (width - 25, y_cursor - 15)], fill=(220, 218, 210), width=1)

    os.makedirs(os.path.dirname(os.path.abspath(output_png)), exist_ok=True)
    img.save(output_png)
    print(f"Comparison test sheet saved to: {output_png}")

if __name__ == "__main__":
    orig_font = "public/fonts/Myfont-Regular.ttf"
    tight_font = "public/fonts/Myfont-Tight.ttf"
    test_sheet = "public/fonts/test_sheet.png"

    # Also save to conversation artifacts directory if exists
    artifact_sheet = "/Users/sagar/.gemini/antigravity-ide/brain/a6f555e2-2f91-4afa-b714-323bc65032c6/font_tightening_comparison.png"

    tighten_font(orig_font, tight_font)
    validate_font(tight_font, orig_font)
    render_comparison_test_sheet(orig_font, tight_font, test_sheet)

    if os.path.exists(os.path.dirname(artifact_sheet)):
        render_comparison_test_sheet(orig_font, tight_font, artifact_sheet)
