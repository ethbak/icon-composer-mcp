import * as fs from 'node:fs/promises';
import sharp from 'sharp';
import { readIconBundle, saveManifest } from './bundle';
import { renderPreview, compositeOnBackground, type CanvasBackground, type ApplePresetName } from './render';
import { ictoolAvailable, renderWithIctool, CLEAR_RENDITIONS } from './ictool';
import type { IconManifest } from '../types';

// Apple's ictool scale=1.0 renders glyphs at ~65% of icon area.
// Users expect scale=1.0 to fill. This factor corrects the difference.
const ICTOOL_SCALE_FACTOR = 1.54;

// Temporarily scale up layer positions in a manifest for ictool rendering,
// then restore after render. This makes user-facing scale values consistent
// between flat renderer and ictool without permanently modifying the bundle.
async function renderWithIctoolScaled(
  bundlePath: string,
  options: Parameters<typeof renderWithIctool>[0]
): Promise<void> {
  const { manifest } = await readIconBundle(bundlePath);
  const origScales: number[] = [];

  // Scale up all layer positions
  for (const group of manifest.groups) {
    for (const layer of group.layers) {
      if (layer.position) {
        origScales.push(layer.position.scale);
        layer.position.scale *= ICTOOL_SCALE_FACTOR;
      }
    }
  }

  await saveManifest(bundlePath, manifest);
  try {
    await renderWithIctool(options);
  } finally {
    // Restore original scales
    let i = 0;
    for (const group of manifest.groups) {
      for (const layer of group.layers) {
        if (layer.position && i < origScales.length) {
          layer.position.scale = origScales[i++];
        }
      }
    }
    await saveManifest(bundlePath, manifest);
  }
}

export interface McpResult {
  content: [{ type: 'text'; text: string }];
  isError?: true;
}

export interface ExportPreviewParams {
  bundle_path: string;
  output_path: string;
  size: number;
  appearance?: 'dark' | 'tinted';
  flat: boolean;
  canvas_bg?: string;
  apple_preset?: string;
  canvas_bg_color?: string;
  canvas_bg_image?: string;
  zoom: number;
}

export interface RenderLiquidGlassParams {
  bundle_path: string;
  output_path: string;
  platform: string;
  rendition: string;
  width: number;
  height: number;
  scale: number;
  light_angle?: number;
  tint_color?: number;
  tint_strength?: number;
  canvas_bg?: string;
  apple_preset?: string;
  canvas_bg_color?: string;
  canvas_bg_image?: string;
  zoom: number;
}

export function resolveCanvasBackgroundParam(params: {
  canvas_bg_image?: string;
  canvas_bg_color?: string;
  apple_preset?: string;
  canvas_bg?: string;
}): CanvasBackground {
  if (params.canvas_bg_image) {
    return { type: 'image', path: params.canvas_bg_image };
  } else if (params.canvas_bg_color) {
    return { type: 'solid', color: params.canvas_bg_color };
  } else if (params.apple_preset) {
    return { type: 'apple-preset', name: params.apple_preset as ApplePresetName };
  } else if (params.canvas_bg && params.canvas_bg !== 'none') {
    return { type: 'preset', name: params.canvas_bg as any };
  }
  return { type: 'none' };
}

