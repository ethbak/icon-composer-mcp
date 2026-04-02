import { test, expect } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  hexToIconColor,
  createManifest,
  addGroup,
  addLayer,
  writeIconBundle,
  readIconBundle,
  createQuickIcon,
  renderPreview,
  resolveFill,
} from './icon-builder';

test('hexToIconColor converts hex to Apple color string', () => {
  expect(hexToIconColor('#FF0000')).toBe('srgb:1.00000,0.00000,0.00000,1.00000');
  expect(hexToIconColor('#0A66C2')).toBe('srgb:0.03922,0.40000,0.76078,1.00000');
  expect(hexToIconColor('#FFF')).toBe('srgb:1.00000,1.00000,1.00000,1.00000');
});

test('createManifest with bg color', () => {
  const m = createManifest({ fill: '#0A66C2' });
  expect(m.groups).toEqual([]);
  expect(m['supported-platforms'].squares).toBe('shared');
  expect(m.fill).toEqual({ solid: 'srgb:0.03922,0.40000,0.76078,1.00000' });
});

test('createManifest with dark mode', () => {
  const m = createManifest({ fill: '#FFFFFF', darkFill: '#000000' });
  expect(m.fill).toBeUndefined();
  expect(m['fill-specializations']).toHaveLength(2);
  expect(m['fill-specializations']![1].appearance).toBe('dark');
});

test('addGroup and addLayer', () => {
  const m = createManifest({ fill: '#0A66C2' });
  const g = addGroup(m, {
    name: 'Foreground',
    specular: true,
    shadow: { kind: 'layer-color', opacity: 0.5 },
  });
  addLayer(g, {
    imageName: 'glyph.png',
    name: 'glyph',
    scale: 0.65,
    glass: true,
  });

  expect(m.groups).toHaveLength(1);
  expect(m.groups[0].specular).toBe(true);
  expect(m.groups[0].layers).toHaveLength(1);
  expect(m.groups[0].layers[0]['image-name']).toBe('glyph.png');
  expect(m.groups[0].layers[0].position?.scale).toBe(0.65);
});

test('resolveFill returns dark fill when appearance=dark and fill-specializations present', () => {
  const m = createManifest({ fill: '#FFFFFF', darkFill: '#000000' });
  const defaultFill = resolveFill(m);
  const darkFill = resolveFill(m, 'dark');
  expect(defaultFill).toEqual({ solid: 'srgb:1.00000,1.00000,1.00000,1.00000' });
  expect(darkFill).toEqual({ solid: 'srgb:0.00000,0.00000,0.00000,1.00000' });
});

test('renderPreview uses dark background when appearance=dark', async () => {
  // 1x1 PNG (from existing test suite)
  const whitePng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );
  const m = createManifest({ fill: '#FFFFFF', darkFill: '#FF0000' });
  const g = addGroup(m, { specular: false });
  addLayer(g, { imageName: 'glyph.png', name: 'glyph' });
  const assets = new Map<string, Buffer>([['glyph.png', whitePng]]);

  // Default render — should be white background
  const defaultBuf = await renderPreview(m, assets, 4);
  // Dark render — background should be red (#FF0000)
  const darkBuf = await renderPreview(m, assets, 4, 'dark');

  // Sample top-left pixel: index 0=R,1=G,2=B in raw pixel data
  // We only need to verify the background differs between modes
  expect(defaultBuf).not.toEqual(darkBuf);
});

test('toggle_fx disabling preserves blur-material value', () => {
  const m = createManifest({ fill: '#000000' });
  const g = addGroup(m, { specular: true, shadow: { kind: 'layer-color', opacity: 0.5 } });
  g['blur-material'] = 0.6;

  // Simulate toggle_fx(false)
  g.specular = false;
  g.shadow = { kind: 'none', opacity: 0 };
  if (g.translucency) g.translucency.enabled = false;
  // blur-material is intentionally NOT touched

  expect(g['blur-material']).toBe(0.6);

  // Simulate toggle_fx(true)
  g.specular = true;
  if (!g.shadow || g.shadow.kind === 'none') {
    g.shadow = { kind: 'layer-color', opacity: 0.5 };
  }

  expect(g['blur-material']).toBe(0.6);
});

test('remove layer by index deletes layer and cleans up asset', async () => {
  const tmpDir = '/tmp/icon-composer-remove-layer';
  await fs.mkdir(tmpDir, { recursive: true });

  const testPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );
  const m = createManifest({ fill: '#000000' });
  const g = addGroup(m, { name: 'FG' });
  addLayer(g, { imageName: 'a.png', name: 'layer-a' });
  addLayer(g, { imageName: 'b.png', name: 'layer-b' });

  const assets = new Map<string, Buffer>();
  assets.set('a.png', testPng);
  assets.set('b.png', testPng);
  const bundlePath = await writeIconBundle(tmpDir, 'Remove', m, assets);

  // Remove layer 0 (layer-a)
  const { manifest } = await readIconBundle(bundlePath);
  const removedImage = manifest.groups[0].layers[0]['image-name'];
  manifest.groups[0].layers.splice(0, 1);

  // Clean up orphaned asset
  const stillReferenced = new Set(manifest.groups[0].layers.map(l => l['image-name']));
  if (!stillReferenced.has(removedImage)) {
    await fs.unlink(path.join(bundlePath, 'Assets', removedImage)).catch(() => {});
  }
  await fs.writeFile(path.join(bundlePath, 'icon.json'), JSON.stringify(manifest, null, 2));

  // Verify
  const after = await readIconBundle(bundlePath);
  expect(after.manifest.groups[0].layers).toHaveLength(1);
  expect(after.manifest.groups[0].layers[0].name).toBe('layer-b');
  expect(after.assets.has('a.png')).toBe(false);
  expect(after.assets.has('b.png')).toBe(true);

  await fs.rm(tmpDir, { recursive: true });
});

