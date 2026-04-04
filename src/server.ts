#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createIcon, addLayerToBundle, removeFromBundle, inspectBundle } from './lib/ops-bundle';
import { setGlassEffects, setAppearances, setFill, setLayerPosition, toggleFx } from './lib/ops-glass';
import { exportPreview, renderLiquidGlass, exportMarketing } from './lib/ops-render';

const server = new McpServer(
  {
    name: 'icon-composer',
    version: '1.0.0',
  },
  {
    instructions: `You are connected to icon-composer-mcp, a server for creating Apple .icon bundles with Liquid Glass effects for iOS 26+.

## Typical Workflow

1. **create_icon** — Start here. Provide a foreground image (PNG or SVG) and a background color. Returns a .icon bundle path.
2. **add_layer_to_icon** — Add additional layers (overlays, badges, backgrounds) to existing bundles.
3. **set_fill** — Change background fill (solid color, gradient, automatic, or none).
4. **set_glass_effects** — Configure Liquid Glass: specular highlights, blur material, shadows, translucency.
5. **set_appearances** — Add dark mode or tinted mode overrides for the background fill or group properties.
6. **export_preview** — Render a preview PNG. Uses Apple's ictool for Liquid Glass rendering when available, falls back to flat composite.
7. **export_marketing** — Export a flat 1024x1024 PNG with no alpha channel for App Store Connect.

## Key Concepts

- A .icon bundle contains groups of layers. Each group has glass effects (specular, shadow, blur, translucency). Each layer has an image, scale, position, and opacity.
- **scale=1.0** is the standard glyph size (~65% of icon area in Apple's renderer). Use 0.5 for smaller, 1.5+ for larger.
- **Glass effects** only render visually when using ictool (macOS with Icon Composer.app installed). Flat previews show the composition without glass.
- Always call **export_preview** after making changes so the user can see the result.
- For App Store submission, use **export_marketing** to get an alpha-free PNG that won't be rejected (ITMS-90717).

## Tips

- SVG glyphs should use <path> elements, not <text> (Icon Composer warns on text elements).
- When the user asks to "create an icon", start with create_icon, show a preview, then iterate on glass effects and appearance.
- Use read_icon to inspect an existing bundle before modifying it.
- set_layer_position adjusts glyph scale and offset within the icon.
- toggle_fx quickly enables/disables all glass effects for comparison.`,
  },
);

// ── Tool: create_icon ──
server.tool(
  'create_icon',
  'Create an Apple Icon Composer .icon bundle from a foreground image and background color. Outputs a ready-to-use .icon bundle for Xcode 26.',
  {
    foreground_path: z.string().describe('Absolute path to foreground image (PNG or SVG)'),
    output_dir: z.string().describe('Directory to write the .icon bundle to'),
    bundle_name: z.string().default('AppIcon').describe('Name for the .icon bundle (without extension)'),
    bg_color: z.string().describe('Background color as hex (e.g. #0A66C2)'),
    dark_bg_color: z.optional(z.string()).describe('Dark mode background color as hex'),
    glyph_scale: z.number().min(0.1).max(2.0).default(1.0).describe('Scale of foreground glyph (0.1-2.0, default 1.0 fills ~65% of icon area in Icon Composer)'),
    specular: z.boolean().default(true).describe('Enable specular highlights (Liquid Glass)'),
    shadow_kind: z.enum(['neutral', 'layer-color', 'none']).default('layer-color').describe('Shadow type'),
    shadow_opacity: z.number().min(0).max(1).default(0.5).describe('Shadow opacity'),
    blur_material: z.optional(z.number().min(0).max(1)).describe('Liquid Glass blur amount (0-1, omit to disable)'),
    translucency_enabled: z.boolean().default(false).describe('Enable translucency gradient'),
    translucency_value: z.number().min(0).max(1).default(0.4).describe('Translucency amount (0-1)'),
    split_layers: z.boolean().default(true).describe('Split multi-shape SVGs into separate glass layers (each shape gets independent glass effects)'),
  },
  async (params) => createIcon(params),
);