export async function exportPreview(params: ExportPreviewParams): Promise<McpResult> {
  try {
    const useIctool = !params.flat && await ictoolAvailable();

    const renditionMap: Record<string, string> = { dark: 'Dark', tinted: 'TintedLight' };
    const rendition = params.appearance ? renditionMap[params.appearance] ?? 'Default' : 'Default';

    let buffer: Buffer;
    let renderer: string;

    if (useIctool) {
      const canvasBg = resolveCanvasBackgroundParam(params);
      const hasCanvas = canvasBg.type !== 'none' || params.zoom !== 1.0;

      if (hasCanvas) {
        // Keep the icon shape (squircle) — it sits on the canvas background
        const tmpPath = params.output_path + '.ictool.png';
        await renderWithIctoolScaled(params.bundle_path, {
          bundlePath: params.bundle_path,
          outputPath: tmpPath,
          rendition,
          width: params.size,
          height: params.size,
        });
        buffer = await fs.readFile(tmpPath);
        await fs.unlink(tmpPath).catch(() => {});
      } else {
        // No canvas — crop out the squircle shape to show just the icon content.
        // The squircle insets ~27% from each edge, so the safe center is ~46%.
        // Render at ceil(target / 0.46) so we only downscale (no quality loss).
        const SAFE_RATIO = 0.46;
        const renderSize = Math.ceil(params.size / SAFE_RATIO);
        const tmpPath = params.output_path + '.ictool.png';
        await renderWithIctool({
          bundlePath: params.bundle_path,
          outputPath: tmpPath,
          rendition,
          width: renderSize,
          height: renderSize,
        });
        const raw = await fs.readFile(tmpPath);
        await fs.unlink(tmpPath).catch(() => {});
        const cropOffset = Math.round((renderSize - renderSize * SAFE_RATIO) / 2);
        const cropSize = Math.round(renderSize * SAFE_RATIO);
        buffer = await sharp(raw)
          .extract({ left: cropOffset, top: cropOffset, width: cropSize, height: cropSize })
          .resize(params.size, params.size, { kernel: 'lanczos3' })
          .png()
          .toBuffer();
      }
      renderer = 'liquid-glass';
    } else {
      const { manifest, assets } = await readIconBundle(params.bundle_path);
      buffer = await renderPreview(manifest, assets, params.size, params.appearance);
      renderer = 'flat';
    }

    const canvasBg = resolveCanvasBackgroundParam(params);

    if (canvasBg.type !== 'none' || params.zoom !== 1.0) {
      const iconSize = Math.round(params.size * params.zoom);
      buffer = await compositeOnBackground(buffer, canvasBg, params.size, iconSize);
    }

    await fs.writeFile(params.output_path, buffer);

    return {
      content: [{ type: 'text', text: `Exported preview to ${params.output_path} (${params.size}x${params.size}, ${renderer}, zoom: ${params.zoom}x, bg: ${params.canvas_bg_image ? 'image' : params.canvas_bg_color ?? params.canvas_bg ?? 'none'})` }],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
}

export async function renderLiquidGlass(params: RenderLiquidGlassParams): Promise<McpResult> {
  try {
    if (!await ictoolAvailable()) {
      return {
        content: [{ type: 'text', text: 'Error: Icon Composer.app not found at /Applications/Icon Composer.app. Install it from developer.apple.com/icon-composer/' }],
        isError: true,
      };
    }

    await renderWithIctoolScaled(params.bundle_path, {
      bundlePath: params.bundle_path,
      outputPath: params.output_path,
      platform: params.platform,
      rendition: params.rendition,
      width: params.width,
      height: params.height,
      scale: params.scale,
      lightAngle: params.light_angle,
      tintColor: params.tint_color,
      tintStrength: params.tint_strength,
    });

    const hasBackground = params.canvas_bg_image || params.canvas_bg_color || params.apple_preset || (params.canvas_bg && params.canvas_bg !== 'none');
    if (CLEAR_RENDITIONS.has(params.rendition) && hasBackground) {
      return {
        content: [{ type: 'text', text: `ClearLight/ClearDark renditions do not support canvas backgrounds. Apple's glass transparency effect requires a Metal GPU pipeline that isn't available via CLI. Use Default, Dark, or Tinted renditions for background compositing.` }],
        isError: true,
      };
    }

    const canvasBg = resolveCanvasBackgroundParam(params);

    if (canvasBg.type !== 'none' || params.zoom !== 1.0) {
      const iconBuffer = await fs.readFile(params.output_path);
      const canvasSize = Math.max(params.width, params.height);
      const iconSize = Math.round(canvasSize * params.zoom);
      const result = await compositeOnBackground(iconBuffer, canvasBg, canvasSize, iconSize);
      await fs.writeFile(params.output_path, result);
    }

    const stat = await fs.stat(params.output_path);

    return {
      content: [{ type: 'text', text: `Rendered Liquid Glass preview to ${params.output_path} (${params.width}x${params.height}@${params.scale}x, ${params.rendition}, zoom: ${params.zoom}x, ${(stat.size / 1024).toFixed(1)} KB)` }],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
}
