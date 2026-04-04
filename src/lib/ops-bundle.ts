import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createManifest, addGroup, addLayer } from './manifest';
import { readIconBundle, writeIconBundle, saveManifest } from './bundle';
import { sanitizeFilename } from './sanitize';
import { toBlendMode, type McpResult } from '../types';

// ── Parameter interfaces ──

export interface CreateIconParams {
  foreground_path: string;
  output_dir: string;
  bundle_name: string;
  bg_color: string;
  dark_bg_color?: string;
  glyph_scale: number;
  specular: boolean;
  shadow_kind: 'neutral' | 'layer-color' | 'none';
  shadow_opacity: number;
  blur_material?: number | null;
  translucency_enabled: boolean;
  translucency_value: number;
}

export interface AddLayerParams {
  bundle_path: string;
  image_path: string;
  layer_name: string;
  group_index: number;
  create_group: boolean;
  opacity: number;
  scale: number;
  offset_x: number;
  offset_y: number;
  blend_mode: string;
  glass: boolean;
}

export interface RemoveParams {
  bundle_path: string;
  target: 'layer' | 'group';
  group_index: number;
  layer_index?: number;
  cleanup_assets: boolean;
}

// ── Operations ──

export async function createIcon(params: CreateIconParams): Promise<McpResult> {
  try {
    const foregroundBuffer = await fs.readFile(params.foreground_path);
    const ext = path.extname(params.foreground_path);
    const foregroundName = `foreground${ext}`;

    const manifest = createManifest({
      fill: params.bg_color,
      darkFill: params.dark_bg_color,
      platforms: { squares: true, circles: true },
    });

    const group = addGroup(manifest, {
      name: 'Foreground',
      specular: params.specular,
      shadow: { kind: params.shadow_kind, opacity: params.shadow_opacity },
      blurMaterial: params.blur_material ?? null,
      translucency: params.translucency_enabled
        ? { enabled: true, value: params.translucency_value }
        : undefined,
    });

    addLayer(group, {
      imageName: foregroundName,
      name: 'glyph',
      scale: params.glyph_scale,
      glass: true,
    });

    const assets = new Map<string, Buffer>();
    assets.set(foregroundName, foregroundBuffer);

    const bundlePath = await writeIconBundle(
      params.output_dir,
      params.bundle_name,
      manifest,
      assets,
    );

    return {
      content: [{ type: 'text', text: `Created .icon bundle at: ${bundlePath}` }],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Error: ${msg}` }],
      isError: true,
    };
  }
}

export async function addLayerToBundle(params: AddLayerParams): Promise<McpResult> {
  try {
    const { manifest, assets } = await readIconBundle(params.bundle_path);

    const imageBuffer = await fs.readFile(params.image_path);
    const safeName = sanitizeFilename(params.layer_name);

    const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.heic', '.heif'];
    const ext = path.extname(params.image_path).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      return {
        content: [{ type: 'text', text: `Error: unsupported image extension "${ext}". Allowed: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}` }],
        isError: true,
      };
    }

    const imageName = `${safeName}${ext}`;
    assets.set(imageName, imageBuffer);

    let group;
    if (params.create_group || manifest.groups.length === 0) {
      group = addGroup(manifest, { name: safeName });
    } else {
      group = manifest.groups[Math.min(params.group_index, manifest.groups.length - 1)];
    }

    addLayer(group, {
      imageName,
      name: safeName,
      opacity: params.opacity,
      blendMode: toBlendMode(params.blend_mode),
      glass: params.glass,
      scale: params.scale,
      offset: [params.offset_x, params.offset_y],
    });

    await saveManifest(params.bundle_path, manifest);
    await fs.writeFile(
      path.join(params.bundle_path, 'Assets', imageName),
      imageBuffer,
    );

    return {
      content: [{ type: 'text', text: `Added layer "${params.layer_name}" to ${params.bundle_path}` }],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Error: ${msg}` }],
      isError: true,
    };
  }
}

export async function removeFromBundle(params: RemoveParams): Promise<McpResult> {
  try {
    const { manifest } = await readIconBundle(params.bundle_path);

    if (params.group_index < 0 || params.group_index >= manifest.groups.length) {
      return {
        content: [{ type: 'text', text: `Error: Group index ${params.group_index} out of range (${manifest.groups.length} groups)` }],
        isError: true,
      };
    }

    const removedImages: string[] = [];
    let removedDesc: string;

    if (params.target === 'group') {
      const group = manifest.groups[params.group_index];
      for (const layer of group.layers) {
        removedImages.push(layer['image-name']);
      }
      manifest.groups.splice(params.group_index, 1);
      removedDesc = `group ${params.group_index} (${group.name ?? 'unnamed'}, ${removedImages.length} layer(s))`;
    } else {
      if (params.layer_index === undefined) {
        return {
          content: [{ type: 'text', text: 'Error: layer_index is required when target=layer' }],
          isError: true,
        };
      }
      const group = manifest.groups[params.group_index];
      if (params.layer_index < 0 || params.layer_index >= group.layers.length) {
        return {
          content: [{ type: 'text', text: `Error: Layer index ${params.layer_index} out of range (group has ${group.layers.length} layers)` }],
          isError: true,
        };
      }
      const layer = group.layers[params.layer_index];
      removedImages.push(layer['image-name']);
      group.layers.splice(params.layer_index, 1);
      removedDesc = `layer "${layer.name}" from group ${params.group_index}`;
    }

    if (params.cleanup_assets && removedImages.length > 0) {
      const stillReferenced = new Set<string>();
      for (const g of manifest.groups) {
        for (const l of g.layers) {
          stillReferenced.add(l['image-name']);
        }
      }
      for (const img of removedImages) {
        if (path.basename(img) !== img) continue; // skip path-traversal attempts
        if (!stillReferenced.has(img)) {
          await fs.unlink(path.join(params.bundle_path, 'Assets', img)).catch(() => {});
        }
      }
    }

    await saveManifest(params.bundle_path, manifest);

    return {
      content: [{ type: 'text', text: `Removed ${removedDesc} from ${params.bundle_path}` }],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Error: ${msg}` }],
      isError: true,
    };
  }
}

export async function inspectBundle(params: { bundle_path: string }): Promise<McpResult> {
  try {
    const { manifest, assets } = await readIconBundle(params.bundle_path);
    const assetList = Array.from(assets.keys()).map((name) => {
      const buf = assets.get(name)!;
      return `  ${name} (${(buf.length / 1024).toFixed(1)} KB)`;
    });

    return {
      content: [{
        type: 'text',
        text: `Manifest:\n${JSON.stringify(manifest, null, 2)}\n\nAssets:\n${assetList.join('\n') || '  (none)'}`,
      }],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Error: ${msg}` }],
      isError: true,
    };
  }
}
