# icon-composer-mcp — TODO

## Completed (this session)

- [x] CLI-first restructure: lib/ → ops/ → cli.ts → server.ts (thin MCP wrapper)
- [x] 142 unit tests, 73 visual tests with HTML gallery
- [x] Flat renderer: gradient fills, automatic fills, none/transparent fills
- [x] Flat renderer: auto-trim transparent padding (scale=1.0 means content fills area)
- [x] Flat renderer: oversized layer cropping (scale > canvas handled gracefully)
- [x] ictool rendering: crop squircle shape for content-only preview
- [x] ictool rendering: keep squircle when canvas background is used
- [x] ictool scale correction (1.54x) for canvas/preset renders only
- [x] Apple preset backgrounds: center-crop 20% for proper zoom level
- [x] Apple preset compositing: same icon size as regular canvas backgrounds
- [x] Dark mode fill-specializations working in flat renderer
- [x] toggle_fx preserves blur-material values
- [x] Visual test harness with PASS/FAIL toggles and JSON export

---

## P0 — Critical (Security & Compatibility)

### Security fixes
- [ ] **Path traversal via layer_name** — `addLayerToBundle` constructs filenames from user input without sanitization. `../../etc/malicious.png` escapes the bundle directory. Fix: `path.basename()` + character whitelist on all user-supplied filenames.
- [ ] **Asset size bomb** — `readIconBundle` reads all files in Assets/ into memory unconditionally. A 500MB PNG would exhaust memory. Fix: check `fs.stat().size` before reading, reject above configurable limit (default 20MB).
- [ ] **Temp file leak** — `renderWithIctoolScaled` doesn't clean up temp files in `finally` block if ictool throws. Move all `unlink` calls to `finally`.

### Apple compatibility
- [ ] **Validate .icon bundles open in Apple's Icon Composer** — open our generated bundles in the real app and confirm they render correctly. This blocks everything.
- [ ] **Round-trip fidelity** — read a bundle created by Apple's Icon Composer, modify it, write back. Verify we preserve all fields Apple sets (including any undocumented properties we might be dropping). Diff our output against Apple's.
- [ ] **Alpha channel auto-strip** — App Store rejects icons with alpha channels (ITMS-90717). Strip alpha from all PNGs written to bundle. 10 lines of sharp code, saves every developer a deploy cycle.
- [ ] **Flat 1024x1024 PNG export for App Store Connect** — App Store marketing icon is a separate flat PNG (no glass effects, no alpha). `icon-composer export-marketing` should produce this alongside the .icon bundle.

---

## P1 — High Priority (Core Features)

### Format gaps (from Apple schema analysis)
- [ ] **Layer glass-specializations** — per-appearance glass participation (e.g. `glass: true` for light, `glass: false` for dark). Used in literally every real production icon. This is the biggest schema gap.
- [ ] **Layer opacity-specializations** — per-appearance opacity. Universally used in real icons instead of flat `opacity`.
- [ ] **Layer blend-mode-specializations** — different blend mode per appearance. Seen in gb-studio, Horizon, Spacedrive icons.
- [ ] **Layer fill-specializations** — already typed but not exposed via MCP tools or CLI.
- [ ] **Layer hidden-specializations** — per-idiom visibility (e.g. hidden on watchOS but visible on iOS).
- [ ] **Layer position-specializations** — per-idiom positioning (different offsets for watchOS vs iOS).
- [ ] **Group hidden field** — not settable via any tool. Used in real icons (Turntable has hidden groups).
- [ ] **Layer hidden field** — not settable via add_layer or any tool.
- [ ] **automatic-gradient fill type** — `{ "automatic-gradient": colorString }` where top color is auto-calculated. Used in Turntable, Horizon, gb-studio icons. Missing from `setFill` and `set_fill` MCP tool.
- [ ] **orientation optional on LinearGradientFill** — Apple's schema marks it optional (omit for default top-to-bottom). Our type requires it, producing noisier output than Icon Composer.

