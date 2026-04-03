import { test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { makeTempDir, cleanTempDir } from '../helpers/test-helpers';
import { TEST_PNG } from '../helpers/fixtures';
import { readIconBundle, writeIconBundle, saveManifest, DEFAULT_MAX_ASSET_BYTES } from '../../lib/bundle';
import type { IconManifest } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalManifest(): IconManifest {
  return {
    groups: [],
    'supported-platforms': { squares: 'shared' },
  };
}

function makeComplexManifest(): IconManifest {
  return {
    groups: [
      {
        name: 'GroupA',
        specular: true,
        shadow: { kind: 'layer-color', opacity: 0.5 },
        layers: [
          {
            'image-name': 'glyph.png',
            name: 'glyph',
            glass: true,
            fill: { solid: 'srgb:1,0,0,1' },
          },
        ],
        'specular-specializations': [
          { appearance: 'dark', value: false },
        ],
      },
      {
        name: 'GroupB',
        translucency: { enabled: true, value: 0.7 },
        layers: [
          {
            'image-name': 'bg.png',
            name: 'background',
            opacity: 0.9,
          },
        ],
      },
    ],
    'supported-platforms': { squares: ['iOS', 'macOS'] },
    fill: { solid: 'srgb:0.063,0.400,0.761,1' },
    'fill-specializations': [
      { appearance: 'dark', value: { solid: 'srgb:0,0.2,0.5,1' } },
    ],
    'color-space-for-untagged-svg-colors': 'srgb',
  };
}

// ---------------------------------------------------------------------------
// Read tests
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await makeTempDir('bundle-test-');
});

afterEach(async () => {
  await cleanTempDir(tmpDir);
});

// R-1: Write a bundle then read it back
test('R-1: write then read — manifest matches and assets Map contains the PNG', async () => {
  const manifest = makeMinimalManifest();
  const assets = new Map<string, Buffer>([['icon.png', TEST_PNG]]);

  const bundlePath = await writeIconBundle(tmpDir, 'MyIcon', manifest, assets);
  const result = await readIconBundle(bundlePath);

  expect(result.manifest).toEqual(manifest);
  expect(result.assets.has('icon.png')).toBe(true);
  expect(result.assets.get('icon.png')).toEqual(TEST_PNG);
});

// R-2: Bundle with no Assets dir reads successfully
test('R-2: no Assets dir — assets Map is empty', async () => {
  const manifest = makeMinimalManifest();
  const bundlePath = path.join(tmpDir, 'NoAssets.icon');
  await fs.mkdir(bundlePath, { recursive: true });
  await fs.writeFile(
    path.join(bundlePath, 'icon.json'),
    JSON.stringify(manifest, null, 2)
  );

  const result = await readIconBundle(bundlePath);
  expect(result.assets.size).toBe(0);
  expect(result.manifest).toEqual(manifest);
});

// R-2b: Asset exceeding default size limit — throws
test('R-2b: oversized asset — throws with size info', async () => {
  const manifest = makeMinimalManifest();
  const bundlePath = path.join(tmpDir, 'BigAsset.icon');
  const assetsPath = path.join(bundlePath, 'Assets');
  await fs.mkdir(assetsPath, { recursive: true });
  await fs.writeFile(path.join(bundlePath, 'icon.json'), JSON.stringify(manifest, null, 2));

  // Write a file that exceeds a small custom limit
  await fs.writeFile(path.join(assetsPath, 'big.png'), Buffer.alloc(1024));

  await expect(readIconBundle(bundlePath, 512)).rejects.toThrow('exceeds maximum size');
});

// R-2c: Asset within custom limit — reads successfully
test('R-2c: asset within custom limit — reads fine', async () => {
  const manifest = makeMinimalManifest();
  const bundlePath = path.join(tmpDir, 'SmallAsset.icon');
  const assetsPath = path.join(bundlePath, 'Assets');
  await fs.mkdir(assetsPath, { recursive: true });
  await fs.writeFile(path.join(bundlePath, 'icon.json'), JSON.stringify(manifest, null, 2));

  await fs.writeFile(path.join(assetsPath, 'ok.png'), Buffer.alloc(256));

  const result = await readIconBundle(bundlePath, 512);
  expect(result.assets.has('ok.png')).toBe(true);
});