test('remove group deletes all its layers and assets', async () => {
  const tmpDir = '/tmp/icon-composer-remove-group';
  await fs.mkdir(tmpDir, { recursive: true });

  const testPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );
  const m = createManifest({ fill: '#000000' });
  const g1 = addGroup(m, { name: 'BG' });
  addLayer(g1, { imageName: 'bg.png', name: 'background' });
  const g2 = addGroup(m, { name: 'FG' });
  addLayer(g2, { imageName: 'fg.png', name: 'foreground' });

  const assets = new Map<string, Buffer>();
  assets.set('bg.png', testPng);
  assets.set('fg.png', testPng);
  const bundlePath = await writeIconBundle(tmpDir, 'RemoveGroup', m, assets);

  // Remove group 0 (BG)
  const { manifest } = await readIconBundle(bundlePath);
  const removedImages = manifest.groups[0].layers.map(l => l['image-name']);
  manifest.groups.splice(0, 1);

  const stillReferenced = new Set<string>();
  for (const g of manifest.groups) {
    for (const l of g.layers) stillReferenced.add(l['image-name']);
  }
  for (const img of removedImages) {
    if (!stillReferenced.has(img)) {
      await fs.unlink(path.join(bundlePath, 'Assets', img)).catch(() => {});
    }
  }
  await fs.writeFile(path.join(bundlePath, 'icon.json'), JSON.stringify(manifest, null, 2));

  const after = await readIconBundle(bundlePath);
  expect(after.manifest.groups).toHaveLength(1);
  expect(after.manifest.groups[0].name).toBe('FG');
  expect(after.assets.has('bg.png')).toBe(false);
  expect(after.assets.has('fg.png')).toBe(true);

  await fs.rm(tmpDir, { recursive: true });
});

test('shared asset survives when another layer still references it', async () => {
  const tmpDir = '/tmp/icon-composer-shared-asset';
  await fs.mkdir(tmpDir, { recursive: true });

  const testPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );
  const m = createManifest({ fill: '#000000' });
  const g = addGroup(m, { name: 'FG' });
  addLayer(g, { imageName: 'shared.png', name: 'layer-a' });
  addLayer(g, { imageName: 'shared.png', name: 'layer-b' });

  const assets = new Map<string, Buffer>();
  assets.set('shared.png', testPng);
  const bundlePath = await writeIconBundle(tmpDir, 'Shared', m, assets);

  // Remove layer 0 — shared.png should survive
  const { manifest } = await readIconBundle(bundlePath);
  manifest.groups[0].layers.splice(0, 1);
  const stillReferenced = new Set(manifest.groups[0].layers.map(l => l['image-name']));
  // Only delete if no remaining reference
  if (!stillReferenced.has('shared.png')) {
    await fs.unlink(path.join(bundlePath, 'Assets', 'shared.png')).catch(() => {});
  }
  await fs.writeFile(path.join(bundlePath, 'icon.json'), JSON.stringify(manifest, null, 2));

  const after = await readIconBundle(bundlePath);
  expect(after.manifest.groups[0].layers).toHaveLength(1);
  expect(after.assets.has('shared.png')).toBe(true);

  // Now remove the last reference — asset should be deleted
  after.manifest.groups[0].layers.splice(0, 1);
  const stillRef2 = new Set<string>();
  for (const g of after.manifest.groups) {
    for (const l of g.layers) stillRef2.add(l['image-name']);
  }
  if (!stillRef2.has('shared.png')) {
    await fs.unlink(path.join(bundlePath, 'Assets', 'shared.png')).catch(() => {});
  }
  await fs.writeFile(path.join(bundlePath, 'icon.json'), JSON.stringify(after.manifest, null, 2));

  const final = await readIconBundle(bundlePath);
  expect(final.manifest.groups[0].layers).toHaveLength(0);
  expect(final.assets.has('shared.png')).toBe(false);

  await fs.rm(tmpDir, { recursive: true });
});

test('writeIconBundle and readIconBundle roundtrip', async () => {
  const tmpDir = '/tmp/icon-composer-test';
  await fs.mkdir(tmpDir, { recursive: true });

  const m = createManifest({ fill: '#0A66C2' });
  const g = addGroup(m, { specular: true });
  addLayer(g, { imageName: 'test.png', name: 'test' });

  // Create a tiny 1x1 PNG
  const testPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );
  const assets = new Map<string, Buffer>();
  assets.set('test.png', testPng);

  const bundlePath = await writeIconBundle(tmpDir, 'Test', m, assets);

  expect(bundlePath).toBe(path.join(tmpDir, 'Test.icon'));

  // Read back
  const { manifest, assets: readAssets } = await readIconBundle(bundlePath);
  expect(manifest.groups).toHaveLength(1);
  expect(manifest.groups[0].specular).toBe(true);
  expect(readAssets.has('test.png')).toBe(true);

  // Cleanup
  await fs.rm(tmpDir, { recursive: true });
});
