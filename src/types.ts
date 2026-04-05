// Apple Icon Composer .icon bundle types
// Based on: https://github.com/dfabulich/unofficial-apple-icon-composer-json-schema

export type ColorSpace = 'srgb' | 'display-p3' | 'extended-gray';

// Color string format: "srgb:R,G,B,A" where components are 0-1 floats
export type ColorString = string;

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'soft-light' | 'hard-light' | 'difference' | 'exclusion'
  | 'plus-darker' | 'plus-lighter';

const VALID_BLEND_MODES: ReadonlySet<string> = new Set<BlendMode>([
  'normal', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'color-dodge', 'color-burn',
  'soft-light', 'hard-light', 'difference', 'exclusion',
  'plus-darker', 'plus-lighter',
]);

/** Validate a string as a BlendMode, returning 'normal' if invalid. */
export function toBlendMode(value: string | undefined): BlendMode {
  if (value && VALID_BLEND_MODES.has(value)) {
    return value as BlendMode;
  }
  return 'normal';
}

export type FillPreset = 'automatic' | 'system-dark' | 'system-light' | 'none';

export interface SolidFill {
  solid: ColorString;
}

export interface LinearGradientFill {
  'linear-gradient': [ColorString, ColorString];
  orientation: { start: { x: number; y: number }; stop: { x: number; y: number } };
}

export interface AutomaticGradientFill {
  'automatic-gradient': ColorString;
}

export type FillValue = FillPreset | SolidFill | LinearGradientFill | AutomaticGradientFill;

export interface Shadow {
  kind: 'neutral' | 'layer-color' | 'none';
  opacity: number;
}

export interface Translucency {
  enabled: boolean;
  value: number;
}

export interface Position {
  scale: number;
  'translation-in-points': [number, number];
}

export interface Specialization<T> {
  appearance?: 'dark' | 'tinted';
  idiom?: 'square' | 'watchOS';
  value: T;
}

export interface Layer {
  'image-name': string;
  name: string;
  hidden?: boolean;
  opacity?: number;
  'blend-mode'?: BlendMode;
  fill?: FillValue;
  glass?: boolean;
  position?: Position;
  // specializations
  'opacity-specializations'?: Specialization<number>[];
  'hidden-specializations'?: Specialization<boolean>[];
  'fill-specializations'?: Specialization<FillValue>[];
  'blend-mode-specializations'?: Specialization<BlendMode>[];
  'position-specializations'?: Specialization<Position>[];
}

export interface Group {
  layers: Layer[];
  name?: string;
  hidden?: boolean;
  'blend-mode'?: BlendMode;
  'blur-material'?: number | null;
  lighting?: 'combined' | 'individual';
  shadow?: Shadow;
  specular?: boolean;
  translucency?: Translucency;
  opacity?: number;
  position?: Position;
  // specializations
  'specular-specializations'?: Specialization<boolean>[];
  'shadow-specializations'?: Specialization<Shadow>[];
  'blur-material-specializations'?: Specialization<number | null>[];
  'opacity-specializations'?: Specialization<number>[];
  'translucency-specializations'?: Specialization<Translucency>[];
  'hidden-specializations'?: Specialization<boolean>[];
  'position-specializations'?: Specialization<Position>[];
}

export interface SupportedPlatforms {
  squares?: 'shared' | ('iOS' | 'macOS' | 'shared')[];
  circles?: 'watchOS'[];
}

export interface IconManifest {
  groups: Group[];
  'supported-platforms': SupportedPlatforms;
  fill?: FillValue;
  'fill-specializations'?: Specialization<FillValue>[];
  'color-space-for-untagged-svg-colors'?: ColorSpace;
}

// ── Standard MCP result type ──

export interface McpResult {
  content: [{ type: 'text'; text: string }];
  isError?: true;
}