// R-2d: DEFAULT_MAX_ASSET_BYTES is 20MB
test('R-2d: default max asset size is 20 MB', () => {
  expect(DEFAULT_MAX_ASSET_BYTES).toBe(20 * 1024 * 1024);
});

// R-3: Bundle path doesn't exist — throws ENOENT
test('R-3: bundle path does not exist — throws', async () => {
  const missing = path.join(tmpDir, 'nonexistent.icon');
  await expect(readIconBundle(missing)).rejects.toThrow();
});

// R-4: icon.json is invalid JSON — throws SyntaxError
test('R-4: invalid icon.json JSON — throws SyntaxError', async () => {
  const bundlePath = path.join(tmpDir, 'Bad.icon');
  await fs.mkdir(bundlePath, { recursive: true });
  await fs.writeFile(path.join(bundlePath, 'icon.json'), '{ not valid json !!!');

  await expect(readIconBundle(bundlePath)).rejects.toBeInstanceOf(SyntaxError);
});

// R-5: icon.json contains [] — throws with 'valid IconManifest object'
test('R-5: icon.json is an array — throws with valid message', async () => {
  const bundlePath = path.join(tmpDir, 'Array.icon');
  await fs.mkdir(bundlePath, { recursive: true });
  await fs.writeFile(path.join(bundlePath, 'icon.json'), '[]');

  await expect(readIconBundle(bundlePath)).rejects.toThrow('valid IconManifest object');
});

// R-6: Roundtrip fidelity — complex manifest fully preserved
test('R-6: complex manifest roundtrip fidelity', async () => {
  const manifest = makeComplexManifest();
  const assets = new Map<string, Buffer>([
    ['glyph.png', TEST_PNG],
    ['bg.png', TEST_PNG],
  ]);

  const bundlePath = await writeIconBundle(tmpDir, 'Complex', manifest, assets);
  const result = await readIconBundle(bundlePath);

  expect(result.manifest).toEqual(manifest);
  expect(result.assets.size).toBe(2);
  expect(result.assets.has('glyph.png')).toBe(true);
  expect(result.assets.has('bg.png')).toBe(true);
});

// ---------------------------------------------------------------------------
// Write tests
// ---------------------------------------------------------------------------

// W-1: Creates expected directory structure, returns correct path
test('W-1: creates expected directory structure and returns correct path', async () => {
  const manifest = makeMinimalManifest();
  const assets = new Map<string, Buffer>([['test.png', TEST_PNG]]);

  const bundlePath = await writeIconBundle(tmpDir, 'TestIcon', manifest, assets);

  expect(bundlePath).toBe(path.join(tmpDir, 'TestIcon.icon'));

  const manifestStat = await fs.stat(path.join(bundlePath, 'icon.json'));
  expect(manifestStat.isFile()).toBe(true);

  const assetStat = await fs.stat(path.join(bundlePath, 'Assets', 'test.png'));
  expect(assetStat.isFile()).toBe(true);
});

// W-2: Empty assets map — Assets dir still created
test('W-2: empty assets map — Assets dir is still created', async () => {
  const manifest = makeMinimalManifest();
  const bundlePath = await writeIconBundle(tmpDir, 'EmptyAssets', manifest, new Map());

  const stat = await fs.stat(path.join(bundlePath, 'Assets'));
  expect(stat.isDirectory()).toBe(true);
});

// W-3: Overwrite existing bundle — listed files overwritten, others remain
test('W-3: overwrite existing bundle — listed files overwritten, unlisted files untouched', async () => {
  const manifest = makeMinimalManifest();
  const assets = new Map<string, Buffer>([['icon.png', TEST_PNG]]);

  // First write
  const bundlePath = await writeIconBundle(tmpDir, 'Overwrite', manifest, assets);

  // Add an extra file not tracked by the manifest
  const extraPath = path.join(bundlePath, 'Assets', 'extra.png');
  await fs.writeFile(extraPath, TEST_PNG);

  // Overwrite with updated manifest
  const updatedManifest: IconManifest = {
    ...manifest,
    fill: { solid: 'srgb:1,0,0,1' },
  };
  await writeIconBundle(tmpDir, 'Overwrite', updatedManifest, assets);

  // Extra file should still exist
  const extraStat = await fs.stat(extraPath);
  expect(extraStat.isFile()).toBe(true);

  // icon.json should have updated content
  const raw = await fs.readFile(path.join(bundlePath, 'icon.json'), 'utf-8');
  const parsed = JSON.parse(raw);
  expect(parsed.fill).toEqual({ solid: 'srgb:1,0,0,1' });
});

