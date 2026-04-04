import * as fs from 'node:fs/promises';
import sharp from 'sharp';
import { readIconBundle, saveManifest } from './bundle';
import { renderPreview, resolveFill, compositeOnBackground, type CanvasBackground, type ApplePresetName } from './render';
import { ictoolAvailable, renderWithIctool, CLEAR_RENDITIONS } from './ictool';
import { stripAlpha } from './image-utils';
import type { IconManifest } from '../types';

// ictool and Icon Composer use the manifest scale values directly.
// scale=1.0 renders at ~65% of icon area — this is Apple's native behavior.
// Our flat renderer applies the same 0.65 factor to match.

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

      const tmpPath = params.output_path + '.ictool.png';
      try {
        await renderWithIctool({
          bundlePath: params.bundle_path,
          outputPath: tmpPath,
          rendition,
          width: params.size,
          height: params.size,
        });
        const raw = await fs.readFile(tmpPath);

        if (hasCanvas) {
          // Canvas will be composited later — keep full squircle
          buffer = raw;
        } else {
          // No canvas — glass glyph without squircle outline.
          // 1. Scale down glyph in manifest (smaller relative to app outline)
          // 2. Render ictool at bigger size (outline pushed outside crop zone)
          // 3. Crop center at target size — outline gone, glyph at correct px
          // The two factors cancel: glyph pixels = same as normal render.
          const INSCRIBED_RATIO = 0.55;
          const renderSize = Math.ceil(params.size / INSCRIBED_RATIO);

          // Temporarily shrink layer scales in the manifest
          const { manifest } = await readIconBundle(params.bundle_path);
          const origScales: number[] = [];
          for (const group of manifest.groups) {
            for (const layer of group.layers) {
              const pos = layer.position ?? { scale: 1.0, 'translation-in-points': [0, 0] as [number, number] };
              if (!layer.position) layer.position = pos;
              origScales.push(pos.scale);
              pos.scale *= INSCRIBED_RATIO;
            }
          }
          await saveManifest(params.bundle_path, manifest);

          const tmpLarge = params.output_path + '.ictool-large.png';
          try {
            await renderWithIctool({
              bundlePath: params.bundle_path,
              outputPath: tmpLarge,
              rendition,
              width: renderSize,
              height: renderSize,
            });
            const largeRaw = await fs.readFile(tmpLarge);

            // Crop center at target size — squircle outline is outside
            const cropOffset = Math.round((renderSize - params.size) / 2);
            const cropped = await sharp(largeRaw)
              .extract({ left: cropOffset, top: cropOffset, width: params.size, height: params.size })
              .png()
              .toBuffer();

            // Composite onto fill-color canvas
            const fill = resolveFill(manifest, params.appearance);
            let bgColor = { r: 255, g: 255, b: 255 };
            if (fill && typeof fill === 'object' && 'solid' in fill) {
              const parts = fill.solid.split(':')[1]?.split(',').map(Number);
              if (parts && parts.length >= 3) {
                bgColor = {
                  r: Math.round(parts[0] * 255),
                  g: Math.round(parts[1] * 255),
                  b: Math.round(parts[2] * 255),
                };
              }
            }
            buffer = await sharp({
              create: { width: params.size, height: params.size, channels: 4, background: { ...bgColor, alpha: 255 } },
            })
              .composite([{ input: cropped, left: 0, top: 0 }])
              .png()
              .toBuffer();
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
            await saveManifest(params.bundle_path, manifest);
            await fs.unlink(tmpLarge).catch(() => {});
          }
        }
      } finally {
        await fs.unlink(tmpPath).catch(() => {});
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

    buffer = await stripAlpha(buffer);
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

    await renderWithIctool({
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

    // Strip alpha — icons should never have transparency in final output
    const finalBuffer = await stripAlpha(await fs.readFile(params.output_path));
    await fs.writeFile(params.output_path, finalBuffer);

    const stat = await fs.stat(params.output_path);

    return {
      content: [{ type: 'text', text: `Rendered Liquid Glass preview to ${params.output_path} (${params.width}x${params.height}@${params.scale}x, ${params.rendition}, zoom: ${params.zoom}x, ${(stat.size / 1024).toFixed(1)} KB)` }],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
}

export interface ExportMarketingParams {
  bundle_path: string;
  output_path: string;
  size?: number;
}

/**
 * Export a flat 1024x1024 (default) marketing PNG for App Store Connect.
 * No glass effects, no alpha channel.
 */
export async function exportMarketing(params: ExportMarketingParams): Promise<McpResult> {
  try {
    const size = params.size ?? 1024;
    const { manifest, assets } = await readIconBundle(params.bundle_path);

    // Render flat preview (no ictool, no glass)
    let buffer = await renderPreview(manifest, assets, size);

    // Determine background color from manifest fill for alpha flattening
    const fill = resolveFill(manifest);
    let bgColor = { r: 255, g: 255, b: 255 };
    if (fill && typeof fill === 'object' && 'solid' in fill) {
      const parts = fill.solid.split(':')[1]?.split(',').map(Number);
      if (parts && parts.length >= 3) {
        bgColor = {
          r: Math.round(parts[0] * 255),
          g: Math.round(parts[1] * 255),
          b: Math.round(parts[2] * 255),
        };
      }
    }

    buffer = await stripAlpha(buffer, bgColor);
    await fs.writeFile(params.output_path, buffer);

    const stat = await fs.stat(params.output_path);
    return {
      content: [{ type: 'text', text: `Exported marketing icon to ${params.output_path} (${size}x${size}, no alpha, ${(stat.size / 1024).toFixed(1)} KB)` }],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
}
