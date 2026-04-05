import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import {
  makeTempDir,
  cleanTempDir,
  createFixtureBundle,
  readManifest,
  responseText,
  isErrorResult,
} from '../helpers/test-helpers';
import {
  setGlassEffects,
  setAppearances,
  setFill,
  setLayerPosition,
  toggleFx,
} from '../../lib/ops-glass';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await makeTempDir('ops-glass-');
});

afterEach(async () => {
  await cleanTempDir(tmpDir);
});

// ---------------------------------------------------------------------------
// setGlassEffects
// ---------------------------------------------------------------------------
describe('setGlassEffects', () => {
  test('set specular to false', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'specular', { specular: true });
    const result = await setGlassEffects({ bundle_path: bundle, group_index: 0, specular: false });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    expect(m.groups[0].specular).toBe(false);
  });

  test('set blur_material', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'blur');
    const result = await setGlassEffects({ bundle_path: bundle, group_index: 0, blur_material: 0.7 });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    expect(m.groups[0]['blur-material']).toBe(0.7);
  });

  test('set shadow kind and opacity', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'shadow');
    const result = await setGlassEffects({
      bundle_path: bundle,
      group_index: 0,
      shadow_kind: 'neutral',
      shadow_opacity: 0.8,
    });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    expect(m.groups[0].shadow).toEqual({ kind: 'neutral', opacity: 0.8 });
  });

  test('set translucency', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'trans');
    const result = await setGlassEffects({
      bundle_path: bundle,
      group_index: 0,
      translucency_enabled: true,
      translucency_value: 0.6,
    });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    expect(m.groups[0].translucency).toEqual({ enabled: true, value: 0.6 });
  });

  test('set blend_mode', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'blend');
    const result = await setGlassEffects({ bundle_path: bundle, group_index: 0, blend_mode: 'multiply' });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    expect(m.groups[0]['blend-mode']).toBe('multiply');
  });

  test('set lighting', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'light');
    const result = await setGlassEffects({ bundle_path: bundle, group_index: 0, lighting: 'individual' });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    expect(m.groups[0].lighting).toBe('individual');
  });

  test('empty bundle returns error', async () => {
    // Create a bundle with 0 groups manually
    const { writeIconBundle } = await import('../../lib/bundle');
    const { createManifest } = await import('../../lib/manifest');
    const manifest = createManifest();
    // manifest has 0 groups by default
    const bundlePath = await writeIconBundle(tmpDir, 'empty', manifest, new Map());
    const result = await setGlassEffects({ bundle_path: bundlePath, group_index: 0 });
    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('No groups');
  });

  test('group_index clamped to last group', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'clamp', { groupCount: 2 });
    const result = await setGlassEffects({ bundle_path: bundle, group_index: 99, specular: false });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    // Should have modified the last group (index 1), not index 0
    expect(m.groups[1].specular).toBe(false);
    expect(m.groups[0].specular).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setAppearances