// ── Tool: add_layer_to_icon ──
server.tool(
  'add_layer_to_icon',
  'Add a new layer to an existing .icon bundle. Creates a new group or adds to an existing one.',
  {
    bundle_path: z.string().describe('Path to existing .icon bundle'),
    image_path: z.string().describe('Path to image file to add as layer'),
    layer_name: z.string().describe('Name for the layer'),
    group_index: z.number().default(0).describe('Group index to add to (0-based, default 0)'),
    create_group: z.boolean().default(false).describe('Create a new group for this layer'),
    opacity: z.number().min(0).max(1).default(1.0).describe('Layer opacity'),
    scale: z.number().min(0.1).max(2.0).default(1.0).describe('Layer scale'),
    offset_x: z.number().default(0).describe('X offset in points'),
    offset_y: z.number().default(0).describe('Y offset in points'),
    blend_mode: z.enum([
      'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
      'color-dodge', 'color-burn', 'soft-light', 'hard-light',
      'difference', 'exclusion', 'plus-darker', 'plus-lighter',
    ]).default('normal').describe('Blend mode'),
    glass: z.boolean().default(true).describe('Participate in Liquid Glass effects'),
  },
  async (params) => addLayerToBundle(params),
);

// ── Tool: remove_layer ──
server.tool(
  'remove_layer',
  'Remove a layer or entire group from an .icon bundle. Optionally cleans up orphaned asset files.',
  {
    bundle_path: z.string().describe('Path to .icon bundle'),
    target: z.enum(['layer', 'group']).describe('Whether to remove a single layer or an entire group'),
    group_index: z.number().describe('Group index (0-based)'),
    layer_index: z.optional(z.number()).describe('Layer index within the group (0-based, required when target=layer)'),
    cleanup_assets: z.boolean().default(true).describe('Delete orphaned asset files from the Assets directory'),
  },
  async (params) => removeFromBundle(params),
);

// ── Tool: set_glass_effects ──
server.tool(
  'set_glass_effects',
  'Configure Liquid Glass effects (specular, blur, shadow, translucency) on a layer group in an existing .icon bundle.',
  {
    bundle_path: z.string().describe('Path to .icon bundle'),
    group_index: z.number().default(0).describe('Group index to modify (0-based)'),
    specular: z.optional(z.boolean()).describe('Enable/disable specular highlights'),
    blur_material: z.optional(z.number().min(0).max(1).nullable()).describe('Blur amount (0-1, null to disable)'),
    shadow_kind: z.optional(z.enum(['neutral', 'layer-color', 'none'])).describe('Shadow type'),
    shadow_opacity: z.optional(z.number().min(0).max(1)).describe('Shadow opacity'),
    translucency_enabled: z.optional(z.boolean()).describe('Enable translucency'),
    translucency_value: z.optional(z.number().min(0).max(1)).describe('Translucency amount'),
    opacity: z.optional(z.number().min(0).max(1)).describe('Group opacity'),
    blend_mode: z.optional(z.enum([
      'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
      'color-dodge', 'color-burn', 'soft-light', 'hard-light',
      'difference', 'exclusion', 'plus-darker', 'plus-lighter',
    ])).describe('Blend mode'),
    lighting: z.optional(z.enum(['combined', 'individual'])).describe('Lighting mode'),
  },
  async (params) => setGlassEffects(params),
);

// ── Tool: set_appearances ──
server.tool(
  'set_appearances',
  'Set dark mode or tinted mode appearance overrides for the icon background fill or layer group properties.',
  {
    bundle_path: z.string().describe('Path to .icon bundle'),
    target: z.enum(['fill', 'group']).describe('What to set appearance on'),
    group_index: z.number().default(0).describe('Group index (only for target=group)'),
    appearance: z.enum(['dark', 'tinted']).describe('Appearance mode'),
    bg_color: z.optional(z.string()).describe('Background color hex for this appearance'),
    specular: z.optional(z.boolean()).describe('Specular for this appearance'),
    shadow_kind: z.optional(z.enum(['neutral', 'layer-color', 'none'])).describe('Shadow kind'),
    shadow_opacity: z.optional(z.number().min(0).max(1)).describe('Shadow opacity'),
    opacity: z.optional(z.number().min(0).max(1)).describe('Group opacity'),
  },
  async (params) => setAppearances(params),
);

