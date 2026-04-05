import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sharp from 'sharp';
import { createManifest, addGroup, addLayer } from './lib/manifest';
import { writeIconBundle, readIconBundle, saveManifest } from './lib/bundle';
import { renderPreview, compositeOnBackground, type ApplePresetName } from './lib/render';
import { ictoolAvailable, renderWithIctool } from './lib/ictool';
import { setFill } from './lib/ops-glass';
import { exportPreview, renderLiquidGlass } from './lib/ops-render';
import type { BlendMode } from './types';

// ── Types ──

interface VisualTestCase {
  id: string;
  category: string;
  description: string;
  command: string;
  filename: string;
}

interface TestResult {
  id: string;
  category: string;
  description: string;
  command: string;
  filename: string;
  success: boolean;
  error?: string;
}

// ── Glyph generation ──

async function createWhiteCircleGlyph(): Promise<Buffer> {
  // Circle fills the full 512x512 — no transparent padding.
  // This ensures scale values are meaningful for both flat renderer and ictool.
  return sharp(Buffer.from(
    '<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="white"/></svg>'
  )).png().toBuffer();
}

async function createRedSquareGlyph(): Promise<Buffer> {
  // Square fills the full 512x512
  return sharp(Buffer.from(
    '<svg width="512" height="512"><rect width="512" height="512" fill="red" rx="20"/></svg>'
  )).png().toBuffer();
}

async function createBlueCircleGlyph(): Promise<Buffer> {
  return sharp(Buffer.from(
    '<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="#0055CC"/></svg>'
  )).png().toBuffer();
}

// ── Helper: create a base icon bundle ──

async function createBaseBundle(
  tmpDir: string,
  name: string,
  glyphBuffer: Buffer,
  options: {
    bgColor?: string;
    darkBgColor?: string;
    glyphScale?: number;
    specular?: boolean;
    shadowKind?: 'neutral' | 'layer-color' | 'none';
    shadowOpacity?: number;
    blurMaterial?: number | null;
    translucencyEnabled?: boolean;
    translucencyValue?: number;
    glass?: boolean;
  } = {}
): Promise<string> {
  const glyphPath = path.join(tmpDir, `${name}-glyph.png`);
  await fs.writeFile(glyphPath, glyphBuffer);

  const manifest = createManifest({
    fill: options.bgColor ?? '#0A66C2',
    darkFill: options.darkBgColor,
    platforms: { squares: true, circles: true },
  });

  const group = addGroup(manifest, {
    name: 'Foreground',
    specular: options.specular ?? true,
    shadow: {
      kind: options.shadowKind ?? 'layer-color',
      opacity: options.shadowOpacity ?? 0.5,
    },
    blurMaterial: options.blurMaterial ?? null,
    translucency: options.translucencyEnabled
      ? { enabled: true, value: options.translucencyValue ?? 0.4 }
      : undefined,
  });

  addLayer(group, {
    imageName: 'foreground.png',
    name: 'glyph',
    scale: options.glyphScale ?? 0.65,
    glass: options.glass ?? true,
  });

  const assets = new Map<string, Buffer>();
  assets.set('foreground.png', glyphBuffer);

  return writeIconBundle(tmpDir, name, manifest, assets);
}

// ── Helper: render a preview from a bundle path ──

async function renderFlatPreview(bundlePath: string, outputPath: string, size: number = 512, appearance?: 'dark' | 'tinted'): Promise<void> {
  const { manifest, assets } = await readIconBundle(bundlePath);
  const buffer = await renderPreview(manifest, assets, size, appearance);
  await fs.writeFile(outputPath, buffer);
}

// ── Helper: render with canvas background ──