### Image ingestion
- [ ] **Smart background removal** — auto-detect and remove non-transparent backgrounds (white bg on JPG logos). Most common developer pain point.
- [ ] **Large image downscaling at ingest** — cap stored assets at 2048px max dimension. A 10000x10000 input decodes to ~400MB raw pixels twice per layer during rendering.
- [ ] **Non-square image squaring at ingest** — pad to square before writing to Assets/ so scale math is consistent between flat renderer and ictool.
- [ ] **HEIC/HEIF detection** — detect and return actionable error instead of raw sharp crash.
- [ ] **Animated GIF/APNG warning** — detect `metadata.pages > 1` and warn that only first frame is used.

### Glyph generation
- [ ] **SF Symbols as glyphs** — `--glyph-symbol "star.fill"`. Most Apple icons use SF Symbols. No other CLI/MCP tool does this. Render via Swift helper or pre-rasterized symbol atlas.
- [ ] **Text/letter glyphs** — `--glyph-text "A" --font "SF Pro" --weight bold`. Covers monogram app icons (Notion, Linear, Bear pattern).
- [ ] **Glyph from URL** — `--glyph-url` to fetch from URL directly. Enables AI image generation → icon pipeline without touching filesystem.
- [ ] **Glyph tinting** — color tint/overlay preserving luminance/detail.
- [ ] **Glyph recoloring** — replace all colors with single solid, preserving alpha channel (white silhouette mode).

### Rendering & preview
- [ ] **Inline image return** — `preview_inline: true` returns base64 PNG in MCP response. Eliminates extra tool call for agents to show users the result. Single most impactful agent UX improvement.
- [ ] **Four appearance modes** — iOS 26 has Default, Dark, Clear, Tinted (not just 3). Clear mode needs mono white layer. Full six-rendition matrix: Default, Dark, ClearLight, ClearDark, TintedLight, TintedDark.
- [ ] **Mono white layer auto-generation** — for Clear/Tinted modes, auto-generate a white silhouette layer from the foreground glyph. Without this, Clear icons are unrecognizable.
- [ ] **Accessibility preview** — show what icon looks like with Reduce Transparency enabled (glass effects removed, near-flat rendering). Users need to verify legibility without glass.
- [ ] **Small-size legibility preview** — render at 29pt, 20pt to simulate Notification and Settings contexts.

### Migration & import
- [ ] **Import from AppIcon.appiconset** — migration tool for Xcode 26 upgrade. Read Contents.json + sized PNGs, reconstruct as .icon bundle. Every existing iOS app needs this.
- [ ] **Import from existing .icon bundles** — full round-trip read → modify → write back without dropping fields.
- [ ] **Legacy+modern dual output** — generate both .icon bundle AND AppIcon.appiconset from same source for backward compatibility with iOS 18.

---

## P2 — Medium Priority (Differentiation & Polish)

### Agent workflow improvements
- [ ] **Named layer/group targeting** — `target_name: "Foreground"` as alternative to fragile numeric indices. Multi-step agent workflows break when indices shift.
- [ ] **read_icon hex summary** — translate Apple's `srgb:0.03922,0.40000,0.76078,1.00000` to `#0A66C2` in inspect output. Agent-friendly color format.
- [ ] **extract_colors_from_image tool** — return dominant, vibrant, muted, accessible-contrast colors from a glyph image. Enables brand-aware icon creation.
- [ ] **Semantic color adjustment** — `adjust_fill` tool with `lighten`, `darken`, `saturate`, `desaturate`, `shift_hue` operations instead of requiring hex math.
- [ ] **MCP resource guide** — `icon-composer://guide` resource with workflow-oriented documentation, recommended call sequences, gotcha notes.
- [ ] **Dark/tinted auto-generation** — take light icon, produce smart dark/tinted variants (invert + desaturate for tinted, dark-bg + light-foreground for dark). Addresses documented pain across Expo, React Native, .NET MAUI ecosystems.

### Batch & variant operations
- [ ] **Batch variant generation** — `icon-composer clone base.icon --variants '[{"bg_color":"#FF0000"},{"bg_color":"#0066CC"}]'`. Produces N named variants. Enables A/B testing for App Store Product Page Optimization.
- [ ] **Clone/duplicate with modifications** — `icon-composer clone bundle.icon --bg-color "#FF0000"`.
- [ ] **Alternate icon sets** — generate family of related icons for iOS alternate app icon support.
- [ ] **Compare previews** — composite two icon variants into a single side-by-side image for A/B review.