// W-4: outputDir doesn't exist — mkdir recursive creates it
test('W-4: outputDir does not exist — mkdir recursive creates it', async () => {
  const deepDir = path.join(tmpDir, 'deep', 'nested', 'dir');
  const manifest = makeMinimalManifest();

  const bundlePath = await writeIconBundle(deepDir, 'DeepIcon', manifest, new Map());

  const stat = await fs.stat(bundlePath);
  expect(stat.isDirectory()).toBe(true);
});

// W-5: icon.json has 2-space indentation
test('W-5: icon.json uses 2-space indentation', async () => {
  const manifest = makeMinimalManifest();
  const bundlePath = await writeIconBundle(tmpDir, 'Indent', manifest, new Map());

  const raw = await fs.readFile(path.join(bundlePath, 'icon.json'), 'utf-8');
  expect(raw).toBe(JSON.stringify(manifest, null, 2));
  // Spot-check: first real indented line uses exactly 2 spaces
  const lines = raw.split('\n');
  const indentedLine = lines.find(l => l.startsWith('  ') && !l.startsWith('   '));
  expect(indentedLine).toBeDefined();
});

// W-6: writeIconBundle rejects unsafe asset filenames (defense-in-depth)
test('W-6: rejects asset filename with path traversal', async () => {
  const manifest = makeMinimalManifest();
  const assets = new Map<string, Buffer>([['../evil.png', TEST_PNG]]);

  await expect(writeIconBundle(tmpDir, 'Evil', manifest, assets)).rejects.toThrow(
    'Unsafe asset filename'
  );
});

test('W-7: rejects asset filename with subdirectory', async () => {
  const manifest = makeMinimalManifest();
  const assets = new Map<string, Buffer>([['sub/dir.png', TEST_PNG]]);

  await expect(writeIconBundle(tmpDir, 'SubDir', manifest, assets)).rejects.toThrow(
    'Unsafe asset filename'
  );
});

// ---------------------------------------------------------------------------
// saveManifest tests
// ---------------------------------------------------------------------------

// S-1: saveManifest updates icon.json, Assets untouched
test('S-1: saveManifest updates icon.json, Assets directory untouched', async () => {
  const manifest = makeMinimalManifest();
  const assets = new Map<string, Buffer>([['asset.png', TEST_PNG]]);
  const bundlePath = await writeIconBundle(tmpDir, 'Save', manifest, assets);

  const updated: IconManifest = { ...manifest, fill: { solid: 'srgb:0,0,1,1' } };
  await saveManifest(bundlePath, updated);

  const raw = await fs.readFile(path.join(bundlePath, 'icon.json'), 'utf-8');
  const parsed = JSON.parse(raw);
  expect(parsed.fill).toEqual({ solid: 'srgb:0,0,1,1' });

  // Asset should still exist untouched
  const assetStat = await fs.stat(path.join(bundlePath, 'Assets', 'asset.png'));
  expect(assetStat.isFile()).toBe(true);
});

// S-2: saveManifest doesn't create Assets dir if missing
test('S-2: saveManifest does not create Assets dir if it is missing', async () => {
  const bundlePath = path.join(tmpDir, 'NoAssets2.icon');
  await fs.mkdir(bundlePath, { recursive: true });

  const manifest = makeMinimalManifest();
  await saveManifest(bundlePath, manifest);

  let assetsExists = false;
  try {
    await fs.stat(path.join(bundlePath, 'Assets'));
    assetsExists = true;
  } catch {
    // expected
  }
  expect(assetsExists).toBe(false);
});