// ---------------------------------------------------------------------------
describe('setAppearances', () => {
  test('fill target with dark appearance', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'fill-dark', { fill: '#FF0000' });
    const result = await setAppearances({
      bundle_path: bundle,
      target: 'fill',
      group_index: 0,
      appearance: 'dark',
      bg_color: '#000000',
    });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    expect(m['fill-specializations']).toBeDefined();
    const darkSpec = m['fill-specializations']!.find((s) => s.appearance === 'dark');
    expect(darkSpec).toBeDefined();
    expect(darkSpec!.value).toHaveProperty('solid');
  });

  test('fill target moves existing fill to specializations', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'fill-move', { fill: '#00FF00' });
    // The fixture uses fill (no specializations) when no darkFill is provided
    // Actually createFixtureBundle always sets fill. Let's verify the move behavior.
    const mBefore = await readManifest(bundle);
    // Fixture with fill but no darkFill should have manifest.fill set
    const hadFill = mBefore.fill !== undefined;

    const result = await setAppearances({
      bundle_path: bundle,
      target: 'fill',
      group_index: 0,
      appearance: 'dark',
      bg_color: '#111111',
    });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    // fill should be deleted, moved to specializations
    expect(m.fill).toBeUndefined();
    expect(m['fill-specializations']).toBeDefined();
    // Should have the default (moved from fill) + the dark one
    if (hadFill) {
      expect(m['fill-specializations']!.length).toBeGreaterThanOrEqual(2);
      const defaultSpec = m['fill-specializations']!.find((s) => s.appearance === undefined);
      expect(defaultSpec).toBeDefined();
    }
  });

  test('group target with specular specialization', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'grp-spec');
    const result = await setAppearances({
      bundle_path: bundle,
      target: 'group',
      group_index: 0,
      appearance: 'dark',
      specular: false,
    });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    const specs = m.groups[0]['specular-specializations'];
    expect(specs).toBeDefined();
    expect(specs!.find((s) => s.appearance === 'dark')?.value).toBe(false);
  });

  test('group target with shadow specialization', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'grp-shadow');
    const result = await setAppearances({
      bundle_path: bundle,
      target: 'group',
      group_index: 0,
      appearance: 'tinted',
      shadow_kind: 'neutral',
      shadow_opacity: 0.3,
    });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    const specs = m.groups[0]['shadow-specializations'];
    expect(specs).toBeDefined();
    const tintedSpec = specs!.find((s) => s.appearance === 'tinted');
    expect(tintedSpec).toBeDefined();
    expect(tintedSpec!.value).toEqual({ kind: 'neutral', opacity: 0.3 });
  });
});

// ---------------------------------------------------------------------------
// setFill
// ---------------------------------------------------------------------------
describe('setFill', () => {
  test('solid fill', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'solid');
    const result = await setFill({ bundle_path: bundle, fill_type: 'solid', color: '#FF5500', gradient_angle: 0 });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    expect(m.fill).toHaveProperty('solid');
  });

  test('gradient at 0 degrees', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'grad0');
    const result = await setFill({
      bundle_path: bundle,
      fill_type: 'gradient',
      color: '#FF0000',
      color2: '#0000FF',
      gradient_angle: 0,
    });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    const fill = m.fill as any;
    expect(fill['linear-gradient']).toHaveLength(2);
    // At 0 degrees: sin(0)=0, cos(0)=1 → start.x=0.5, start.y=1.0, stop.x=0.5, stop.y=0.0
    expect(fill.orientation.start.x).toBeCloseTo(0.5);
    expect(fill.orientation.start.y).toBeCloseTo(1.0);
    expect(fill.orientation.stop.x).toBeCloseTo(0.5);
    expect(fill.orientation.stop.y).toBeCloseTo(0.0);
  });

  test('gradient at 90 degrees', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'grad90');
    const result = await setFill({
      bundle_path: bundle,
      fill_type: 'gradient',
      color: '#FF0000',
      color2: '#00FF00',
      gradient_angle: 90,
    });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    const fill = m.fill as any;
    // At 90 degrees: sin(90)=1, cos(90)=0 → start.x=0.0, start.y=0.5, stop.x=1.0, stop.y=0.5
    expect(fill.orientation.start.x).toBeCloseTo(0.0);
    expect(fill.orientation.start.y).toBeCloseTo(0.5);
    expect(fill.orientation.stop.x).toBeCloseTo(1.0);
    expect(fill.orientation.stop.y).toBeCloseTo(0.5);
  });

  test('automatic fill', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'auto');
    const result = await setFill({ bundle_path: bundle, fill_type: 'automatic', gradient_angle: 0 });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    expect(m.fill).toBe('automatic');
  });

  test('none fill', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'none');
    const result = await setFill({ bundle_path: bundle, fill_type: 'none', gradient_angle: 0 });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    expect(m.fill).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// setLayerPosition
