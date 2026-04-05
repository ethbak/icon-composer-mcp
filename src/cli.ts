#!/usr/bin/env node
import { program } from 'commander';
import { createIcon, addLayerToBundle, removeFromBundle, inspectBundle } from './lib/ops-bundle';
import { setGlassEffects, setAppearances, setFill, setLayerPosition, toggleFx } from './lib/ops-glass';
import { exportPreview, renderLiquidGlass, exportMarketing } from './lib/ops-render';

// ── Helpers ──

// Commander passes (value, previous) — wrapping prevents previous from being used as radix
const toInt = (v: string) => parseInt(v, 10);
const toFloat = (v: string) => parseFloat(v);

// ── Output handler ──

interface McpResult {
  content: [{ type: string; text: string }];
  isError?: true;
}

async function run(fn: () => Promise<McpResult>): Promise<void> {
  const result = await fn();
  const text = result.content[0].text;
  if (result.isError) {
    console.error(text);
    process.exit(1);
  }
  console.log(text);
}

// ── Program setup ──

program
  .name('icon-composer')
  .description('Apple Icon Composer CLI — create and manipulate .icon bundles')
  .version('1.0.0');

// ── create ──

program
  .command('create')
  .description('Create a new .icon bundle')
  .argument('<foreground_path>', 'Path to the foreground image')
  .argument('<output_dir>', 'Output directory for the .icon bundle')
  .requiredOption('--bg-color <hex>', 'Background color (hex)')
  .option('--bundle-name <name>', 'Bundle name', 'AppIcon')
  .option('--dark-bg-color <hex>', 'Dark mode background color')
  .option('--glyph-scale <n>', 'Glyph scale (1.75 = recommended default)', toFloat, 1.75)
  .option('--split-layers', 'Split multi-shape SVGs into separate glass layers (default: true)', true)
  .option('--no-split-layers', 'Keep SVG as a single layer')
  .option('--specular', 'Enable specular highlight', true)
  .option('--no-specular', 'Disable specular highlight')
  .option('--shadow-kind <kind>', 'Shadow kind (neutral, layer-color, none)', 'layer-color')
  .option('--shadow-opacity <n>', 'Shadow opacity', toFloat, 0.5)
  .option('--blur-material <n>', 'Blur material value', toFloat)
  .option('--translucency-enabled', 'Enable translucency', false)
  .option('--translucency-value <n>', 'Translucency value', toFloat, 0.4)
  .action(async (foreground_path, output_dir, opts) => {
    await run(() =>
      createIcon({
        foreground_path,
        output_dir,
        bg_color: opts.bgColor,
        bundle_name: opts.bundleName,
        dark_bg_color: opts.darkBgColor,
        glyph_scale: opts.glyphScale,
        specular: opts.specular,
        shadow_kind: opts.shadowKind,
        shadow_opacity: opts.shadowOpacity,
        blur_material: opts.blurMaterial ?? null,
        translucency_enabled: opts.translucencyEnabled,
        translucency_value: opts.translucencyValue,
        split_layers: opts.splitLayers,
      }),
    );
  });

// ── add-layer ──

program
  .command('add-layer')
  .description('Add a layer to a bundle')
  .argument('<bundle_path>', 'Path to the .icon bundle')
  .argument('<image_path>', 'Path to the layer image')
  .requiredOption('--name <name>', 'Layer name')
  .option('--group-index <n>', 'Group index', toInt, 0)
  .option('--create-group', 'Create a new group for this layer', false)
  .option('--opacity <n>', 'Layer opacity', toFloat, 1.0)
  .option('--scale <n>', 'Layer scale', toFloat, 1.0)
  .option('--offset-x <n>', 'X offset', toFloat, 0)
  .option('--offset-y <n>', 'Y offset', toFloat, 0)
  .option('--blend-mode <mode>', 'Blend mode', 'normal')
  .option('--glass', 'Enable glass effect', true)
  .option('--no-glass', 'Disable glass effect')
  .action(async (bundle_path, image_path, opts) => {
    await run(() =>
      addLayerToBundle({
        bundle_path,
        image_path,
        layer_name: opts.name,
        group_index: opts.groupIndex,
        create_group: opts.createGroup,
        opacity: opts.opacity,
        scale: opts.scale,
        offset_x: opts.offsetX,
        offset_y: opts.offsetY,
        blend_mode: opts.blendMode,
        glass: opts.glass,
      }),
    );
  });

// ── remove ──

program
  .command('remove')
  .description('Remove a layer or group from a bundle')
  .argument('<bundle_path>', 'Path to the .icon bundle')
  .requiredOption('--target <type>', 'Target type (layer or group)')
  .requiredOption('--group-index <n>', 'Group index', toInt)
  .option('--layer-index <n>', 'Layer index (required when target=layer)', toInt)
  .option('--no-cleanup-assets', 'Skip cleaning up orphaned asset files')
  .action(async (bundle_path, opts) => {
    await run(() =>
      removeFromBundle({
        bundle_path,
        target: opts.target,
        group_index: opts.groupIndex,
        layer_index: opts.layerIndex,
        cleanup_assets: opts.cleanupAssets,
      }),
    );
  });

