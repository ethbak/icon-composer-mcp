#!/usr/bin/env bash
# validate-apple-compat.sh — Generate test .icon bundles and open in Icon Composer
# Run from project root: bash scripts/validate-apple-compat.sh
set -euo pipefail

OUTDIR="$(mktemp -d)/apple-compat-test"
mkdir -p "$OUTDIR"
echo "=== Apple Compatibility Validation ==="
echo "Output dir: $OUTDIR"
echo ""

# Generate a proper 512x512 test SVG glyph
cat > "$OUTDIR/glyph.svg" << 'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="200" fill="#FFFFFF"/>
  <text x="256" y="280" text-anchor="middle" font-size="120" font-family="Helvetica" fill="#0A66C2">ic</text>
</svg>
SVG

cat > "$OUTDIR/glyph2.svg" << 'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="56" y="56" width="400" height="400" rx="60" fill="#FF6B35"/>
  <circle cx="256" cy="220" r="80" fill="#FFFFFF"/>
  <rect x="176" y="320" width="160" height="80" rx="20" fill="#FFFFFF"/>
</svg>
SVG

echo "--- Test 1: Minimal (solid fill, 1 layer) ---"
bun src/cli.ts create "$OUTDIR/glyph.svg" "$OUTDIR" \
  --bundle-name "Test1-Minimal" \
  --bg-color "#0A66C2" \
  --glyph-scale 0.65
echo ""

echo "--- Test 2: Complex (gradient fill, dark mode, glass effects) ---"
bun src/cli.ts create "$OUTDIR/glyph2.svg" "$OUTDIR" \
  --bundle-name "Test2-Complex" \
  --bg-color "#1E3A5F" \
  --dark-bg-color "#0D1B2A" \
  --glyph-scale 0.7 \
  --specular \
  --shadow-kind layer-color \
  --shadow-opacity 0.6 \
  --blur-material 0.3 \
  --translucency-enabled \
  --translucency-value 0.5
echo ""

echo "--- Test 3: SVG glyph, no glass effects ---"
bun src/cli.ts create "$OUTDIR/glyph.svg" "$OUTDIR" \
  --bundle-name "Test3-NoGlass" \
  --bg-color "#34C759" \
  --glyph-scale 0.5 \
  --no-specular \
  --shadow-kind none \
  --shadow-opacity 0
echo ""

echo "--- ictool render check ---"
for bundle in "$OUTDIR"/Test*.icon; do
  name=$(basename "$bundle")
  echo "Rendering $name with ictool..."
  ictool --export-image \
    --icon-bundle-path "$bundle" \
    --output-path "$OUTDIR/${name%.icon}-ictool.png" \
    --rendition Default \
    --width 1024 --height 1024 2>&1 || echo "  FAILED: ictool rejected $name"
done
echo ""

echo "--- Opening bundles in Icon Composer ---"
echo "Check each bundle for:"
echo "  1. Opens without errors"
echo "  2. Layers visible in the editor"
echo "  3. Preview renders correctly"
echo "  4. Dark mode toggle works (Test2)"
echo "  5. Glass effects visible (Test2)"
echo ""

for bundle in "$OUTDIR"/Test*.icon; do
  echo "Opening: $bundle"
  open -a "Icon Composer" "$bundle"
  sleep 1
done

echo ""
echo "=== Bundles are open in Icon Composer ==="
echo "After verifying, document results in docs/apple-compatibility.md"
echo "Output dir for reference: $OUTDIR"