// ── Tool: export_preview ──
server.tool(
  'export_preview',
  'Render a preview of an .icon bundle. Uses Apple\'s ictool for Liquid Glass rendering by default (falls back to flat composite if Icon Composer is not installed). Supports canvas backgrounds and zoom.',
  {
    bundle_path: z.string().describe('Path to .icon bundle'),
    output_path: z.string().describe('Output path for the PNG file'),
    size: z.number().min(16).max(2048).default(1024).describe('Output size in pixels'),
    appearance: z.optional(z.enum(['dark', 'tinted'])).describe('Appearance mode to preview (omit for default/light)'),
    flat: z.boolean().default(false).describe('Force flat composite rendering (skip ictool/Liquid Glass)'),
    canvas_bg: z.optional(z.enum(['none', 'light', 'dark', 'checkerboard', 'homescreen-light', 'homescreen-dark'])).describe('Simple preset canvas background'),
    apple_preset: z.optional(z.enum(['sine-purple-orange', 'sine-gasflame', 'sine-magenta', 'sine-green-yellow', 'sine-purple-orange-black', 'sine-gray'])).describe('Apple Icon Composer preset background (overrides canvas_bg)'),
    canvas_bg_color: z.optional(z.string()).describe('Custom hex color for canvas background'),
    canvas_bg_image: z.optional(z.string()).describe('Path to custom background image'),
    zoom: z.number().min(0.1).max(3.0).default(1.0).describe('Zoom level — icon size relative to canvas (1.0 = full canvas, 0.5 = half size)'),
  },
  async (params) => exportPreview(params),
);

// ── Tool: read_icon ──
server.tool(
  'read_icon',
  'Read and inspect an existing .icon bundle. Returns the manifest JSON and list of assets.',
  {
    bundle_path: z.string().describe('Path to .icon bundle'),
  },
  async (params) => inspectBundle(params),
);

// ── Tool: set_fill ──
server.tool(
  'set_fill',
  'Set the background fill of an .icon bundle. Supports solid colors and gradients.',
  {
    bundle_path: z.string().describe('Path to .icon bundle'),
    fill_type: z.enum(['solid', 'gradient', 'automatic', 'none']).describe('Fill type'),
    color: z.optional(z.string()).describe('Hex color for solid fill or gradient bottom'),
    color2: z.optional(z.string()).describe('Second hex color for gradient top'),
    gradient_angle: z.number().default(0).describe('Gradient angle in degrees (0 = bottom to top)'),
  },
  async (params) => setFill(params),
);

// ── Tool: set_layer_position ──
server.tool(
  'set_layer_position',
  'Set the scale (zoom) and offset of a layer or group within the .icon bundle. Use to zoom the glyph in/out or reposition it.',
  {
    bundle_path: z.string().describe('Path to .icon bundle'),
    target: z.enum(['layer', 'group']).default('layer').describe('Whether to set position on a layer or group'),
    group_index: z.number().default(0).describe('Group index (0-based)'),
    layer_index: z.optional(z.number()).describe('Layer index within the group (0-based, required for target=layer)'),
    scale: z.optional(z.number().min(0.05).max(3.0)).describe('Scale factor (0.05-3.0, where 1.0 = full size, 0.5 = half, 2.0 = double)'),
    offset_x: z.optional(z.number()).describe('X offset in points'),
    offset_y: z.optional(z.number()).describe('Y offset in points'),
  },
  async (params) => setLayerPosition(params),
);

// ── Tool: toggle_fx ──
server.tool(
  'toggle_fx',
  'Enable or disable all Liquid Glass effects (specular, shadow, blur, translucency) on every group in the .icon bundle at once.',
  {
    bundle_path: z.string().describe('Path to .icon bundle'),
    enabled: z.boolean().describe('true to enable all FX, false to disable'),
  },
  async (params) => toggleFx(params),
);

// ── Tool: render_liquid_glass ──
server.tool(
  'render_liquid_glass',
  'Render a pixel-perfect Liquid Glass preview using Apple\'s ictool. Produces the exact same rendering as iOS 26. Requires Icon Composer.app installed.',
  {
    bundle_path: z.string().describe('Path to .icon bundle'),
    output_path: z.string().describe('Output path for the PNG file'),
    platform: z.enum(['iOS', 'macOS', 'watchOS']).default('iOS').describe('Target platform'),
    rendition: z.enum(['Default', 'Dark', 'TintedLight', 'TintedDark', 'ClearLight', 'ClearDark']).default('Default').describe('Appearance rendition'),
    width: z.number().min(16).max(2048).default(1024).describe('Output width in pixels'),
    height: z.number().min(16).max(2048).default(1024).describe('Output height in pixels'),
    scale: z.number().min(1).max(3).default(1).describe('Scale factor (1x, 2x, 3x)'),
    light_angle: z.optional(z.number().min(0).max(360)).describe('Light angle in degrees (0-360). Controls direction of specular highlights and shadows.'),
    tint_color: z.optional(z.number().min(0).max(1)).describe('Tint hue (0-1) for tinted renditions'),
    tint_strength: z.optional(z.number().min(0).max(1)).describe('Tint strength (0-1) for tinted renditions'),
    canvas_bg: z.optional(z.enum(['none', 'light', 'dark', 'checkerboard', 'homescreen-light', 'homescreen-dark'])).describe('Simple preset canvas background'),
    apple_preset: z.optional(z.enum(['sine-purple-orange', 'sine-gasflame', 'sine-magenta', 'sine-green-yellow', 'sine-purple-orange-black', 'sine-gray'])).describe('Apple Icon Composer preset background (overrides canvas_bg)'),
    canvas_bg_color: z.optional(z.string()).describe('Custom hex color for canvas background'),
    canvas_bg_image: z.optional(z.string()).describe('Path to custom background image'),
    zoom: z.number().min(0.1).max(3.0).default(1.0).describe('Zoom level — icon size relative to canvas (1.0 = full canvas, 0.5 = half size)'),
  },
  async (params) => renderLiquidGlass(params),
);

