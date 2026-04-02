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

## High Priority

- [ ] Glyph rotation (degrees 0-360) — investigate if .icon manifest supports natively or if pre-rotation needed
- [ ] Layer/group reordering (change Z-order within a group, reorder groups)
- [ ] Hidden state management (hide/show layers/groups, per-appearance visibility)
- [ ] Radial gradient support (only linear gradients implemented)
- [ ] Clear rendition backgrounds — ictool bakes gray bg into ClearLight/ClearDark, need workaround for colored canvas compositing

## Medium Priority — Appearance Specializations

- [ ] Tinted appearance specializations for group properties (shadow, specular, blur-material, translucency)
- [ ] Per-appearance layer blend modes (`blend-mode-specializations`)
- [ ] Per-appearance layer opacity (`opacity-specializations`)
- [ ] Per-appearance layer positioning (`position-specializations`)
- [ ] Per-appearance layer visibility (`hidden-specializations`)
- [ ] Group translucency specializations per appearance
- [ ] Group blur-material specializations per appearance
- [ ] Group opacity specializations per appearance
- [ ] Idiom specializations (square vs watchOS variants)

## Medium Priority — MCP & Release

- [ ] MCP tool instructions/prompts (teach agents how to use effectively)
- [ ] Package.json bin entry for CLI
- [ ] README with usage examples
- [ ] npm publish prep

## Low Priority — Polish

- [ ] Per-layer fill control (currently only group-level background fills exposed)
- [ ] Per-layer opacity control via CLI (types support it, ops support it, no CLI flag)
- [ ] Lighting mode control (`combined` vs `individual`)
- [ ] SVG color space tagging (`color-space-for-untagged-svg-colors`)
- [ ] Platform-specific icon variants (iOS, macOS, watchOS, shared)
- [ ] Gradient angle validation/clamping (0-360)

## Known Limitations

- ClearLight/ClearDark renditions: ictool renders against gray — Apple's glass transparency requires Metal GPU pipeline not available via CLI
- blur-material effect: only visible against textured/gradient backgrounds, not solid colors
- ictool scale: Apple's internal scale=1.0 ≈ 65% of icon area, corrected with 1.54x factor for canvas renders only