// ── inspect ──

program
  .command('inspect')
  .description('Read and display bundle contents')
  .argument('<bundle_path>', 'Path to the .icon bundle')
  .action(async (bundle_path) => {
    await run(() => inspectBundle({ bundle_path }));
  });

// ── glass ──

program
  .command('glass')
  .description('Set glass effects on a group')
  .argument('<bundle_path>', 'Path to the .icon bundle')
  .option('--group-index <n>', 'Group index', toInt, 0)
  .option('--specular', 'Enable specular highlight')
  .option('--no-specular', 'Disable specular highlight')
  .option('--blur-material <n>', 'Blur material value', toFloat)
  .option('--shadow-kind <kind>', 'Shadow kind (neutral, layer-color, none)')
  .option('--shadow-opacity <n>', 'Shadow opacity', toFloat)
  .option('--translucency-enabled', 'Enable translucency')
  .option('--no-translucency-enabled', 'Disable translucency')
  .option('--translucency-value <n>', 'Translucency value', toFloat)
  .option('--opacity <n>', 'Layer opacity', toFloat)
  .option('--blend-mode <mode>', 'Blend mode')
  .option('--lighting <type>', 'Lighting type (combined or individual)')
  .action(async (bundle_path, opts) => {
    await run(() =>
      setGlassEffects({
        bundle_path,
        group_index: opts.groupIndex,
        specular: opts.specular,
        blur_material: opts.blurMaterial,
        shadow_kind: opts.shadowKind,
        shadow_opacity: opts.shadowOpacity,
        translucency_enabled: opts.translucencyEnabled,
        translucency_value: opts.translucencyValue,
        opacity: opts.opacity,
        blend_mode: opts.blendMode,
        lighting: opts.lighting,
      }),
    );
  });

// ── appearance ──

program
  .command('appearance')
  .description('Set appearance overrides')
  .argument('<bundle_path>', 'Path to the .icon bundle')
  .requiredOption('--target <type>', 'Target type (fill or group)')
  .requiredOption('--appearance <mode>', 'Appearance mode (dark or tinted)')
  .option('--group-index <n>', 'Group index', toInt, 0)
  .option('--bg-color <hex>', 'Background color')
  .option('--specular', 'Enable specular highlight')
  .option('--no-specular', 'Disable specular highlight')
  .option('--shadow-kind <kind>', 'Shadow kind (neutral, layer-color, none)')
  .option('--shadow-opacity <n>', 'Shadow opacity', toFloat)
  .option('--opacity <n>', 'Opacity', toFloat)
  .action(async (bundle_path, opts) => {
    await run(() =>
      setAppearances({
        bundle_path,
        target: opts.target,
        appearance: opts.appearance,
        group_index: opts.groupIndex,
        bg_color: opts.bgColor,
        specular: opts.specular,
        shadow_kind: opts.shadowKind,
        shadow_opacity: opts.shadowOpacity,
        opacity: opts.opacity,
      }),
    );
  });

// ── fill ──

program
  .command('fill')
  .description('Set background fill')
  .argument('<bundle_path>', 'Path to the .icon bundle')
  .requiredOption('--type <type>', 'Fill type (solid, gradient, automatic, none)')
  .option('--color <hex>', 'Primary color')
  .option('--color2 <hex>', 'Secondary color (for gradient)')
  .option('--gradient-angle <n>', 'Gradient angle in degrees', toFloat, 0)
  .action(async (bundle_path, opts) => {
    await run(() =>
      setFill({
        bundle_path,
        fill_type: opts.type,
        color: opts.color,
        color2: opts.color2,
        gradient_angle: opts.gradientAngle,
      }),
    );
  });

// ── position ──

program
  .command('position')
  .description('Set layer/group position')
  .argument('<bundle_path>', 'Path to the .icon bundle')
  .option('--target <type>', 'Target type (layer or group)', 'layer')
  .option('--group-index <n>', 'Group index', toInt, 0)
  .option('--layer-index <n>', 'Layer index', toInt)
  .option('--scale <n>', 'Scale factor', toFloat)
  .option('--offset-x <n>', 'X offset', toFloat)
  .option('--offset-y <n>', 'Y offset', toFloat)
  .action(async (bundle_path, opts) => {
    await run(() =>
      setLayerPosition({
        bundle_path,
        target: opts.target,
        group_index: opts.groupIndex,
        layer_index: opts.layerIndex,
        scale: opts.scale,
        offset_x: opts.offsetX,
        offset_y: opts.offsetY,
      }),
    );
  });

// ── fx ──

program
  .command('fx')
  .description('Toggle all effects on/off')
  .argument('<bundle_path>', 'Path to the .icon bundle')
  .option('--enable', 'Enable all effects')
  .option('--disable', 'Disable all effects')
  .action(async (bundle_path, opts) => {
    const enabled = opts.enable === true ? true : opts.disable === true ? false : true;
    await run(() => toggleFx({ bundle_path, enabled }));
  });

