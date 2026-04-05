import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { solidFill, hexToIconColor } from './manifest';
import { readIconBundle, saveManifest } from './bundle';
import { toBlendMode } from '../types';
import type { McpResult } from '../types';

// ---------------------------------------------------------------------------
// Parameter interfaces
// ---------------------------------------------------------------------------

export interface SetGlassParams {
  bundle_path: string;
  group_index: number;
  specular?: boolean;
  blur_material?: number | null;
  shadow_kind?: 'neutral' | 'layer-color' | 'none';
  shadow_opacity?: number;
  translucency_enabled?: boolean;
  translucency_value?: number;
  opacity?: number;
  blend_mode?: string;
  lighting?: 'combined' | 'individual';
}

export interface SetAppearancesParams {
  bundle_path: string;
  target: 'fill' | 'group';
  group_index: number;
  appearance: 'dark' | 'tinted';
  bg_color?: string;
  specular?: boolean;
  shadow_kind?: 'neutral' | 'layer-color' | 'none';
  shadow_opacity?: number;
  opacity?: number;
}

export interface SetFillParams {
  bundle_path: string;
  fill_type: 'solid' | 'gradient' | 'automatic' | 'none';
  color?: string;
  color2?: string;
  gradient_angle: number;
}

export interface SetLayerPositionParams {
  bundle_path: string;
  target: 'layer' | 'group';
  group_index: number;
  layer_index?: number;
  scale?: number;
  offset_x?: number;
  offset_y?: number;
}

