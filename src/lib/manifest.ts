import type { IconManifest, FillValue, Group, Layer, BlendMode, Shadow, Translucency } from '../types';

export interface CreateManifestOptions {
  fill?: string;
  darkFill?: string;
  platforms?: { squares?: boolean; circles?: boolean };
}

export interface AddGroupOptions {
  name?: string;
  specular?: boolean;
  shadow?: Shadow;
  blurMaterial?: number | null;
  translucency?: Translucency;
  opacity?: number;
  blendMode?: BlendMode;
  layers?: Layer[];
}

export interface AddLayerOptions {
  imageName: string;
  name: string;
  opacity?: number;
  blendMode?: BlendMode;
  glass?: boolean;
  scale?: number;
  offset?: [number, number];
  fill?: string;
}

export function hexToIconColor(hex: string, colorSpace: string = 'srgb'): string {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return `${colorSpace}:${r.toFixed(5)},${g.toFixed(5)},${b.toFixed(5)},1.00000`;
}

export function solidFill(hex: string): FillValue {
  return { solid: hexToIconColor(hex) };
}

export function createManifest(options: CreateManifestOptions = {}): IconManifest {
  const manifest: IconManifest = {
    groups: [],
    'supported-platforms': {},
  };

  if (options.platforms?.squares !== false) {
    manifest['supported-platforms'].squares = 'shared';
  }
  if (options.platforms?.circles === true) {
    manifest['supported-platforms'].circles = ['watchOS'];
  }

  if (options.fill && options.darkFill) {
    manifest['fill-specializations'] = [
      { value: solidFill(options.fill) },
      { appearance: 'dark', value: solidFill(options.darkFill) },
    ];
  } else if (options.fill) {
    manifest.fill = solidFill(options.fill);
  }

  return manifest;
}

export function addGroup(manifest: IconManifest, options: AddGroupOptions = {}): Group {
  const group: Group = {
    layers: options.layers ?? [],
  };

  if (options.name) group.name = options.name;
  if (options.specular !== undefined) group.specular = options.specular;
  if (options.shadow) group.shadow = options.shadow;
  if (options.blurMaterial !== undefined) group['blur-material'] = options.blurMaterial;
  if (options.translucency) group.translucency = options.translucency;
  if (options.opacity !== undefined) group.opacity = options.opacity;
  if (options.blendMode) group['blend-mode'] = options.blendMode;

  manifest.groups.push(group);
  return group;
}

export function addLayer(group: Group, options: AddLayerOptions): Layer {
  const layer: Layer = {
    'image-name': options.imageName,
    name: options.name,
  };

  if (options.opacity !== undefined) layer.opacity = options.opacity;
  if (options.blendMode) layer['blend-mode'] = options.blendMode;
  if (options.glass !== undefined) layer.glass = options.glass;
  if (options.fill) layer.fill = solidFill(options.fill);

  if (options.scale !== undefined || options.offset !== undefined) {
    layer.position = {
      scale: options.scale ?? 1.0,
      'translation-in-points': options.offset ?? [0, 0],
    };
  }

  group.layers.push(layer);
  return layer;
}

export function resolveFill(manifest: IconManifest, appearance?: 'dark' | 'tinted'): FillValue | undefined {
  const specs = manifest['fill-specializations'];
  if (specs && specs.length > 0) {
    // Try exact appearance match first
    if (appearance !== undefined) {
      const match = specs.find(s => s.appearance === appearance);
      if (match) return match.value;
    }
    // Fallback to default (no appearance key)
    const defaultSpec = specs.find(s => s.appearance === undefined);
    if (defaultSpec) return defaultSpec.value;
  }
  return manifest.fill;
}