### Export & format
- [ ] **Multi-size export** — `icon-composer export-all` generates all required sizes for all platforms in one command.
- [ ] **Legacy format export** — AppIcon.appiconset (older Xcode), .icns (macOS), favicon .ico (web).
- [ ] **Xcode project integration** — auto-add .icon bundle to xcassets/project file.

### Validation & safety
- [ ] **validate_icon tool** — structured report: `{ valid: boolean, errors: [], warnings: [] }`. Check: empty groups, orphaned assets, missing referenced assets, duplicate specializations, out-of-range values. Auto-run before ictool export.
- [ ] **Apple HIG safe zone validation** — warn if glyph extends outside recommended safe area (72dp vs 108dp canvas).
- [ ] **Color contrast validation** — WCAG 3:1 minimum between fill and dominant glyph color. Check via sharp `stats()`.
- [ ] **saveManifest atomic write** — copy `icon.json` to `icon.json.bak` before every write. One-liner, enables manual recovery.
- [ ] **Snapshot/restore MCP tools** — checkpoint before risky changes, rollback on demand.

### Color management
- [ ] **Display P3 color space** — expose `color_space` param on `create_icon`/`set_fill`. `hexToIconColor` already accepts colorSpace arg, just needs wiring. Relevant for games/creative apps on ProMotion displays.
- [ ] **color-space-for-untagged-svg-colors** — expose in create_icon. Currently typed but hidden.
- [ ] **iOS-only / macOS-only platforms** — `createManifest` only writes `"shared"`. Some icons need `["macOS"]` only.

### Appearance specializations (group level)
- [ ] Tinted appearance for group shadow, specular, blur-material, translucency
- [ ] Per-appearance group blend modes, opacity, lighting
- [ ] Group position-specializations

---

## P3 — Nice to Have (Future)

### Platform support
- [ ] **visionOS icon format** — completely separate from .icon (circular shape, Front/Back layers, opaque bottom layer). Needs its own create/export path.
- [ ] **tvOS layered icon** — fully opaque bottom layer, multiple layers for parallax. Separate from .icon format.
- [ ] **watchOS upload bug** — flag known App Store Connect issue to users when targeting watchOS.
- [ ] **CarPlay appearance modes** — Default, Dark, Clear (Tinted appears iOS-only).

### Developer experience
- [ ] **icon-composer diff** — CLI command comparing two .icon bundles semantically (not binary diff).
- [ ] **icon_to_spec / spec_to_icon** — portable JSON spec format for multi-agent handoffs with hex colors instead of Apple's internal format.
- [ ] **Theme/brand files** — `.icontheme` JSON defining color palette + effect settings, reusable across icons.
- [ ] **Transaction history** — `.icon-history/` directory with timestamped manifest copies, max 10 entries.
- [ ] **.gitattributes recommendation** — document `*.icon/Assets/* binary -diff` in README.

### Performance
- [ ] **Apple preset JPEG cache** — cache resized preset backgrounds in memory. 6 presets × 3MB = 18MB, eliminates repeated 8192px decodes.
- [ ] **Buffer reuse** — avoid decoding the same asset twice in renderPreview (once for trim, once for resize).

### SVG generation
- [ ] Built-in SVG glyph generator — common shapes (circles, rounded rects, shields, badges, text labels) as SVG. Enables fully programmatic icon creation without external files.

### Wallpaper-aware preview
- [ ] `--wallpaper-path` on export_preview — composite rendered icon against a real wallpaper image to show actual home screen appearance.

---

## Known Limitations

- ClearLight/ClearDark renditions: ictool renders against gray — Apple's glass transparency requires Metal GPU pipeline not available via CLI
- blur-material effect: only visible against textured/gradient backgrounds, not solid colors
- ictool scale: Apple's internal scale=1.0 ≈ 65% of icon area, corrected with 1.54x factor for canvas renders only
- Flat renderer vs ictool color accuracy: P3-tagged assets render slightly differently (flat converts to sRGB, ictool honors ICC profile)
- Localization: .icon format has no per-locale mechanism — region-specific icons require multiple .icon bundles at the Xcode asset catalog level
- visionOS and tvOS use separate icon formats, not .icon bundles