async function renderWithCanvas(
  bundlePath: string,
  outputPath: string,
  canvasBg: Parameters<typeof compositeOnBackground>[1],
  size: number = 512,
  zoom: number = 1.0,
  appearance?: 'dark' | 'tinted'
): Promise<void> {
  const { manifest, assets } = await readIconBundle(bundlePath);
  let iconBuffer = await renderPreview(manifest, assets, size, appearance);

  if (zoom > 1.0) {
    // For zoom > 1.0: scale the icon up, then crop center to canvas size
    const scaledSize = Math.round(size * zoom);
    const scaledIcon = await sharp(iconBuffer)
      .resize(scaledSize, scaledSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    // Resolve background at canvas size
    const { resolveCanvasBackground } = await import('./lib/render');
    const bgBuffer = await resolveCanvasBackground(canvasBg, size);

    // Extract center crop from scaled icon
    const cropOffset = Math.round((scaledSize - size) / 2);
    const croppedIcon = await sharp(scaledIcon)
      .extract({ left: cropOffset, top: cropOffset, width: size, height: size })
      .png()
      .toBuffer();

    if (bgBuffer) {
      const result = await sharp(bgBuffer)
        .composite([{ input: croppedIcon }])
        .png()
        .toBuffer();
      await fs.writeFile(outputPath, result);
    } else {
      await fs.writeFile(outputPath, croppedIcon);
    }
  } else {
    const iconSize = Math.round(size * zoom);
    const buffer = await compositeOnBackground(iconBuffer, canvasBg, size, iconSize);
    await fs.writeFile(outputPath, buffer);
  }
}

// ── Test case definitions ──

function defineTestCases(hasIctool: boolean, hasApplePresets: boolean): VisualTestCase[] {
  const cases: VisualTestCase[] = [];

  // Category 1: Background Fill
  cases.push(
    { id: 'fill-solid-blue', category: 'Background Fill', description: 'Blue LinkedIn-style background with white circle glyph centered at 65% scale', command: 'icon-composer create glyph.png ./out --bg-color "#0A66C2"', filename: 'fill-solid-blue.png' },
    { id: 'fill-solid-red', category: 'Background Fill', description: 'Bright red background', command: 'icon-composer create glyph.png ./out --bg-color "#FF0000"', filename: 'fill-solid-red.png' },
    { id: 'fill-solid-black', category: 'Background Fill', description: 'Black background', command: 'icon-composer create glyph.png ./out --bg-color "#000000"', filename: 'fill-solid-black.png' },
    { id: 'fill-solid-white', category: 'Background Fill', description: 'White background, glyph may be hard to see', command: 'icon-composer create glyph.png ./out --bg-color "#FFFFFF"', filename: 'fill-solid-white.png' },
    { id: 'fill-gradient-vertical', category: 'Background Fill', description: 'Red at bottom fading to blue at top', command: 'icon-composer fill bundle.icon --type gradient --color "#FF0000" --color2 "#0000FF" --gradient-angle 0', filename: 'fill-gradient-vertical.png' },
    { id: 'fill-gradient-horizontal', category: 'Background Fill', description: 'Red on left fading to blue on right', command: 'icon-composer fill bundle.icon --type gradient --color "#FF0000" --color2 "#0000FF" --gradient-angle 90', filename: 'fill-gradient-horizontal.png' },
    { id: 'fill-gradient-diagonal', category: 'Background Fill', description: 'Red at bottom-left to blue at top-right', command: 'icon-composer fill bundle.icon --type gradient --color "#FF0000" --color2 "#0000FF" --gradient-angle 45', filename: 'fill-gradient-diagonal.png' },
    { id: 'fill-automatic', category: 'Background Fill', description: 'System-determined fill', command: 'icon-composer fill bundle.icon --type automatic', filename: 'fill-automatic.png' },
    { id: 'fill-none', category: 'Background Fill', description: 'No background fill (transparent)', command: 'icon-composer fill bundle.icon --type none', filename: 'fill-none.png' },
  );

  // Category 2: Dark Mode
  cases.push(
    { id: 'dark-mode-light', category: 'Dark Mode', description: 'White background with blue circle glyph', command: 'icon-composer preview bundle.icon out.png', filename: 'dark-mode-light.png' },
    { id: 'dark-mode-dark', category: 'Dark Mode', description: 'Black background with blue circle glyph', command: 'icon-composer preview bundle.icon out.png --appearance dark', filename: 'dark-mode-dark.png' },
    { id: 'dark-mode-blue-light', category: 'Dark Mode', description: 'Bright blue', command: 'icon-composer preview bundle.icon out.png (light fill #0A66C2)', filename: 'dark-mode-blue-light.png' },
    { id: 'dark-mode-blue-dark', category: 'Dark Mode', description: 'Dark navy blue', command: 'icon-composer preview bundle.icon out.png --appearance dark (dark fill #001F3F)', filename: 'dark-mode-blue-dark.png' },
  );

  // Category 3: Glass Effects
  cases.push(
    { id: 'glass-specular-on', category: 'Glass Effects', description: 'Visible highlight/reflection on glyph', command: 'icon-composer glass bundle.icon --specular', filename: 'glass-specular-on.png' },
    { id: 'glass-specular-off', category: 'Glass Effects', description: 'Flat, no highlight', command: 'icon-composer glass bundle.icon --no-specular', filename: 'glass-specular-off.png' },
    { id: 'glass-blur-0.3', category: 'Glass Effects', description: 'Slight blur on gradient bg (red-blue diagonal)', command: 'icon-composer glass bundle.icon --blur-material 0.3', filename: 'glass-blur-0.3.png' },
    { id: 'glass-blur-0.8', category: 'Glass Effects', description: 'Heavy blur on gradient bg (should be noticeably blurrier)', command: 'icon-composer glass bundle.icon --blur-material 0.8', filename: 'glass-blur-0.8.png' },
    { id: 'glass-shadow-layer-color', category: 'Glass Effects', description: 'Red glyph with red-tinted shadow (layer-color)', command: 'icon-composer glass bundle.icon --shadow-kind layer-color', filename: 'glass-shadow-layer-color.png' },
    { id: 'glass-shadow-neutral', category: 'Glass Effects', description: 'Red glyph with gray shadow (neutral, not red)', command: 'icon-composer glass bundle.icon --shadow-kind neutral', filename: 'glass-shadow-neutral.png' },
    { id: 'glass-shadow-none', category: 'Glass Effects', description: 'Red glyph with no drop shadow', command: 'icon-composer glass bundle.icon --shadow-kind none', filename: 'glass-shadow-none.png' },
    { id: 'glass-translucency', category: 'Glass Effects', description: 'Glyph should be see-through (bg bleeds through) at max value', command: 'icon-composer glass bundle.icon --translucency-enabled --translucency-value 1.0', filename: 'glass-translucency.png' },
  );

  // Category 4: Glyph Scale
  cases.push(
    { id: 'scale-0.2', category: 'Glyph Scale', description: 'Tiny glyph centered in large background', command: 'icon-composer create glyph.png ./out --bg-color "#0A66C2" --glyph-scale 0.2', filename: 'scale-0.2.png' },
    { id: 'scale-0.5', category: 'Glyph Scale', description: 'Medium glyph', command: 'icon-composer create glyph.png ./out --bg-color "#0A66C2" --glyph-scale 0.5', filename: 'scale-0.5.png' },
    { id: 'scale-0.65', category: 'Glyph Scale', description: 'Standard Apple-recommended size', command: 'icon-composer create glyph.png ./out --bg-color "#0A66C2" --glyph-scale 0.65', filename: 'scale-0.65.png' },
    { id: 'scale-0.9', category: 'Glyph Scale', description: 'Glyph nearly fills the icon', command: 'icon-composer create glyph.png ./out --bg-color "#0A66C2" --glyph-scale 0.9', filename: 'scale-0.9.png' },
    { id: 'scale-1.0', category: 'Glyph Scale', description: 'Glyph fills entire icon area', command: 'icon-composer create glyph.png ./out --bg-color "#0A66C2" --glyph-scale 1.0', filename: 'scale-1.0.png' },
    { id: 'scale-2.0', category: 'Glyph Scale', description: 'Glyph at 2x — extends beyond normal icon area', command: 'icon-composer create glyph.png ./out --bg-color "#0A66C2" --glyph-scale 2.0', filename: 'scale-2.0.png' },
    { id: 'scale-5.0', category: 'Glyph Scale', description: 'Glyph at 5x — massively oversized, should crop gracefully', command: 'icon-composer create glyph.png ./out --bg-color "#0A66C2" --glyph-scale 5.0', filename: 'scale-5.0.png' },
    { id: 'scale-2.0-flat', category: 'Glyph Scale', description: 'Scale 2.0 flat render on square bg', command: 'icon-composer preview bundle.icon out.png --flat --glyph-scale 2.0', filename: 'scale-2.0-flat.png' },
    { id: 'scale-2.0-app', category: 'Glyph Scale', description: 'Scale 2.0 glass render on app bg', command: 'icon-composer preview bundle.icon out.png --glyph-scale 2.0 --canvas-bg dark', filename: 'scale-2.0-app.png' },
    { id: 'scale-5.0-flat', category: 'Glyph Scale', description: 'Scale 5.0 flat render on square bg', command: 'icon-composer preview bundle.icon out.png --flat --glyph-scale 5.0', filename: 'scale-5.0-flat.png' },
    { id: 'scale-5.0-app', category: 'Glyph Scale', description: 'Scale 5.0 glass render on app bg', command: 'icon-composer preview bundle.icon out.png --glyph-scale 5.0 --canvas-bg dark', filename: 'scale-5.0-app.png' },
  );

  // Category 5: Canvas Backgrounds
  cases.push(
    { id: 'canvas-none', category: 'Canvas Backgrounds', description: 'Icon only, no surrounding background', command: 'icon-composer preview bundle.icon out.png', filename: 'canvas-none.png' },
    { id: 'canvas-light', category: 'Canvas Backgrounds', description: 'Light gray background behind icon', command: 'icon-composer preview bundle.icon out.png --canvas-bg light', filename: 'canvas-light.png' },
    { id: 'canvas-dark', category: 'Canvas Backgrounds', description: 'Dark background behind icon', command: 'icon-composer preview bundle.icon out.png --canvas-bg dark', filename: 'canvas-dark.png' },
    { id: 'canvas-checkerboard', category: 'Canvas Backgrounds', description: 'White/gray checkerboard (transparency indicator)', command: 'icon-composer preview bundle.icon out.png --canvas-bg checkerboard', filename: 'canvas-checkerboard.png' },
    { id: 'canvas-homescreen-light', category: 'Canvas Backgrounds', description: 'iOS light homescreen wallpaper', command: 'icon-composer preview bundle.icon out.png --canvas-bg homescreen-light', filename: 'canvas-homescreen-light.png' },
    { id: 'canvas-homescreen-dark', category: 'Canvas Backgrounds', description: 'iOS dark homescreen wallpaper', command: 'icon-composer preview bundle.icon out.png --canvas-bg homescreen-dark', filename: 'canvas-homescreen-dark.png' },
    { id: 'canvas-solid-color', category: 'Canvas Backgrounds', description: 'Gold/yellow solid background', command: 'icon-composer preview bundle.icon out.png --canvas-bg-color "#FFD700"', filename: 'canvas-solid-color.png' },
  );

  // Category 6: Apple Presets (only if backgrounds exist)
  if (hasApplePresets) {
    cases.push(
      { id: 'preset-purple-orange', category: 'Apple Presets', description: 'Purple-to-orange gradient wallpaper', command: 'icon-composer preview bundle.icon out.png --apple-preset sine-purple-orange', filename: 'preset-purple-orange.png' },
      { id: 'preset-gasflame', category: 'Apple Presets', description: 'Warm gasflame gradient', command: 'icon-composer preview bundle.icon out.png --apple-preset sine-gasflame', filename: 'preset-gasflame.png' },
      { id: 'preset-magenta', category: 'Apple Presets', description: 'Magenta gradient', command: 'icon-composer preview bundle.icon out.png --apple-preset sine-magenta', filename: 'preset-magenta.png' },
      { id: 'preset-green-yellow', category: 'Apple Presets', description: 'Green-to-yellow gradient', command: 'icon-composer preview bundle.icon out.png --apple-preset sine-green-yellow', filename: 'preset-green-yellow.png' },
      { id: 'preset-purple-orange-black', category: 'Apple Presets', description: 'Purple-orange with black gradient', command: 'icon-composer preview bundle.icon out.png --apple-preset sine-purple-orange-black', filename: 'preset-purple-orange-black.png' },
      { id: 'preset-gray', category: 'Apple Presets', description: 'Neutral gray gradient', command: 'icon-composer preview bundle.icon out.png --apple-preset sine-gray', filename: 'preset-gray.png' },
      // Variations: size, glyph scale, opacity
      { id: 'preset-small-icon', category: 'Apple Presets', description: 'Small icon (zoom 0.3) on purple-orange', command: 'icon-composer preview bundle.icon out.png --apple-preset sine-purple-orange --zoom 0.3', filename: 'preset-small-icon.png' },
      { id: 'preset-large-icon', category: 'Apple Presets', description: 'Large icon (zoom 0.85) on purple-orange', command: 'icon-composer preview bundle.icon out.png --apple-preset sine-purple-orange --zoom 0.85', filename: 'preset-large-icon.png' },
      { id: 'preset-big-glyph', category: 'Apple Presets', description: 'Glyph at scale 0.9 on gasflame', command: 'icon-composer create glyph.png ./out --glyph-scale 0.9', filename: 'preset-big-glyph.png' },
      { id: 'preset-tiny-glyph', category: 'Apple Presets', description: 'Glyph at scale 0.25 on gasflame', command: 'icon-composer create glyph.png ./out --glyph-scale 0.25', filename: 'preset-tiny-glyph.png' },
      { id: 'preset-glyph-full', category: 'Apple Presets', description: 'Glyph at scale 1.0 — should fill icon area (clipped by ~27% rounded edges)', command: 'icon-composer create glyph.png ./out --glyph-scale 1.0', filename: 'preset-glyph-full.png' },
      { id: 'preset-opacity-75', category: 'Apple Presets', description: 'Icon at 75% opacity on magenta', command: 'icon-composer glass bundle.icon --opacity 0.75', filename: 'preset-opacity-75.png' },
      { id: 'preset-opacity-50', category: 'Apple Presets', description: 'Icon at 50% opacity on magenta', command: 'icon-composer glass bundle.icon --opacity 0.5', filename: 'preset-opacity-50.png' },
      { id: 'preset-opacity-25', category: 'Apple Presets', description: 'Icon at 25% opacity on magenta (nearly transparent)', command: 'icon-composer glass bundle.icon --opacity 0.25', filename: 'preset-opacity-25.png' },
    );
  }

  // Category 7: Zoom Levels
  cases.push(
    { id: 'zoom-0.3', category: 'Zoom Levels', description: 'Very small icon centered on checkerboard', command: 'icon-composer preview bundle.icon out.png --canvas-bg checkerboard --zoom 0.3', filename: 'zoom-0.3.png' },
    { id: 'zoom-0.5', category: 'Zoom Levels', description: 'Half-size icon on checkerboard', command: 'icon-composer preview bundle.icon out.png --canvas-bg checkerboard --zoom 0.5', filename: 'zoom-0.5.png' },
    { id: 'zoom-1.0', category: 'Zoom Levels', description: 'Full-size icon filling checkerboard', command: 'icon-composer preview bundle.icon out.png --canvas-bg checkerboard --zoom 1.0', filename: 'zoom-1.0.png' },
    { id: 'zoom-1.5', category: 'Zoom Levels', description: 'Icon 1.5x larger than canvas, edges cropped', command: 'icon-composer preview bundle.icon out.png --canvas-bg checkerboard --zoom 1.5', filename: 'zoom-1.5.png' },
    { id: 'zoom-2.0', category: 'Zoom Levels', description: 'Icon 2x, heavily cropped', command: 'icon-composer preview bundle.icon out.png --canvas-bg checkerboard --zoom 2.0', filename: 'zoom-2.0.png' },
  );

  // Category 8: Renditions (ictool only)
  if (hasIctool) {
    cases.push(
      { id: 'rendition-default', category: 'Renditions (ictool)', description: 'Standard Liquid Glass appearance', command: 'icon-composer render bundle.icon out.png --rendition Default', filename: 'rendition-default.png' },
      { id: 'rendition-dark', category: 'Renditions (ictool)', description: 'Dark mode Liquid Glass', command: 'icon-composer render bundle.icon out.png --rendition Dark', filename: 'rendition-dark.png' },
      { id: 'rendition-tinted-light', category: 'Renditions (ictool)', description: 'Tinted light appearance', command: 'icon-composer render bundle.icon out.png --rendition TintedLight', filename: 'rendition-tinted-light.png' },
      { id: 'rendition-tinted-dark', category: 'Renditions (ictool)', description: 'Tinted dark appearance', command: 'icon-composer render bundle.icon out.png --rendition TintedDark', filename: 'rendition-tinted-dark.png' },
      { id: 'rendition-clear-light', category: 'Renditions (ictool)', description: 'Clear/transparent light', command: 'icon-composer render bundle.icon out.png --rendition ClearLight', filename: 'rendition-clear-light.png' },
      { id: 'rendition-clear-dark', category: 'Renditions (ictool)', description: 'Clear/transparent dark', command: 'icon-composer render bundle.icon out.png --rendition ClearDark', filename: 'rendition-clear-dark.png' },
    );
  }

  // Category 9: Platforms (ictool only)
  if (hasIctool) {
    cases.push(
      { id: 'platform-ios', category: 'Platforms (ictool)', description: 'iOS rounded rectangle shape', command: 'icon-composer render bundle.icon out.png --platform iOS', filename: 'platform-ios.png' },
      { id: 'platform-macos', category: 'Platforms (ictool)', description: 'macOS rounded square shape', command: 'icon-composer render bundle.icon out.png --platform macOS', filename: 'platform-macos.png' },
      { id: 'platform-watchos', category: 'Platforms (ictool)', description: 'watchOS circular shape', command: 'icon-composer render bundle.icon out.png --platform watchOS', filename: 'platform-watchos.png' },
    );
  }

  // Category 10: Multi-layer
  cases.push(
    { id: 'multi-2-layers', category: 'Multi-layer', description: 'Two overlapping glyphs', command: 'icon-composer add-layer bundle.icon star.png --name star --scale 0.4', filename: 'multi-2-layers.png' },
    { id: 'multi-2-groups', category: 'Multi-layer', description: 'Two independent layers', command: 'icon-composer add-layer bundle.icon star.png --name star --create-group', filename: 'multi-2-groups.png' },
    { id: 'multi-blend-multiply', category: 'Multi-layer', description: 'Darkened overlap area', command: 'icon-composer add-layer bundle.icon star.png --name star --blend-mode multiply', filename: 'multi-blend-multiply.png' },
    { id: 'multi-opacity-50', category: 'Multi-layer', description: 'Semi-transparent second layer', command: 'icon-composer add-layer bundle.icon star.png --name star --opacity 0.5', filename: 'multi-opacity-50.png' },
    { id: 'multi-app-render', category: 'Multi-layer', description: 'Two layers rendered as iOS app icon on purple-orange preset', command: 'icon-composer preview bundle.icon out.png --apple-preset sine-purple-orange', filename: 'multi-app-render.png' },
    { id: 'watchos-full-glyph', category: 'Platforms (ictool)', description: 'watchOS circular icon with glyph at scale 1.0 filling the circle', command: 'icon-composer render bundle.icon out.png --platform watchOS', filename: 'watchos-full-glyph.png' },
  );

  // Category 11: FX Toggle
  cases.push(
    { id: 'fx-enabled', category: 'FX Toggle', description: 'Full Liquid Glass look', command: 'icon-composer fx bundle.icon --enable', filename: 'fx-enabled.png' },
    { id: 'fx-disabled', category: 'FX Toggle', description: 'Flat, no glass effects', command: 'icon-composer fx bundle.icon --disable', filename: 'fx-disabled.png' },
  );

  // Category 12: Layer Position
  cases.push(
    { id: 'position-centered', category: 'Layer Position', description: 'Glyph centered', command: 'icon-composer position bundle.icon --offset-x 0 --offset-y 0', filename: 'position-centered.png' },
    { id: 'position-offset-right', category: 'Layer Position', description: 'Glyph shifted right', command: 'icon-composer position bundle.icon --offset-x 50', filename: 'position-offset-right.png' },
    { id: 'position-offset-up', category: 'Layer Position', description: 'Glyph shifted up', command: 'icon-composer position bundle.icon --offset-y -50', filename: 'position-offset-up.png' },
    { id: 'position-offset-corner', category: 'Layer Position', description: 'Glyph in bottom-right area', command: 'icon-composer position bundle.icon --offset-x 80 --offset-y 80', filename: 'position-offset-corner.png' },
  );

  return cases;
}

// ── Test execution ──

export async function runVisualTests(outputDir: string): Promise<void> {
  const SIZE = 512;

  // Ensure output dir exists
  await fs.mkdir(outputDir, { recursive: true });

  // Create temp working directory for bundles
  const tmpDir = path.join(outputDir, '.tmp-bundles');
  await fs.mkdir(tmpDir, { recursive: true });

  // Check capabilities
  const hasIctool = await ictoolAvailable();
  const backgroundsDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'backgrounds');
  let hasApplePresets = false;
  try {
    await fs.access(path.join(backgroundsDir, '1 - sine-purple-orange.jpeg'));
    hasApplePresets = true;
  } catch {
    hasApplePresets = false;
  }

  // Generate glyphs
  const whiteCircle = await createWhiteCircleGlyph();
  const redSquare = await createRedSquareGlyph();
  const blueCircle = await createBlueCircleGlyph();

  // Define test cases
  const testCases = defineTestCases(hasIctool, hasApplePresets);
  const total = testCases.length;
  const results: TestResult[] = [];

  console.log(`Running ${total} visual tests (ictool: ${hasIctool ? 'yes' : 'no'}, apple presets: ${hasApplePresets ? 'yes' : 'no'})`);
  console.log('');

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const progress = `[${i + 1}/${total}]`;
    console.log(`${progress} Generating ${tc.id}...`);

    try {
      const outPath = path.join(outputDir, tc.filename);

      // ── Category: Background Fill ──
      if (tc.id === 'fill-solid-blue') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { bgColor: '#0A66C2' });
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'fill-solid-red') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { bgColor: '#FF0000' });
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'fill-solid-black') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { bgColor: '#000000' });
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'fill-solid-white') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { bgColor: '#FFFFFF' });
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'fill-gradient-vertical') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { bgColor: '#FF0000' });
        await setFill({ bundle_path: bp, fill_type: 'gradient', color: '#FF0000', color2: '#0000FF', gradient_angle: 0 });
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'fill-gradient-horizontal') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { bgColor: '#FF0000' });
        await setFill({ bundle_path: bp, fill_type: 'gradient', color: '#FF0000', color2: '#0000FF', gradient_angle: 90 });
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'fill-gradient-diagonal') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { bgColor: '#FF0000' });
        await setFill({ bundle_path: bp, fill_type: 'gradient', color: '#FF0000', color2: '#0000FF', gradient_angle: 45 });
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'fill-automatic') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { bgColor: '#0A66C2' });
        await setFill({ bundle_path: bp, fill_type: 'automatic', gradient_angle: 0 });
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'fill-none') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { bgColor: '#0A66C2' });
        await setFill({ bundle_path: bp, fill_type: 'none', gradient_angle: 0 });
        await renderFlatPreview(bp, outPath, SIZE);

      // ── Category: Dark Mode ──
      } else if (tc.id === 'dark-mode-light') {
        const bp = await createBaseBundle(tmpDir, tc.id, blueCircle, { bgColor: '#FFFFFF', darkBgColor: '#000000' });
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'dark-mode-dark') {
        const bp = await createBaseBundle(tmpDir, tc.id, blueCircle, { bgColor: '#FFFFFF', darkBgColor: '#000000' });
        await renderFlatPreview(bp, outPath, SIZE, 'dark');
      } else if (tc.id === 'dark-mode-blue-light') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { bgColor: '#0A66C2', darkBgColor: '#001F3F' });
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'dark-mode-blue-dark') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { bgColor: '#0A66C2', darkBgColor: '#001F3F' });
        await renderFlatPreview(bp, outPath, SIZE, 'dark');

      // ── Category: Glass Effects (ictool required for visible effects) ──
      } else if (tc.id === 'glass-specular-on') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { specular: true });
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 1.0 });
      } else if (tc.id === 'glass-specular-off') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { specular: false });
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 1.0 });
      } else if (tc.id === 'glass-blur-0.3') {
        // Gradient bg so blur-material (which blurs behind glass) has something to blur
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { blurMaterial: 0.3, bgColor: '#FF0000' });
        await setFill({ bundle_path: bp, fill_type: 'gradient', color: '#FF0000', color2: '#0000FF', gradient_angle: 45 });
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 1.0 });
      } else if (tc.id === 'glass-blur-0.8') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { blurMaterial: 0.8, bgColor: '#FF0000' });
        await setFill({ bundle_path: bp, fill_type: 'gradient', color: '#FF0000', color2: '#0000FF', gradient_angle: 45 });
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 1.0 });
      } else if (tc.id === 'glass-shadow-layer-color') {
        // Red glyph so layer-color shadow is visibly red
        const bp = await createBaseBundle(tmpDir, tc.id, redSquare, { shadowKind: 'layer-color', shadowOpacity: 1.0 });
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 1.0 });
      } else if (tc.id === 'glass-shadow-neutral') {
        // Same red glyph — neutral shadow should be gray, not red
        const bp = await createBaseBundle(tmpDir, tc.id, redSquare, { shadowKind: 'neutral', shadowOpacity: 1.0 });
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 1.0 });
      } else if (tc.id === 'glass-shadow-none') {
        const bp = await createBaseBundle(tmpDir, tc.id, redSquare, { shadowKind: 'none' });
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 1.0 });
      } else if (tc.id === 'glass-translucency') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { translucencyEnabled: true, translucencyValue: 1.0 });
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 1.0 });

      // ── Category: Glyph Scale ──
      } else if (tc.id.startsWith('scale-')) {
        const scale = parseFloat(tc.id.replace('scale-', ''));
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { glyphScale: scale });
        if (tc.id.endsWith('-app')) {
          await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, canvas_bg: 'dark' });
        } else if (tc.id.endsWith('-flat')) {
          await renderFlatPreview(bp, outPath, SIZE);
        } else {
          await renderFlatPreview(bp, outPath, SIZE);
        }

      // ── Category: Canvas Backgrounds ──
      } else if (tc.id === 'canvas-none') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6 });
      } else if (tc.id === 'canvas-light') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, canvas_bg: 'light' });
      } else if (tc.id === 'canvas-dark') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, canvas_bg: 'dark' });
      } else if (tc.id === 'canvas-checkerboard') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, canvas_bg: 'checkerboard' });
      } else if (tc.id === 'canvas-homescreen-light') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, canvas_bg: 'homescreen-light' });
      } else if (tc.id === 'canvas-homescreen-dark') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, canvas_bg: 'homescreen-dark' });
      } else if (tc.id === 'canvas-solid-color') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, canvas_bg_color: '#FFD700' });

      // ── Category: Apple Presets (variations first, then generic) ──
      } else if (tc.id === 'preset-small-icon') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.3, apple_preset: 'sine-purple-orange' });
      } else if (tc.id === 'preset-large-icon') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.85, apple_preset: 'sine-purple-orange' });
      } else if (tc.id === 'preset-big-glyph') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { glyphScale: 0.9 });
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, apple_preset: 'sine-gasflame' });
      } else if (tc.id === 'preset-tiny-glyph') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { glyphScale: 0.25 });
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, apple_preset: 'sine-gasflame' });
      } else if (tc.id === 'preset-glyph-full') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { glyphScale: 1.0 });
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, apple_preset: 'sine-purple-orange' });
      } else if (tc.id === 'preset-opacity-75') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        const { manifest } = await readIconBundle(bp);
        manifest.groups[0].opacity = 0.75;
        await saveManifest(bp, manifest);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, apple_preset: 'sine-magenta' });
      } else if (tc.id === 'preset-opacity-50') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        const { manifest } = await readIconBundle(bp);
        manifest.groups[0].opacity = 0.5;
        await saveManifest(bp, manifest);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, apple_preset: 'sine-magenta' });
      } else if (tc.id === 'preset-opacity-25') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        const { manifest } = await readIconBundle(bp);
        manifest.groups[0].opacity = 0.25;
        await saveManifest(bp, manifest);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, apple_preset: 'sine-magenta' });
      } else if (tc.id.startsWith('preset-')) {
        const presetMap: Record<string, ApplePresetName> = {
          'preset-purple-orange': 'sine-purple-orange',
          'preset-gasflame': 'sine-gasflame',
          'preset-magenta': 'sine-magenta',
          'preset-green-yellow': 'sine-green-yellow',
          'preset-purple-orange-black': 'sine-purple-orange-black',
          'preset-gray': 'sine-gray',
        };
        const presetName = presetMap[tc.id];
        if (presetName) {
          const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
          await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, apple_preset: presetName });
        }

      // ── Category: Zoom Levels ──
      } else if (tc.id.startsWith('zoom-')) {
        const zoom = parseFloat(tc.id.replace('zoom-', ''));
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom, canvas_bg: 'checkerboard' });

      // ── Category: Renditions (ictool) ──
      } else if (tc.id.startsWith('rendition-')) {
        const renditionMap: Record<string, string> = {
          'rendition-default': 'Default',
          'rendition-dark': 'Dark',
          'rendition-tinted-light': 'TintedLight',
          'rendition-tinted-dark': 'TintedDark',
          'rendition-clear-light': 'ClearLight',
          'rendition-clear-dark': 'ClearDark',
        };
        const rendition = renditionMap[tc.id];
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        await renderWithIctool({
          bundlePath: bp,
          outputPath: outPath,
          rendition,
          width: SIZE,
          height: SIZE,
        });

      // ── Category: Platforms (ictool) ──
      } else if (tc.id.startsWith('platform-')) {
        const platformMap: Record<string, string> = {
          'platform-ios': 'iOS',
          'platform-macos': 'macOS',
          'platform-watchos': 'watchOS',
        };
        const platform = platformMap[tc.id];
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        await renderWithIctool({
          bundlePath: bp,
          outputPath: outPath,
          platform,
          width: SIZE,
          height: SIZE,
        });

      // ── Category: Multi-layer ──
      } else if (tc.id === 'multi-2-layers') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { glyphScale: 0.65 });
        // Add second layer in same group
        const { manifest, assets } = await readIconBundle(bp);
        assets.set('redsquare.png', redSquare);
        await fs.writeFile(path.join(bp, 'Assets', 'redsquare.png'), redSquare);
        addLayer(manifest.groups[0], { imageName: 'redsquare.png', name: 'square', scale: 0.4, glass: true });
        await saveManifest(bp, manifest);
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'multi-2-groups') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { glyphScale: 0.65 });
        const { manifest, assets } = await readIconBundle(bp);
        assets.set('redsquare.png', redSquare);
        await fs.writeFile(path.join(bp, 'Assets', 'redsquare.png'), redSquare);
        const group2 = addGroup(manifest, { name: 'Background2', specular: true, shadow: { kind: 'layer-color', opacity: 0.5 } });
        addLayer(group2, { imageName: 'redsquare.png', name: 'square', scale: 0.5, glass: true });
        await saveManifest(bp, manifest);
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'multi-blend-multiply') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { glyphScale: 0.65 });
        const { manifest } = await readIconBundle(bp);
        await fs.writeFile(path.join(bp, 'Assets', 'redsquare.png'), redSquare);
        addLayer(manifest.groups[0], { imageName: 'redsquare.png', name: 'square', scale: 0.5, glass: true, blendMode: 'multiply' as BlendMode });
        await saveManifest(bp, manifest);
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'multi-opacity-50') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { glyphScale: 0.65 });
        const { manifest } = await readIconBundle(bp);
        await fs.writeFile(path.join(bp, 'Assets', 'redsquare.png'), redSquare);
        addLayer(manifest.groups[0], { imageName: 'redsquare.png', name: 'square', scale: 0.5, glass: true, opacity: 0.5 });
        await saveManifest(bp, manifest);
        await renderFlatPreview(bp, outPath, SIZE);

      } else if (tc.id === 'multi-app-render') {
        // Two layers: red square behind, white circle in front — both visible
        const bp = await createBaseBundle(tmpDir, tc.id, redSquare, { glyphScale: 0.8 });
        const { manifest } = await readIconBundle(bp);
        await fs.writeFile(path.join(bp, 'Assets', 'whitecircle.png'), whiteCircle);
        manifest.groups[0].layers[0].opacity = 0.5;
        addLayer(manifest.groups[0], { imageName: 'whitecircle.png', name: 'circle', scale: 0.4, glass: true });
        await saveManifest(bp, manifest);
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 0.6, apple_preset: 'sine-purple-orange' });
      } else if (tc.id === 'watchos-full-glyph') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { glyphScale: 1.0 });
        await renderLiquidGlass({ bundle_path: bp, output_path: outPath, platform: 'watchOS', rendition: 'Default', width: SIZE, height: SIZE, scale: 1, zoom: 1.0 });

      // ── Category: FX Toggle ──
      } else if (tc.id === 'fx-enabled') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { specular: true, shadowKind: 'layer-color' });
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 1.0 });
      } else if (tc.id === 'fx-disabled') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle, { specular: false, shadowKind: 'none', shadowOpacity: 0 });
        await exportPreview({ bundle_path: bp, output_path: outPath, size: SIZE, flat: false, zoom: 1.0 });

      // ── Category: Layer Position ──
      } else if (tc.id === 'position-centered') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'position-offset-right') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        const { manifest } = await readIconBundle(bp);
        manifest.groups[0].layers[0].position = { scale: 0.65, 'translation-in-points': [50, 0] };
        await saveManifest(bp, manifest);
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'position-offset-up') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        const { manifest } = await readIconBundle(bp);
        manifest.groups[0].layers[0].position = { scale: 0.65, 'translation-in-points': [0, -50] };
        await saveManifest(bp, manifest);
        await renderFlatPreview(bp, outPath, SIZE);
      } else if (tc.id === 'position-offset-corner') {
        const bp = await createBaseBundle(tmpDir, tc.id, whiteCircle);
        const { manifest } = await readIconBundle(bp);
        manifest.groups[0].layers[0].position = { scale: 0.65, 'translation-in-points': [80, 80] };
        await saveManifest(bp, manifest);
        await renderFlatPreview(bp, outPath, SIZE);
      }

      results.push({ ...tc, success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  ERROR: ${msg}`);
      results.push({ ...tc, success: false, error: msg });
    }
  }

  // ── Clean up temp bundles ──
  await fs.rm(tmpDir, { recursive: true, force: true });

  // ── Generate HTML gallery ──
  const html = generateGalleryHtml(results);
  await fs.writeFile(path.join(outputDir, 'index.html'), html);

  // ── Summary ──
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log('');
  console.log(`Done. ${passed} generated, ${failed} failed, ${total} total.`);
  console.log(`Gallery: ${path.join(outputDir, 'index.html')}`);
}

// ── HTML gallery generator ──

function generateGalleryHtml(results: TestResult[]): string {
  // Group results by category
  const categories = new Map<string, TestResult[]>();
  for (const r of results) {
    const list = categories.get(r.category) ?? [];
    list.push(r);
    categories.set(r.category, list);
  }

  const categoryNames = Array.from(categories.keys());
  const total = results.length;
  const generated = results.filter((r) => r.success).length;

  const cardsHtml = categoryNames.map((cat) => {
    const items = categories.get(cat)!;
    const cards = items.map((r) => {
      const imgSrc = r.success ? `./${r.filename}` : '';
      const errorHtml = r.error ? `<div class="error">${escapeHtml(r.error)}</div>` : '';
      return `
        <div class="card" data-id="${escapeHtml(r.id)}" data-category="${escapeHtml(r.category)}" data-generated="${r.success}">
          <div class="img-wrap">
            ${r.success ? `<img src="${imgSrc}" alt="${escapeHtml(r.id)}" loading="lazy" />` : '<div class="no-image">FAILED</div>'}
          </div>
          <div class="info">
            <div class="id">${escapeHtml(r.id)}</div>
            <div class="desc">${escapeHtml(r.description)}</div>
            <code class="cmd">${escapeHtml(r.command)}</code>
            ${errorHtml}
          </div>
          <div class="verdict">
            <button class="btn-pass" onclick="setVerdict('${escapeHtml(r.id)}', 'pass')">PASS</button>
            <button class="btn-fail" onclick="setVerdict('${escapeHtml(r.id)}', 'fail')">FAIL</button>
            <button class="btn-clear" onclick="setVerdict('${escapeHtml(r.id)}', null)">Clear</button>
          </div>
        </div>`;
    }).join('\n');

    return `
      <div class="category-section" data-category="${escapeHtml(cat)}">
        <h2>${escapeHtml(cat)} <span class="cat-count">(${items.length})</span></h2>
        <div class="grid">${cards}</div>
      </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Icon Composer Visual Test Gallery</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 20px; }
  h1 { text-align: center; margin-bottom: 8px; color: #fff; font-size: 1.8em; }
  .summary-bar { display: flex; justify-content: center; gap: 24px; padding: 12px; background: #16213e; border-radius: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
  .summary-bar .stat { font-size: 1.1em; }
  .stat-total { color: #8be9fd; }
  .stat-pass { color: #50fa7b; }
  .stat-fail { color: #ff5555; }
  .stat-pending { color: #f1fa8c; }
  .filter-bar { display: flex; justify-content: center; gap: 8px; padding: 12px; flex-wrap: wrap; margin-bottom: 20px; }
  .filter-bar button { background: #0f3460; color: #e0e0e0; border: 1px solid #1a1a4e; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85em; transition: background 0.2s; }
  .filter-bar button:hover { background: #1a1a6e; }
  .filter-bar button.active { background: #533483; border-color: #7b68ee; color: #fff; }
  .export-btn { background: #0f3460; color: #8be9fd; border: 1px solid #1a1a4e; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 0.9em; }
  .export-btn:hover { background: #1a1a6e; }
  .category-section { margin-bottom: 32px; }
  .category-section h2 { margin-bottom: 12px; color: #bd93f9; border-bottom: 1px solid #333; padding-bottom: 6px; }
  .cat-count { color: #6272a4; font-size: 0.8em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .card { background: #16213e; border-radius: 10px; overflow: hidden; border: 2px solid transparent; transition: border-color 0.2s; }
  .card[data-verdict="pass"] { border-color: #50fa7b; }
  .card[data-verdict="fail"] { border-color: #ff5555; }
  .card[data-generated="false"] { opacity: 0.5; }
  .img-wrap { background: #0f0f23; display: flex; align-items: center; justify-content: center; min-height: 200px; }
  .img-wrap img { width: 100%; height: auto; display: block; image-rendering: auto; }
  .no-image { color: #ff5555; font-weight: bold; padding: 40px; }
  .info { padding: 12px; }
  .id { font-weight: 600; color: #f8f8f2; margin-bottom: 4px; font-size: 0.95em; }
  .desc { color: #8be9fd; font-size: 0.85em; margin-bottom: 6px; }
  .cmd { display: block; background: #0f0f23; padding: 6px 8px; border-radius: 4px; font-size: 0.75em; color: #6272a4; word-break: break-all; margin-bottom: 4px; }
  .error { color: #ff5555; font-size: 0.8em; margin-top: 4px; }
  .verdict { display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid #1a1a4e; }
  .verdict button { flex: 1; padding: 6px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.8em; transition: opacity 0.2s; }
  .btn-pass { background: #50fa7b; color: #1a1a2e; }
  .btn-fail { background: #ff5555; color: #fff; }
  .btn-clear { background: #44475a; color: #f8f8f2; }
  .verdict button:hover { opacity: 0.85; }
</style>
</head>
<body>

<h1>Icon Composer Visual Test Gallery</h1>

<div class="summary-bar">
  <span class="stat stat-total">Total: <strong id="stat-total">${total}</strong></span>
  <span class="stat stat-total">Generated: <strong>${generated}</strong></span>
  <span class="stat stat-pass">Pass: <strong id="stat-pass">0</strong></span>
  <span class="stat stat-fail">Fail: <strong id="stat-fail">0</strong></span>
  <span class="stat stat-pending">Pending: <strong id="stat-pending">${total}</strong></span>
  <button class="export-btn" onclick="exportResults()">Export Results (JSON)</button>
</div>

<div class="filter-bar">
  <button class="active" onclick="filterCategory(this, 'all')">All</button>
  ${categoryNames.map((c) => `<button onclick="filterCategory(this, '${escapeHtml(c)}')">${escapeHtml(c)}</button>`).join('\n  ')}
</div>

${cardsHtml}

<script>
const STORAGE_KEY = 'icon-composer-visual-test-verdicts';

function loadVerdicts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function saveVerdicts(v) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
}

function setVerdict(id, verdict) {
  const v = loadVerdicts();
  if (verdict === null) { delete v[id]; } else { v[id] = verdict; }
  saveVerdicts(v);
  applyVerdicts();
}

function applyVerdicts() {
  const v = loadVerdicts();
  document.querySelectorAll('.card').forEach(card => {
    const id = card.dataset.id;
    const verdict = v[id] || null;
    if (verdict) { card.dataset.verdict = verdict; } else { delete card.dataset.verdict; }
  });
  updateCounts();
}

function updateCounts() {
  const v = loadVerdicts();
  const all = document.querySelectorAll('.card');
  let pass = 0, fail = 0;
  all.forEach(card => {
    const verdict = v[card.dataset.id];
    if (verdict === 'pass') pass++;
    else if (verdict === 'fail') fail++;
  });
  document.getElementById('stat-pass').textContent = pass;
  document.getElementById('stat-fail').textContent = fail;
  document.getElementById('stat-pending').textContent = all.length - pass - fail;
}

function filterCategory(btn, category) {
  document.querySelectorAll('.filter-bar button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.category-section').forEach(sec => {
    if (category === 'all' || sec.dataset.category === category) {
      sec.style.display = '';
    } else {
      sec.style.display = 'none';
    }
  });
}

function exportResults() {
  const v = loadVerdicts();
  const results = [];
  document.querySelectorAll('.card').forEach(card => {
    results.push({
      id: card.dataset.id,
      category: card.dataset.category,
      generated: card.dataset.generated === 'true',
      verdict: v[card.dataset.id] || 'pending',
    });
  });
  const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'visual-test-results.json'; a.click();
  URL.revokeObjectURL(url);
}

// Initialize
applyVerdicts();
</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
