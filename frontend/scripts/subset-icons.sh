#!/usr/bin/env bash
#
# Regenerate the self-hosted, subset Material Symbols icon font.
#
# WHY THIS EXISTS
# ---------------
# The app renders icons as Material Symbols *ligature text*, e.g.
#     <span className="material-symbols-outlined">play_arrow</span>
# The browser shows the literal word "play_arrow" until the icon font is applied.
# We used to load that font from fonts.googleapis.com with `display=swap`, so any
# time the font was slow, blocked (ad blocker / privacy extension / restricted
# network), or failed, users saw raw icon names in the UI.
#
# The font is now self-hosted. The full variable font is ~3.96 MB (≈3,000 icons),
# so we ship a subset containing only the icons this codebase actually uses
# (~36 KB). `font-display: block` in src/index.css guarantees ligature text is
# never painted.
#
# WHEN TO RUN THIS
# ----------------
# Run it whenever you ADD A NEW ICON. The icon list is derived from the source at
# runtime, so this script always covers every icon currently in src/. If you add
# an icon and forget to re-run this, that one icon will not render.
#
#   ./scripts/subset-icons.sh
#
# REQUIREMENTS
# ------------
#   python3, and: pip install fonttools brotli
#   (the source font is fetched via npm on demand and is NOT saved to package.json)
#
set -euo pipefail

cd "$(dirname "$0")/.."

SRC_DIR="src"
OUT_DIR="src/assets/fonts"
OUT_FILE="$OUT_DIR/material-symbols-outlined-subset.woff2"
SOURCE_FONT="node_modules/material-symbols/material-symbols-outlined.woff2"

command -v python3 >/dev/null || { echo "ERROR: python3 is required."; exit 1; }
python3 -c "import fontTools, brotli" 2>/dev/null || {
  echo "ERROR: missing Python deps. Run: pip install fonttools brotli"; exit 1; }

# 1. Fetch the full source font on demand (not persisted as a dependency).
if [ ! -f "$SOURCE_FONT" ]; then
  echo "==> Fetching source font (material-symbols, not saved to package.json)..."
  npm install --no-save --no-audit --no-fund material-symbols >/dev/null
fi

# 2. Derive the icon list from the source. Every static ligature name in a
#    .material-symbols-outlined span.
echo "==> Scanning $SRC_DIR for icon names..."
ICON_LIST=$(grep -rhoP 'material-symbols-outlined[^>]*>\s*\K[a-z0-9_]+(?=\s*<)' "$SRC_DIR" | sort -u)
ICON_COUNT=$(echo "$ICON_LIST" | grep -c . || true)
echo "    found $ICON_COUNT unique icons"

# Guard: if someone introduces a DYNAMIC icon name (a JSX expression as the span
# body) this scan cannot see it, and that icon would be missing from the subset.
if grep -rqP 'material-symbols-outlined[^>]*>\s*\{' "$SRC_DIR"; then
  echo "WARNING: found dynamically-generated icon name(s)."
  echo "         Those cannot be auto-detected and will NOT be in the subset."
  echo "         Either use a static name, or add it to EXTRA_ICONS below."
fi

# Add any icon that cannot be statically detected here (newline separated).
EXTRA_ICONS=""

ALL_ICONS=$(printf '%s\n%s\n' "$ICON_LIST" "$EXTRA_ICONS" | grep . | sort -u)
NAMES=$(echo "$ALL_ICONS" | paste -sd,)

# Include the ".fill" companions so the FILL variable axis keeps working.
FILLS=$(echo "$ALL_ICONS" | python3 -c '
import sys
from fontTools.ttLib import TTFont
glyphs = set(TTFont(sys.argv[1]).getGlyphOrder())
names = [l.strip() for l in sys.stdin if l.strip()]
print(",".join(n + ".fill" for n in names if n + ".fill" in glyphs))
' "$SOURCE_FONT")

# 3. Subset.
#    --no-layout-closure is ESSENTIAL: every icon name is spelled with the same
#    letters, so the default GSUB closure would drag in all ~3,000 ligatures and
#    defeat the subset entirely. We instead name the exact glyphs we want and keep
#    the letters (via --text) that form the ligature inputs.
echo "==> Subsetting..."
mkdir -p "$OUT_DIR"
pyftsubset "$SOURCE_FONT" \
  --output-file="$OUT_FILE" \
  --flavor=woff2 \
  --layout-features+=liga,ccmp,rlig,rclt,dlig \
  --no-layout-closure \
  --glyph-names \
  --glyphs="$NAMES${FILLS:+,$FILLS}" \
  --text="abcdefghijklmnopqrstuvwxyz0123456789_"

# 4. Verify every icon name still shapes to its single icon glyph.
echo "==> Verifying ligatures..."
echo "$ALL_ICONS" | python3 -c '
import sys, io
path = sys.argv[1]
names = [l.strip() for l in sys.stdin if l.strip()]
try:
    import uharfbuzz as hb
except ImportError:
    print("    (skipped: pip install uharfbuzz to enable shaping verification)")
    raise SystemExit(0)
from fontTools.ttLib import TTFont
# HarfBuzz cannot parse woff2 — decompress to an in-memory TTF first.
f = TTFont(path); buf = io.BytesIO(); f.flavor = None; f.save(buf)
order = f.getGlyphOrder()
face = hb.Face(buf.getvalue()); font = hb.Font(face)
bad = []
for n in names:
    b = hb.Buffer(); b.add_str(n); b.guess_segment_properties(); hb.shape(font, b)
    got = [order[i.codepoint] for i in b.glyph_infos]
    if len(got) != 1 or got[0] != n:
        bad.append((n, got))
if bad:
    for n, g in bad[:10]:
        print(f"    FAIL {n} -> {g}")
    raise SystemExit(1)
print(f"    OK: {len(names)}/{len(names)} icons shape correctly")
' "$OUT_FILE" || { echo "Verification FAILED"; exit 1; }

echo "==> Done: $OUT_FILE ($(wc -c < "$OUT_FILE") bytes)"
