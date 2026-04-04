# Apple Icon Composer Compatibility

Validated: 2026-04-03

## Test Results

### Bundle Format: ACCEPTED

All 3 generated bundles opened in Icon Composer.app without errors.

| Bundle | Fill | Dark Mode | Glass Effects | Result |
|--------|------|-----------|---------------|--------|
| Test1-Minimal | solid `#0A66C2` | none | specular, shadow | Opens OK |
| Test2-Complex | solid `#1E3A5F` | `#0D1B2A` | specular, shadow, blur-material, translucency | Opens OK |
| Test3-NoGlass | solid `#34C759` | none | none | Opens OK |

### Warnings (non-blocking)

- **SVG text elements**: Icon Composer warns "SVG contains text. Text should be converted to paths before use in icons." This is cosmetic — the icon still renders. Our glyph generator should output `<path>` elements, not `<text>`.

### Manifest Format Validation

Apple re-saved one of our bundles (Test1-Minimal with dark mode added via UI). The output manifest is structurally identical to our generated format:

- `fill-specializations` array with `{ value: ... }` (default) and `{ appearance: "dark", value: ... }` entries — **our format is correct**
- `blur-material: null` written explicitly when disabled (we sometimes omit it — both work)
- `position.scale` and `translation-in-points` preserved exactly
- `supported-platforms`, `groups`, `layers` structure all match

### Scale Behavior

Apple's default glyph scale is `0.65` (our default matches). This means the glyph fills ~65% of the icon canvas in Icon Composer. If a glyph appears too small, the issue is internal padding in the SVG/PNG asset, not the scale value.

### Key Findings

1. Our `.icon` bundle format is fully compatible with Icon Composer.app
2. `fill-specializations` for dark mode work correctly
3. Round-trip (our generate → Icon Composer save) preserves all fields
4. No undocumented required fields — Apple doesn't add anything we're missing

### ictool CLI

`ictool` requires full Xcode (not Command Line Tools):
```
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```
Without this, `ictool` fails with "tool requires Xcode" error.