// ── preview ──

program
  .command('preview')
  .description('Export preview image')
  .argument('<bundle_path>', 'Path to the .icon bundle')
  .argument('<output_path>', 'Output image path')
  .option('--size <n>', 'Preview size in pixels', toInt, 1024)
  .option('--appearance <mode>', 'Appearance mode (dark or tinted)')
  .option('--flat', 'Force flat rendering (no ictool)', false)
  .option('--canvas-bg <preset>', 'Canvas background preset')
  .option('--apple-preset <name>', 'Apple wallpaper preset name')
  .option('--canvas-bg-color <hex>', 'Canvas background solid color')
  .option('--canvas-bg-image <path>', 'Canvas background image path')
  .option('--zoom <n>', 'Zoom factor', toFloat, 1.0)
  .action(async (bundle_path, output_path, opts) => {
    await run(() =>
      exportPreview({
        bundle_path,
        output_path,
        size: opts.size,
        appearance: opts.appearance,
        flat: opts.flat,
        canvas_bg: opts.canvasBg,
        apple_preset: opts.applePreset,
        canvas_bg_color: opts.canvasBgColor,
        canvas_bg_image: opts.canvasBgImage,
        zoom: opts.zoom,
      }),
    );
  });

// ── render ──

program
  .command('render')
  .description('Render Liquid Glass via ictool')
  .argument('<bundle_path>', 'Path to the .icon bundle')
  .argument('<output_path>', 'Output image path')
  .option('--platform <name>', 'Platform (iOS, macOS, watchOS)', 'iOS')
  .option('--rendition <name>', 'Rendition name', 'Default')
  .option('--width <n>', 'Output width', toInt, 1024)
  .option('--height <n>', 'Output height', toInt, 1024)
  .option('--scale <n>', 'Scale factor', toInt, 1)
  .option('--light-angle <n>', 'Light angle', toFloat)
  .option('--tint-color <n>', 'Tint color', toFloat)
  .option('--tint-strength <n>', 'Tint strength', toFloat)
  .option('--canvas-bg <preset>', 'Canvas background preset')
  .option('--apple-preset <name>', 'Apple wallpaper preset name')
  .option('--canvas-bg-color <hex>', 'Canvas background solid color')
  .option('--canvas-bg-image <path>', 'Canvas background image path')
  .option('--zoom <n>', 'Zoom factor', toFloat, 1.0)
  .action(async (bundle_path, output_path, opts) => {
    await run(() =>
      renderLiquidGlass({
        bundle_path,
        output_path,
        platform: opts.platform,
        rendition: opts.rendition,
        width: opts.width,
        height: opts.height,
        scale: opts.scale,
        light_angle: opts.lightAngle,
        tint_color: opts.tintColor,
        tint_strength: opts.tintStrength,
        canvas_bg: opts.canvasBg,
        apple_preset: opts.applePreset,
        canvas_bg_color: opts.canvasBgColor,
        canvas_bg_image: opts.canvasBgImage,
        zoom: opts.zoom,
      }),
    );
  });

// ── export-marketing ──

program
  .command('export-marketing')
  .description('Export flat marketing PNG for App Store Connect (no alpha)')
  .argument('<bundle_path>', 'Path to the .icon bundle')
  .argument('<output_path>', 'Output PNG path')
  .option('--size <n>', 'Output size in pixels', toInt, 1024)
  .action(async (bundle_path, output_path, opts) => {
    await run(() =>
      exportMarketing({
        bundle_path,
        output_path,
        size: opts.size,
      }),
    );
  });

// ── doctor ──

program
  .command('doctor')
  .description('Check system setup and dependencies')
  .action(async () => {
    const { ictoolAvailable, getIctoolVersion, getInstallMessage } = await import('./lib/ictool');
    const os = await import('node:os');

    console.log('icon-composer-mcp doctor\n');
    console.log(`Platform: ${os.platform()} ${os.arch()}`);
    console.log(`Node: ${process.version}`);

    if (os.platform() !== 'darwin') {
      console.log('\nIcon Composer.app is macOS-only.');
      console.log('Bundle creation and flat previews work on any platform.');
      console.log('Liquid Glass rendering requires macOS with Icon Composer installed.');
      return;
    }

    const available = await ictoolAvailable();
    if (!available) {
      console.log('\nictool: NOT FOUND');
      console.log('\n' + getInstallMessage());
      process.exit(1);
    }

    const info = await getIctoolVersion();
    if (info) {
      console.log(`\nictool: ${info.path}`);
      console.log(`Version: ${info.version} (build ${info.build})`);
      console.log('\nAll dependencies found. Ready to use.');
    }
  });

// ── visual-test ──

program
  .command('visual-test')
  .description('Generate visual test gallery for human inspection')
  .option('--out <dir>', 'Output directory', './gallery')
  .action(async (opts) => {
    const { runVisualTests } = await import('./visual-test');
    await runVisualTests(opts.out);
  });

// ── Parse ──

program.parse();
