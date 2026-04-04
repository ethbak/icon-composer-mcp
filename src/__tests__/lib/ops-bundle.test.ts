import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  makeTempDir,
  cleanTempDir,
  writeTempPng,
  writeTempSvg,
  readManifest,
  listAssets,
  assetExists,
  createFixtureBundle,
  responseText,
  isErrorResult,
} from '../helpers/test-helpers';
import {
  createIcon,
  addLayerToBundle,
  removeFromBundle,
  inspectBundle,
} from '../../lib/ops-bundle';
import type { CreateIconParams, AddLayerParams, RemoveParams } from '../../lib/ops-bundle';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await makeTempDir('ops-bundle-');
});

afterEach(async () => {
  await cleanTempDir(tmpDir);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCreateParams(overrides: Partial<CreateIconParams> = {}): CreateIconParams {
  return {
    foreground_path: '', // must be set per test
    output_dir: tmpDir,
    bundle_name: 'TestIcon',
    bg_color: '#0A66C2',
    glyph_scale: 1.0,
    specular: true,
    shadow_kind: 'layer-color',
    shadow_opacity: 0.5,
    translucency_enabled: false,
    translucency_value: 0.4,
    ...overrides,
  };
}

function defaultAddLayerParams(overrides: Partial<AddLayerParams> = {}): AddLayerParams {
  return {
    bundle_path: '',
    image_path: '',
    layer_name: 'overlay',
    group_index: 0,
    create_group: false,
    opacity: 1.0,
    scale: 1.0,
    offset_x: 0,
    offset_y: 0,
    blend_mode: 'normal',
    glass: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createIcon
// ---------------------------------------------------------------------------

describe('createIcon', () => {
  test('minimal params — creates bundle with manifest and asset', async () => {
    const pngPath = await writeTempPng(tmpDir);
    const result = await createIcon(defaultCreateParams({ foreground_path: pngPath }));

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('Created .icon bundle at:');

    const bundlePath = path.join(tmpDir, 'TestIcon.icon');
    const manifest = await readManifest(bundlePath);
    expect(manifest.groups).toHaveLength(1);
    expect(manifest.groups[0].name).toBe('Foreground');
    expect(manifest.groups[0].layers).toHaveLength(1);
    expect(manifest.groups[0].layers[0]['image-name']).toBe('foreground.png');
    expect(manifest.groups[0].layers[0].name).toBe('glyph');

    const assets = await listAssets(bundlePath);
    expect(assets).toContain('foreground.png');
  });

  test('dark mode — creates fill specializations', async () => {
    const pngPath = await writeTempPng(tmpDir);
    const result = await createIcon(defaultCreateParams({
      foreground_path: pngPath,
      dark_bg_color: '#1A1A2E',
    }));

    expect(isErrorResult(result)).toBe(false);

    const bundlePath = path.join(tmpDir, 'TestIcon.icon');
    const manifest = await readManifest(bundlePath);
    expect(manifest['fill-specializations']).toBeDefined();
    expect(manifest['fill-specializations']!.length).toBe(2);
    expect(manifest['fill-specializations']![1].appearance).toBe('dark');
  });

  test('SVG input — uses .svg extension for asset', async () => {
    const svgPath = await writeTempSvg(tmpDir);
    const result = await createIcon(defaultCreateParams({ foreground_path: svgPath }));

    expect(isErrorResult(result)).toBe(false);

    const bundlePath = path.join(tmpDir, 'TestIcon.icon');
    const manifest = await readManifest(bundlePath);
    expect(manifest.groups[0].layers[0]['image-name']).toBe('foreground.svg');

    const assets = await listAssets(bundlePath);
    expect(assets).toContain('foreground.svg');
  });

  test('missing file — returns error result', async () => {
    const result = await createIcon(defaultCreateParams({
      foreground_path: path.join(tmpDir, 'nonexistent.png'),
    }));

    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('Error:');
  });
});

// ---------------------------------------------------------------------------
// addLayerToBundle
// ---------------------------------------------------------------------------

describe('addLayerToBundle', () => {
  test('add to existing group', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'AddTest');
    const pngPath = await writeTempPng(tmpDir, 'overlay.png');

    const result = await addLayerToBundle(defaultAddLayerParams({
      bundle_path: bundlePath,
      image_path: pngPath,
      layer_name: 'overlay',
      group_index: 0,
    }));

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('Added layer "overlay"');

    const manifest = await readManifest(bundlePath);
    expect(manifest.groups[0].layers).toHaveLength(2);
    expect(manifest.groups[0].layers[1].name).toBe('overlay');

    expect(await assetExists(bundlePath, 'overlay.png')).toBe(true);
  });

  test('create new group', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'NewGroup');
    const pngPath = await writeTempPng(tmpDir, 'bg.png');

    const result = await addLayerToBundle(defaultAddLayerParams({
      bundle_path: bundlePath,
      image_path: pngPath,
      layer_name: 'background',
      create_group: true,
    }));

    expect(isErrorResult(result)).toBe(false);

    const manifest = await readManifest(bundlePath);
    expect(manifest.groups).toHaveLength(2);
    expect(manifest.groups[1].name).toBe('background');
    expect(manifest.groups[1].layers[0].name).toBe('background');
  });

  test('path traversal in layer_name — sanitized to safe filename', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'Traversal');
    const pngPath = await writeTempPng(tmpDir, 'evil.png');

    const result = await addLayerToBundle(defaultAddLayerParams({
      bundle_path: bundlePath,
      image_path: pngPath,
      layer_name: '../../etc/passwd',
      group_index: 0,
    }));

    expect(isErrorResult(result)).toBe(false);

    // Asset should be written as "passwd.png" inside Assets/, not escaped
    expect(await assetExists(bundlePath, 'passwd.png')).toBe(true);

    const manifest = await readManifest(bundlePath);
    const addedLayer = manifest.groups[0].layers[1];
    expect(addedLayer['image-name']).toBe('passwd.png');
    expect(addedLayer.name).toBe('passwd');
  });

  test('special characters in layer_name — replaced with underscore', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'SpecialChars');
    const pngPath = await writeTempPng(tmpDir, 'icon.png');

    const result = await addLayerToBundle(defaultAddLayerParams({
      bundle_path: bundlePath,
      image_path: pngPath,
      layer_name: 'my icon@2x',
      group_index: 0,
    }));

    expect(isErrorResult(result)).toBe(false);
    expect(await assetExists(bundlePath, 'my_icon_2x.png')).toBe(true);
  });

  test('empty bundle auto-creates group', async () => {
    // Create a bundle with zero groups
    const bundlePath = path.join(tmpDir, 'Empty.icon');
    await fs.mkdir(path.join(bundlePath, 'Assets'), { recursive: true });
    await fs.writeFile(
      path.join(bundlePath, 'icon.json'),
      JSON.stringify({ groups: [], 'supported-platforms': { squares: 'shared' } }, null, 2),
    );

    const pngPath = await writeTempPng(tmpDir, 'first.png');
    const result = await addLayerToBundle(defaultAddLayerParams({
      bundle_path: bundlePath,
      image_path: pngPath,
      layer_name: 'first',
    }));

    expect(isErrorResult(result)).toBe(false);

    const manifest = await readManifest(bundlePath);
    expect(manifest.groups).toHaveLength(1);
    expect(manifest.groups[0].name).toBe('first');
  });
});

