import { test, expect, describe } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import {
  generateCheckerboard,
  resolveCanvasBackground,
  compositeOnBackground,
  renderPreview,
  resolveFill,
} from '../../lib/render';
import { TEST_PNG } from '../helpers/fixtures';
import type { IconManifest } from '../../types';

// Helper to decode PNG pixels
async function getPixels(buf: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buf).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function pixelAt(data: Buffer, x: number, y: number, width: number): [number, number, number, number] {
  const idx = (y * width + x) * 4;
  return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
}

// --- generateCheckerboard ---

describe('generateCheckerboard', () => {
  test('produces a 64x64 PNG', async () => {
    const buf = await generateCheckerboard(64, 16);
    const { width, height } = await sharp(buf).metadata();
    expect(width).toBe(64);
    expect(height).toBe(64);
  });

  test('pixel at (0,0) is white', async () => {
    const buf = await generateCheckerboard(64, 16);
    const { data, width } = await getPixels(buf);
    expect(pixelAt(data, 0, 0, width)).toEqual([255, 255, 255, 255]);
  });

  test('pixel at (16,0) is light gray', async () => {
    const buf = await generateCheckerboard(64, 16);
    const { data, width } = await getPixels(buf);
    expect(pixelAt(data, 16, 0, width)).toEqual([204, 204, 204, 255]);
  });

  test('default cellSize=32: pixel at (32,0) is gray', async () => {
    const buf = await generateCheckerboard(64);
    const { data, width } = await getPixels(buf);
    expect(pixelAt(data, 32, 0, width)).toEqual([204, 204, 204, 255]);
  });
});

// --- resolveCanvasBackground ---

describe('resolveCanvasBackground', () => {
  test('type:none returns null', async () => {
    const result = await resolveCanvasBackground({ type: 'none' }, 64);
    expect(result).toBeNull();
  });

  test('type:solid #FF0000 → top-left pixel is red', async () => {
    const buf = await resolveCanvasBackground({ type: 'solid', color: '#FF0000' }, 4);
    expect(buf).not.toBeNull();
    const { data, width } = await getPixels(buf!);
    expect(pixelAt(data, 0, 0, width)).toEqual([255, 0, 0, 255]);
  });

  test('type:checkerboard cellSize:8 → white then gray at correct intervals', async () => {
    const buf = await resolveCanvasBackground({ type: 'checkerboard', cellSize: 8 }, 16);
    expect(buf).not.toBeNull();
    const { data, width } = await getPixels(buf!);
    // (0,0) should be white (cell 0,0 — even sum)
    expect(pixelAt(data, 0, 0, width)).toEqual([255, 255, 255, 255]);
    // (8,0) should be gray (cell 1,0 — odd sum)
    expect(pixelAt(data, 8, 0, width)).toEqual([204, 204, 204, 255]);
  });

  test('type:preset light → top-left pixel is [242,242,247,255]', async () => {
    const buf = await resolveCanvasBackground({ type: 'preset', name: 'light' }, 4);
    expect(buf).not.toBeNull();
    const { data, width } = await getPixels(buf!);
    expect(pixelAt(data, 0, 0, width)).toEqual([242, 242, 247, 255]);
  });

  test('type:preset dark → top-left pixel is [28,28,30,255]', async () => {
    const buf = await resolveCanvasBackground({ type: 'preset', name: 'dark' }, 4);
    expect(buf).not.toBeNull();
    const { data, width } = await getPixels(buf!);
    expect(pixelAt(data, 0, 0, width)).toEqual([28, 28, 30, 255]);
  });

  test('type:image with nonexistent path rejects', async () => {
    await expect(
      resolveCanvasBackground({ type: 'image', path: '/nonexistent/file.png' }, 64)
    ).rejects.toThrow();
  });

  // Apple preset tests — only run if the background files exist
  const backgroundsDir = path.join(import.meta.dir, '..', '..', '..', 'backgrounds');
  const lightFile = path.join(backgroundsDir, '1 - sine-purple-orange.jpeg');
  const applePresetsExist = fs.existsSync(lightFile);

  if (applePresetsExist) {
    test('type:apple-preset sine-purple-orange returns a buffer', async () => {
      const buf = await resolveCanvasBackground({ type: 'apple-preset', name: 'sine-purple-orange' }, 4);
      expect(buf).not.toBeNull();
      expect(buf!.length).toBeGreaterThan(0);
    });
  }
});

// --- compositeOnBackground ---

describe('compositeOnBackground', () => {
  test('type:none returns a Buffer', async () => {
    const result = await compositeOnBackground(TEST_PNG, { type: 'none' }, 4);
    expect(result).toBeInstanceOf(Buffer);
  });
});

// --- renderPreview ---

describe('renderPreview', () => {
  test('manifest with red solid fill → background pixels are red', async () => {
    const manifest: IconManifest = {
      groups: [],
      'supported-platforms': {},
      fill: { solid: 'srgb:1,0,0,1' },
    };
    const buf = await renderPreview(manifest, new Map(), 4);
    expect(buf).toBeInstanceOf(Buffer);
    const { data, width } = await getPixels(buf);
    const [r, g, b] = pixelAt(data, 0, 0, width);
    // Allow slight variation from compositing
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(50);
    expect(b).toBeLessThan(50);
  });

  test('manifest with dark fill specialization returns different buffer from default', async () => {
    const manifest: IconManifest = {
      groups: [],
      'supported-platforms': {},
      fill: { solid: 'srgb:1,1,1,1' },
      'fill-specializations': [
        { appearance: 'dark', value: { solid: 'srgb:0,0,0,1' } },
      ],
    };
    const assets = new Map<string, Buffer>();
    const defaultBuf = await renderPreview(manifest, assets, 4);
    const darkBuf = await renderPreview(manifest, assets, 4, 'dark');
    // Buffers should differ because fills differ
    expect(defaultBuf.equals(darkBuf)).toBe(false);
  });

  test('empty manifest returns buffer without throwing', async () => {
    const manifest: IconManifest = {
      groups: [],
      'supported-platforms': {},
    };
    const buf = await renderPreview(manifest, new Map(), 4);
    expect(buf).toBeInstanceOf(Buffer);
  });
});

// --- resolveFill ---

describe('resolveFill', () => {
  test('returns manifest.fill when no specializations', () => {
    const manifest: IconManifest = {
      groups: [],
      'supported-platforms': {},
      fill: { solid: 'srgb:1,0,0,1' },
    };
    expect(resolveFill(manifest)).toEqual({ solid: 'srgb:1,0,0,1' });
  });

  test('returns appearance-specific fill when it matches', () => {
    const manifest: IconManifest = {
      groups: [],
      'supported-platforms': {},
      fill: { solid: 'srgb:1,1,1,1' },
      'fill-specializations': [
        { appearance: 'dark', value: { solid: 'srgb:0,0,0,1' } },
      ],
    };
    expect(resolveFill(manifest, 'dark')).toEqual({ solid: 'srgb:0,0,0,1' });
  });

  test('falls back to manifest.fill when no matching specialization', () => {
    const manifest: IconManifest = {
      groups: [],
      'supported-platforms': {},
      fill: { solid: 'srgb:1,1,1,1' },
      'fill-specializations': [
        { appearance: 'dark', value: { solid: 'srgb:0,0,0,1' } },
      ],
    };
    expect(resolveFill(manifest, 'tinted')).toEqual({ solid: 'srgb:1,1,1,1' });
  });
});
