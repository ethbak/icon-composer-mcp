// Re-export shim — all implementation moved to src/lib/
// This file exists for backwards compatibility with existing imports.

export {
  hexToIconColor,
  solidFill,
  createManifest,
  addGroup,
  addLayer,
  resolveFill,
  type CreateManifestOptions,
  type AddGroupOptions,
  type AddLayerOptions,
} from './lib/manifest';

export {
  readIconBundle,
  writeIconBundle,
  saveManifest,
} from './lib/bundle';

export {
  generateCheckerboard,
  resolveCanvasBackground,
  compositeOnBackground,
  renderPreview,
  type ApplePresetName,
  type CanvasBackground,
} from './lib/render';

import * as fs from 'fs/promises';
import * as path from 'path';
import { createManifest, addGroup, addLayer } from './lib/manifest';
import { writeIconBundle } from './lib/bundle';

// createQuickIcon was not extracted to a lib module, so it lives here as a thin
// wrapper that delegates to the lib functions.
export async function createQuickIcon(options: {
  foregroundPath: string;
  outputDir: string;
  bundleName: string;
  bgColor: string;
  darkBgColor?: string;
  glyphScale?: number;
  specular?: boolean;
  shadow?: { kind: 'neutral' | 'layer-color' | 'none'; opacity: number };
  blurMaterial?: number | null;
  translucency?: { enabled: boolean; value: number };
}): Promise<string> {
  const foregroundBuffer = await fs.readFile(options.foregroundPath);
  const ext = path.extname(options.foregroundPath);
  const foregroundName = `foreground${ext}`;

  const manifest = createManifest({
    fill: options.bgColor,
    darkFill: options.darkBgColor,
    platforms: { squares: true, circles: true },
  });

  const group = addGroup(manifest, {
    name: 'Foreground',
    specular: options.specular ?? true,
    shadow: options.shadow ?? { kind: 'layer-color', opacity: 0.5 },
    blurMaterial: options.blurMaterial ?? null,
    translucency: options.translucency,
  });

  addLayer(group, {
    imageName: foregroundName,
    name: 'glyph',
    scale: options.glyphScale ?? 0.65,
    glass: true,
  });

  const assets = new Map<string, Buffer>();
  assets.set(foregroundName, foregroundBuffer);

  return writeIconBundle(options.outputDir, options.bundleName, manifest, assets);
}