// ---------------------------------------------------------------------------
describe('setLayerPosition', () => {
  test('layer target sets position', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'layerpos');
    const result = await setLayerPosition({
      bundle_path: bundle,
      target: 'layer',
      group_index: 0,
      layer_index: 0,
      scale: 0.5,
      offset_x: 10,
      offset_y: -20,
    });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    const pos = m.groups[0].layers[0].position!;
    expect(pos.scale).toBe(0.5);
    expect(pos['translation-in-points']).toEqual([10, -20]);
  });

  test('group target sets position', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'grppos');
    const result = await setLayerPosition({
      bundle_path: bundle,
      target: 'group',
      group_index: 0,
      scale: 1.5,
      offset_x: 5,
      offset_y: 5,
    });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    const pos = m.groups[0].position!;
    expect(pos.scale).toBe(1.5);
    expect(pos['translation-in-points']).toEqual([5, 5]);
  });

  test('preserves existing position values when partial update', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'preserve');
    // First set full position
    await setLayerPosition({
      bundle_path: bundle,
      target: 'layer',
      group_index: 0,
      layer_index: 0,
      scale: 0.8,
      offset_x: 15,
      offset_y: 25,
    });
    // Then update only scale
    const result = await setLayerPosition({
      bundle_path: bundle,
      target: 'layer',
      group_index: 0,
      layer_index: 0,
      scale: 1.2,
    });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    const pos = m.groups[0].layers[0].position!;
    expect(pos.scale).toBe(1.2);
    // offsets should be preserved
    expect(pos['translation-in-points']).toEqual([15, 25]);
  });

  test('out-of-range layer index returns error', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'oor', { layerCount: 1 });
    const result = await setLayerPosition({
      bundle_path: bundle,
      target: 'layer',
      group_index: 0,
      layer_index: 5,
      scale: 1.0,
    });
    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('out of range');
  });

  test('empty bundle returns error', async () => {
    const { writeIconBundle } = await import('../../lib/bundle');
    const { createManifest } = await import('../../lib/manifest');
    const manifest = createManifest();
    const bundlePath = await writeIconBundle(tmpDir, 'empty', manifest, new Map());
    const result = await setLayerPosition({
      bundle_path: bundlePath,
      target: 'layer',
      group_index: 0,
      scale: 1.0,
    });
    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('No groups');
  });
});

// ---------------------------------------------------------------------------
// toggleFx
// ---------------------------------------------------------------------------
describe('toggleFx', () => {
  test('enable FX sets specular and shadow', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'enable', {
      specular: false,
      shadow: { kind: 'none', opacity: 0 },
    });
    const result = await toggleFx({ bundle_path: bundle, enabled: true });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    expect(m.groups[0].specular).toBe(true);
    expect(m.groups[0].shadow!.kind).toBe('layer-color');
    expect(m.groups[0].shadow!.opacity).toBe(0.5);
  });

  test('disable FX clears specular, shadow, and translucency', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'disable', {
      specular: true,
      shadow: { kind: 'layer-color', opacity: 0.5 },
      translucency: { enabled: true, value: 0.6 },
    });
    const result = await toggleFx({ bundle_path: bundle, enabled: false });
    expect(isErrorResult(result)).toBe(false);
    const m = await readManifest(bundle);
    expect(m.groups[0].specular).toBe(false);
    expect(m.groups[0].shadow).toEqual({ kind: 'none', opacity: 0 });
    expect(m.groups[0].translucency!.enabled).toBe(false);
  });

  test('blur-material is preserved when disabling FX', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'blur-preserve', {
      blurMaterial: 0.8,
    });
    await toggleFx({ bundle_path: bundle, enabled: false });
    const m = await readManifest(bundle);
    expect(m.groups[0]['blur-material']).toBe(0.8);
  });

  test('multi-group toggle affects all groups', async () => {
    const bundle = await createFixtureBundle(tmpDir, 'multi', {
      groupCount: 3,
      specular: true,
      shadow: { kind: 'layer-color', opacity: 0.5 },
    });
    const result = await toggleFx({ bundle_path: bundle, enabled: false });
    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('3 group(s)');
    const m = await readManifest(bundle);
    for (const group of m.groups) {
      expect(group.specular).toBe(false);
      expect(group.shadow).toEqual({ kind: 'none', opacity: 0 });
    }
  });
});