// ---------------------------------------------------------------------------
// removeFromBundle
// ---------------------------------------------------------------------------

describe('removeFromBundle', () => {
  test('remove layer', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'RemLayer', { layerCount: 2 });

    const result = await removeFromBundle({
      bundle_path: bundlePath,
      target: 'layer',
      group_index: 0,
      layer_index: 0,
      cleanup_assets: true,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('Removed layer');

    const manifest = await readManifest(bundlePath);
    expect(manifest.groups[0].layers).toHaveLength(1);
  });

  test('remove group', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'RemGroup', { groupCount: 2 });

    const result = await removeFromBundle({
      bundle_path: bundlePath,
      target: 'group',
      group_index: 0,
      cleanup_assets: true,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('Removed group');

    const manifest = await readManifest(bundlePath);
    expect(manifest.groups).toHaveLength(1);
    expect(manifest.groups[0].name).toBe('Group1');
  });

  test('shared asset survival — asset kept when still referenced', async () => {
    // Create a bundle where two layers in different groups share the same image name
    const bundlePath = path.join(tmpDir, 'Shared.icon');
    await fs.mkdir(path.join(bundlePath, 'Assets'), { recursive: true });

    const sharedImage = 'shared.png';
    await fs.writeFile(path.join(bundlePath, 'Assets', sharedImage), Buffer.from('fake'));

    const manifest = {
      groups: [
        {
          name: 'G0',
          layers: [{ 'image-name': sharedImage, name: 'layer-a' }],
        },
        {
          name: 'G1',
          layers: [{ 'image-name': sharedImage, name: 'layer-b' }],
        },
      ],
      'supported-platforms': { squares: 'shared' as const },
    };
    await fs.writeFile(path.join(bundlePath, 'icon.json'), JSON.stringify(manifest, null, 2));

    // Remove group 0 — shared.png should survive because G1 still references it
    const result = await removeFromBundle({
      bundle_path: bundlePath,
      target: 'group',
      group_index: 0,
      cleanup_assets: true,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(await assetExists(bundlePath, sharedImage)).toBe(true);
  });

  test('group index out of range — returns error', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'OOB');

    const result = await removeFromBundle({
      bundle_path: bundlePath,
      target: 'group',
      group_index: 99,
      cleanup_assets: false,
    });

    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('out of range');
  });

  test('layer index out of range — returns error', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'LayerOOB');

    const result = await removeFromBundle({
      bundle_path: bundlePath,
      target: 'layer',
      group_index: 0,
      layer_index: 99,
      cleanup_assets: false,
    });

    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('out of range');
  });

  test('target=layer without layer_index — returns error', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'NoIdx');

    const result = await removeFromBundle({
      bundle_path: bundlePath,
      target: 'layer',
      group_index: 0,
      cleanup_assets: false,
    });

    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('layer_index is required');
  });
});

// ---------------------------------------------------------------------------
// inspectBundle
// ---------------------------------------------------------------------------

describe('inspectBundle', () => {
  test('valid bundle — returns manifest and asset list', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'Inspect', { layerCount: 2 });

    const result = await inspectBundle({ bundle_path: bundlePath });

    expect(isErrorResult(result)).toBe(false);
    const text = responseText(result);
    expect(text).toContain('Manifest:');
    expect(text).toContain('Assets:');
    expect(text).toContain('g0_l0.png');
    expect(text).toContain('g0_l1.png');
    expect(text).toContain('KB');
  });

  test('empty bundle — returns (none) for assets', async () => {
    const bundlePath = path.join(tmpDir, 'Empty.icon');
    await fs.mkdir(bundlePath, { recursive: true });
    await fs.writeFile(
      path.join(bundlePath, 'icon.json'),
      JSON.stringify({ groups: [], 'supported-platforms': { squares: 'shared' } }, null, 2),
    );

    const result = await inspectBundle({ bundle_path: bundlePath });

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('(none)');
  });
});