export interface ToggleFxParams {
  bundle_path: string;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(text: string): McpResult {
  return { content: [{ type: 'text', text }] };
}

function err(text: string): McpResult {
  return { content: [{ type: 'text', text }], isError: true };
}

// ---------------------------------------------------------------------------
// 1. setGlassEffects
// ---------------------------------------------------------------------------

export async function setGlassEffects(params: SetGlassParams): Promise<McpResult> {
  try {
    const { manifest } = await readIconBundle(params.bundle_path);

    if (manifest.groups.length === 0) {
      return err('Error: No groups in this icon bundle');
    }

    const group = manifest.groups[Math.min(params.group_index, manifest.groups.length - 1)];

    if (params.specular !== undefined) group.specular = params.specular;
    if (params.blur_material !== undefined) group['blur-material'] = params.blur_material;

    if (params.shadow_kind !== undefined || params.shadow_opacity !== undefined) {
      group.shadow = {
        kind: params.shadow_kind ?? group.shadow?.kind ?? 'layer-color',
        opacity: params.shadow_opacity ?? group.shadow?.opacity ?? 0.5,
      };
    }

    if (params.translucency_enabled !== undefined || params.translucency_value !== undefined) {
      group.translucency = {
        enabled: params.translucency_enabled ?? group.translucency?.enabled ?? false,
        value: params.translucency_value ?? group.translucency?.value ?? 0.4,
      };
    }

    if (params.opacity !== undefined) group.opacity = params.opacity;
    if (params.blend_mode) group['blend-mode'] = toBlendMode(params.blend_mode);
    if (params.lighting) group.lighting = params.lighting;

    await saveManifest(params.bundle_path, manifest);

    return ok(`Updated glass effects on group ${params.group_index} in ${params.bundle_path}`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return err(`Error: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// 2. setAppearances
// ---------------------------------------------------------------------------

export async function setAppearances(params: SetAppearancesParams): Promise<McpResult> {
  try {
    const { manifest } = await readIconBundle(params.bundle_path);

    if (params.target === 'fill' && params.bg_color) {
      if (!manifest['fill-specializations']) {
        manifest['fill-specializations'] = [];
        if (manifest.fill) {
          manifest['fill-specializations'].push({ value: manifest.fill });
          delete manifest.fill;
        }
      }
      manifest['fill-specializations'] = manifest['fill-specializations'].filter(
        (s) => s.appearance !== params.appearance,
      );
      manifest['fill-specializations'].push({
        appearance: params.appearance,
        value: solidFill(params.bg_color),
      });
    }

    if (params.target === 'group') {
      const group = manifest.groups[Math.min(params.group_index, manifest.groups.length - 1)];
      if (!group) {
        return err('Error: Group not found');
      }

      if (params.specular !== undefined) {
        if (!group['specular-specializations']) group['specular-specializations'] = [];
        group['specular-specializations'] = group['specular-specializations'].filter(
          (s) => s.appearance !== params.appearance,
        );
        group['specular-specializations'].push({
          appearance: params.appearance,
          value: params.specular,
        });
      }

      if (params.shadow_kind !== undefined || params.shadow_opacity !== undefined) {
        if (!group['shadow-specializations']) group['shadow-specializations'] = [];
        group['shadow-specializations'] = group['shadow-specializations'].filter(
          (s) => s.appearance !== params.appearance,
        );
        group['shadow-specializations'].push({
          appearance: params.appearance,
          value: {
            kind: params.shadow_kind ?? 'layer-color',
            opacity: params.shadow_opacity ?? 0.5,
          },
        });
      }
    }

    await saveManifest(params.bundle_path, manifest);

    return ok(`Set ${params.appearance} appearance on ${params.target} in ${params.bundle_path}`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return err(`Error: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// 3. setFill
// ---------------------------------------------------------------------------

export async function setFill(params: SetFillParams): Promise<McpResult> {
  try {
    const { manifest } = await readIconBundle(params.bundle_path);

    if (params.fill_type === 'none') {
      manifest.fill = 'none';
    } else if (params.fill_type === 'automatic') {
      manifest.fill = 'automatic';
    } else if (params.fill_type === 'solid' && params.color) {
      manifest.fill = solidFill(params.color);
    } else if (params.fill_type === 'gradient' && params.color && params.color2) {
      const angle = (params.gradient_angle * Math.PI) / 180;
      manifest.fill = {
        'linear-gradient': [
          hexToIconColor(params.color),
          hexToIconColor(params.color2),
        ],
        orientation: {
          start: {
            x: 0.5 - Math.sin(angle) * 0.5,
            y: 0.5 + Math.cos(angle) * 0.5,
          },
          stop: {
            x: 0.5 + Math.sin(angle) * 0.5,
            y: 0.5 - Math.cos(angle) * 0.5,
          },
        },
      };
    }

    await saveManifest(params.bundle_path, manifest);

    return ok(`Updated fill in ${params.bundle_path}`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return err(`Error: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// 4. setLayerPosition
// ---------------------------------------------------------------------------

export async function setLayerPosition(params: SetLayerPositionParams): Promise<McpResult> {
  try {
    const { manifest } = await readIconBundle(params.bundle_path);

    if (manifest.groups.length === 0) {
      return err('Error: No groups in this icon bundle');
    }

    const group = manifest.groups[Math.min(params.group_index, manifest.groups.length - 1)];

    if (params.target === 'group') {
      const currentPos = group.position ?? { scale: 1.0, 'translation-in-points': [0, 0] as [number, number] };
      group.position = {
        scale: params.scale ?? currentPos.scale,
        'translation-in-points': [
          params.offset_x ?? currentPos['translation-in-points'][0],
          params.offset_y ?? currentPos['translation-in-points'][1],
        ],
      };
    } else {
      const layerIdx = params.layer_index ?? 0;
      if (layerIdx >= group.layers.length) {
        return err(`Error: Layer index ${layerIdx} out of range (group has ${group.layers.length} layers)`);
      }
      const layer = group.layers[layerIdx];
      const currentPos = layer.position ?? { scale: 1.0, 'translation-in-points': [0, 0] as [number, number] };
      layer.position = {
        scale: params.scale ?? currentPos.scale,
        'translation-in-points': [
          params.offset_x ?? currentPos['translation-in-points'][0],
          params.offset_y ?? currentPos['translation-in-points'][1],
        ],
      };
    }

    await saveManifest(params.bundle_path, manifest);

    const targetDesc = params.target === 'group'
      ? `group ${params.group_index}`
      : `layer ${params.layer_index ?? 0} in group ${params.group_index}`;

    return ok(`Updated position on ${targetDesc}: scale=${params.scale ?? '(unchanged)'}, offset=(${params.offset_x ?? '(unchanged)'}, ${params.offset_y ?? '(unchanged)'})`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return err(`Error: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// 5. toggleFx
// ---------------------------------------------------------------------------

export async function toggleFx(params: ToggleFxParams): Promise<McpResult> {
  try {
    const { manifest } = await readIconBundle(params.bundle_path);

    for (const group of manifest.groups) {
      if (params.enabled) {
        group.specular = true;
        if (!group.shadow || group.shadow.kind === 'none') {
          group.shadow = { kind: 'layer-color', opacity: 0.5 };
        }
      } else {
        group.specular = false;
        group.shadow = { kind: 'none', opacity: 0 };
        if (group.translucency) {
          group.translucency.enabled = false;
        }
      }
      // blur-material intentionally NOT touched
    }

    await saveManifest(params.bundle_path, manifest);

    return ok(`${params.enabled ? 'Enabled' : 'Disabled'} all FX on ${manifest.groups.length} group(s) in ${params.bundle_path}`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return err(`Error: ${msg}`);
  }
}