// S-3: saveManifest preserves 2-space JSON indentation
test('S-3: saveManifest uses 2-space indentation', async () => {
  const bundlePath = path.join(tmpDir, 'Indent2.icon');
  await fs.mkdir(bundlePath, { recursive: true });

  const manifest = makeComplexManifest();
  await saveManifest(bundlePath, manifest);

  const raw = await fs.readFile(path.join(bundlePath, 'icon.json'), 'utf-8');
  expect(raw).toBe(JSON.stringify(manifest, null, 2));
});

// S-4: saveManifest throws when bundle dir doesn't exist
test('S-4: saveManifest throws when bundle directory does not exist', async () => {
  const missing = path.join(tmpDir, 'missing.icon');
  const manifest = makeMinimalManifest();

  await expect(saveManifest(missing, manifest)).rejects.toThrow();
});

// S-5: Read-mutate-save loop — 3 iterations toggle specular, final state correct
test('S-5: read-mutate-save loop — 3 iterations toggle specular, final state is correct', async () => {
  const manifest: IconManifest = {
    groups: [
      {
        name: 'MainGroup',
        specular: true,
        layers: [],
      },
    ],
    'supported-platforms': { squares: 'shared' },
  };

  const bundlePath = await writeIconBundle(tmpDir, 'Loop', manifest, new Map());

  for (let i = 0; i < 3; i++) {
    const { manifest: current } = await readIconBundle(bundlePath);
    const currentSpecular = current.groups[0]?.specular ?? false;
    const updated: IconManifest = {
      ...current,
      groups: current.groups.map((g, idx) =>
        idx === 0 ? { ...g, specular: !currentSpecular } : g
      ),
    };
    await saveManifest(bundlePath, updated);
  }

  // Started true → false → true → false after 3 toggles
  const { manifest: final } = await readIconBundle(bundlePath);
  expect(final.groups[0]?.specular).toBe(false);
});

// ---------------------------------------------------------------------------
// Round-trip fidelity with Apple-authored bundle
// ---------------------------------------------------------------------------

const APPLE_FIXTURE = path.join(__dirname, '..', 'fixtures', 'apple-authored.icon');

test('RT-1: read Apple-authored bundle without errors', async () => {
  const { manifest, assets } = await readIconBundle(APPLE_FIXTURE);
  expect(manifest.groups.length).toBeGreaterThan(0);
  expect(assets.size).toBeGreaterThan(0);
  expect(manifest['supported-platforms']).toBeDefined();
});

test('RT-2: round-trip preserves manifest exactly', async () => {
  const { manifest: original, assets: originalAssets } = await readIconBundle(APPLE_FIXTURE);

  // Write to new location
  const roundtripPath = await writeIconBundle(tmpDir, 'Roundtrip', original, originalAssets);

  // Read back
  const { manifest: roundtripped, assets: roundtrippedAssets } = await readIconBundle(roundtripPath);

  // Manifest deep equality
  expect(roundtripped).toEqual(original);

  // Assets byte-identical
  expect(roundtrippedAssets.size).toBe(originalAssets.size);
  for (const [name, buf] of originalAssets) {
    expect(roundtrippedAssets.has(name)).toBe(true);
    expect(roundtrippedAssets.get(name)!.equals(buf)).toBe(true);
  }
});

test('RT-3: modify then round-trip preserves Apple fields alongside changes', async () => {
  const { manifest, assets } = await readIconBundle(APPLE_FIXTURE);

  // Add a new layer
  manifest.groups[0].layers.push({
    'image-name': 'extra.png',
    name: 'extra-layer',
    glass: false,
  });
  assets.set('extra.png', TEST_PNG);

  // Write modified bundle
  const modifiedPath = await writeIconBundle(tmpDir, 'Modified', manifest, assets);
  const { manifest: readBack } = await readIconBundle(modifiedPath);

  // Original fields preserved
  expect(readBack['fill-specializations']).toEqual(manifest['fill-specializations']);
  expect(readBack['supported-platforms']).toEqual(manifest['supported-platforms']);
  expect(readBack.groups[0].specular).toBe(manifest.groups[0].specular);
  expect(readBack.groups[0].shadow).toEqual(manifest.groups[0].shadow);

  // New layer present
  expect(readBack.groups[0].layers).toHaveLength(manifest.groups[0].layers.length);
  expect(readBack.groups[0].layers.at(-1)!.name).toBe('extra-layer');
});