// ── Tool: export_marketing ──
server.tool(
  'export_marketing',
  'Export a flat marketing PNG for App Store Connect. No Liquid Glass effects, no alpha channel. Produces a 1024x1024 (default) opaque PNG ready for upload.',
  {
    bundle_path: z.string().describe('Path to .icon bundle'),
    output_path: z.string().describe('Output path for the PNG file'),
    size: z.number().min(16).max(2048).default(1024).describe('Output size in pixels (default 1024)'),
  },
  async (params) => exportMarketing(params),
);

// ── Prompts ──

server.prompt(
  'create-app-icon',
  'Create an app icon from a logo image with Liquid Glass effects',
  {
    image_path: z.string().describe('Path to the logo/glyph image (PNG or SVG)'),
    output_dir: z.string().describe('Directory to save the .icon bundle'),
    brand_color: z.string().describe('Primary brand color as hex (e.g. #0A66C2)'),
    dark_color: z.string().optional().describe('Dark mode background color (optional)'),
  },
  async (params) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Create an Apple app icon with Liquid Glass effects using these details:
- Logo/glyph image: ${params.image_path}
- Output directory: ${params.output_dir}
- Brand color: ${params.brand_color}${params.dark_color ? `\n- Dark mode color: ${params.dark_color}` : ''}

Steps:
1. Call create_icon with the image, output dir, and brand color as bg_color${params.dark_color ? `, dark_bg_color "${params.dark_color}"` : ''}
2. Call export_preview to render a Liquid Glass preview and show it to me (this is the default — do NOT pass flat: true)
3. Call export_preview with canvas_bg_color set to the brand color to show the icon on a matching background
4. Ask if I want to adjust glass effects, scale, or colors
5. When I'm happy, call export_marketing for the App Store PNG`,
      },
    }],
  }),
);

server.prompt(
  'add-dark-mode',
  'Add dark mode appearance to an existing icon',
  {
    bundle_path: z.string().describe('Path to the .icon bundle'),
    dark_color: z.string().describe('Dark mode background color as hex'),
  },
  async (params) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Add dark mode to the icon at ${params.bundle_path}:
1. Call read_icon to see the current state
2. Call set_appearances with target "fill", appearance "dark", bg_color "${params.dark_color}"
3. Call export_preview with appearance "dark" to show the dark mode version
4. Show both light and dark previews side by side for comparison`,
      },
    }],
  }),
);

server.prompt(
  'export-for-app-store',
  'Export all required assets for App Store submission',
  {
    bundle_path: z.string().describe('Path to the .icon bundle'),
    output_dir: z.string().describe('Directory for exported files'),
  },
  async (params) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Export App Store assets from ${params.bundle_path}:
1. Call export_marketing with output_path "${params.output_dir}/marketing-1024.png" — this is the flat 1024x1024 PNG required by App Store Connect (no alpha channel)
2. Call export_preview with size 512 to generate a preview for review
3. If dark mode is configured, also export a dark mode preview
4. Remind the user that the .icon bundle itself goes into the Xcode project's asset catalog`,
      },
    }],
  }),
);

// ── Export for testing ──
export { server };

// ── Start server (only when run directly, not imported) ──
// Check both Bun's import.meta.main and Node's argv pattern
const isMain = (typeof globalThis.Bun !== 'undefined' && (import.meta as any).main)
  || process.argv[1]?.replace(/\\/g, '/').match(/\/server\.(js|ts)$/);
if (isMain) {
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    process.stderr.write(`Fatal: could not connect transport: ${err}\n`);
    process.exit(1);
  });
}
