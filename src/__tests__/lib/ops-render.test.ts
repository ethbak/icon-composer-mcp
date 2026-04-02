import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sharp from 'sharp';
import {
  resolveCanvasBackgroundParam,
  exportPreview,
  renderLiquidGlass,
} from '../../lib/ops-render';
import { ictoolAvailable } from '../../lib/ictool';
import {
  makeTempDir,
  cleanTempDir,
  createFixtureBundle,
  responseText,
  isErrorResult,
} from '../helpers/test-helpers';

// --- resolveCanvasBackgroundParam ---

describe('resolveCanvasBackgroundParam', () => {
  test('returns image type when canvas_bg_image is provided', () => {
    const result = resolveCanvasBackgroundParam({
      canvas_bg_image: '/path/to/bg.png',
      canvas_bg_color: '#FF0000',
      apple_preset: 'sine-magenta',
      canvas_bg: 'light',
    });
    expect(result).toEqual({ type: 'image', path: '/path/to/bg.png' });
  });

  test('returns solid type when canvas_bg_color is provided (no image)', () => {
    const result = resolveCanvasBackgroundParam({
      canvas_bg_color: '#00FF00',
      apple_preset: 'sine-gray',
      canvas_bg: 'dark',
    });
    expect(result).toEqual({ type: 'solid', color: '#00FF00' });
  });

  test('returns apple-preset type when apple_preset is provided (no image or color)', () => {
    const result = resolveCanvasBackgroundParam({
      apple_preset: 'sine-gasflame',
      canvas_bg: 'checkerboard',
    });
    expect(result).toEqual({ type: 'apple-preset', name: 'sine-gasflame' });
  });

  test('returns preset type when canvas_bg is provided (no higher priority params)', () => {
    const result = resolveCanvasBackgroundParam({ canvas_bg: 'dark' });
    expect(result).toEqual({ type: 'preset', name: 'dark' });
  });

  test('returns none when canvas_bg is "none"', () => {
    const result = resolveCanvasBackgroundParam({ canvas_bg: 'none' });
    expect(result).toEqual({ type: 'none' });
  });

  test('returns none when no params are provided', () => {
    const result = resolveCanvasBackgroundParam({});
    expect(result).toEqual({ type: 'none' });
  });

  test('image takes priority over all other params', () => {
    const result = resolveCanvasBackgroundParam({
      canvas_bg_image: '/img.png',
      canvas_bg_color: '#000',
      apple_preset: 'sine-magenta',
      canvas_bg: 'light',
    });
    expect(result.type).toBe('image');
  });

  test('color takes priority over apple_preset and canvas_bg', () => {
    const result = resolveCanvasBackgroundParam({
      canvas_bg_color: '#123456',
      apple_preset: 'sine-gray',
      canvas_bg: 'dark',
    });
    expect(result.type).toBe('solid');
  });
});

// --- exportPreview (flat=true, no ictool needed) ---

describe('exportPreview (flat)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir('ops-render-flat-');
  });

  afterEach(async () => {
    await cleanTempDir(tmpDir);
  });

  test('renders a flat preview and writes a valid PNG', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'test-icon');
    const outputPath = path.join(tmpDir, 'preview.png');

    const result = await exportPreview({
      bundle_path: bundlePath,
      output_path: outputPath,
      size: 256,
      flat: true,
      zoom: 1.0,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('Exported preview');
    expect(responseText(result)).toContain('flat');
    expect(responseText(result)).toContain('256x256');

    // Verify file exists and is a valid PNG
    const buf = await fs.readFile(outputPath);
    const metadata = await sharp(buf).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
  });

  test('applies canvas_bg_color when provided', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'test-icon-bg');
    const outputPath = path.join(tmpDir, 'preview-bg.png');

    const result = await exportPreview({
      bundle_path: bundlePath,
      output_path: outputPath,
      size: 128,
      flat: true,
      canvas_bg_color: '#FF0000',
      zoom: 1.0,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('#FF0000');

    const buf = await fs.readFile(outputPath);
    const metadata = await sharp(buf).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(128);
  });

  test('applies zoom != 1.0', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'test-icon-zoom');
    const outputPath = path.join(tmpDir, 'preview-zoom.png');

    const result = await exportPreview({
      bundle_path: bundlePath,
      output_path: outputPath,
      size: 256,
      flat: true,
      zoom: 0.5,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('zoom: 0.5x');

    const buf = await fs.readFile(outputPath);
    const metadata = await sharp(buf).metadata();
    expect(metadata.format).toBe('png');
    // Canvas stays at requested size
    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(256);
  });

  test('applies canvas_bg preset', async () => {
    const bundlePath = await createFixtureBundle(tmpDir, 'test-icon-preset');
    const outputPath = path.join(tmpDir, 'preview-preset.png');

    const result = await exportPreview({
      bundle_path: bundlePath,
      output_path: outputPath,
      size: 128,
      flat: true,
      canvas_bg: 'dark',
      zoom: 1.0,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('dark');
  });
});

// --- exportPreview with ictool ---

describe('exportPreview (ictool)', () => {
  let tmpDir: string;
  let hasIctool: boolean;

  beforeEach(async () => {
    hasIctool = await ictoolAvailable();
    tmpDir = await makeTempDir('ops-render-ictool-');
  });

  afterEach(async () => {
    await cleanTempDir(tmpDir);
  });

  test('renders with liquid-glass renderer when ictool available', async () => {
    if (!hasIctool) return; // skip

    const bundlePath = await createFixtureBundle(tmpDir, 'test-icon-lg');
    const outputPath = path.join(tmpDir, 'preview-lg.png');

    const result = await exportPreview({
      bundle_path: bundlePath,
      output_path: outputPath,
      size: 512,
      flat: false,
      zoom: 1.0,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('liquid-glass');

    const buf = await fs.readFile(outputPath);
    const metadata = await sharp(buf).metadata();
    expect(metadata.format).toBe('png');
  });

  test('renders with dark appearance when ictool available', async () => {
    if (!hasIctool) return; // skip

    const bundlePath = await createFixtureBundle(tmpDir, 'test-icon-dark');
    const outputPath = path.join(tmpDir, 'preview-dark.png');

    const result = await exportPreview({
      bundle_path: bundlePath,
      output_path: outputPath,
      size: 512,
      flat: false,
      appearance: 'dark',
      zoom: 1.0,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('liquid-glass');
  });
});

// --- renderLiquidGlass ---

describe('renderLiquidGlass', () => {
  let tmpDir: string;
  let hasIctool: boolean;

  beforeEach(async () => {
    hasIctool = await ictoolAvailable();
    tmpDir = await makeTempDir('ops-render-lg-');
  });

  afterEach(async () => {
    await cleanTempDir(tmpDir);
  });

  test('renders basic liquid glass preview', async () => {
    if (!hasIctool) return; // skip

    const bundlePath = await createFixtureBundle(tmpDir, 'test-lg');
    const outputPath = path.join(tmpDir, 'lg-output.png');

    const result = await renderLiquidGlass({
      bundle_path: bundlePath,
      output_path: outputPath,
      platform: 'iOS',
      rendition: 'Default',
      width: 512,
      height: 512,
      scale: 1,
      zoom: 1.0,
    });

    expect(isErrorResult(result)).toBe(false);
    expect(responseText(result)).toContain('Rendered Liquid Glass preview');
    expect(responseText(result)).toContain('512x512');

    const buf = await fs.readFile(outputPath);
    const metadata = await sharp(buf).metadata();
    expect(metadata.format).toBe('png');
  });

  test('returns error for ClearLight with background', async () => {
    if (!hasIctool) return; // skip

    const bundlePath = await createFixtureBundle(tmpDir, 'test-lg-clear');
    const outputPath = path.join(tmpDir, 'lg-clear.png');

    const result = await renderLiquidGlass({
      bundle_path: bundlePath,
      output_path: outputPath,
      platform: 'iOS',
      rendition: 'ClearLight',
      width: 512,
      height: 512,
      scale: 1,
      canvas_bg_color: '#FF0000',
      zoom: 1.0,
    });

    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('ClearLight/ClearDark');
    expect(responseText(result)).toContain('do not support canvas backgrounds');
  });

  test('returns error when ictool is not available', async () => {
    if (hasIctool) return; // skip — only test when ictool is absent

    const result = await renderLiquidGlass({
      bundle_path: '/nonexistent/bundle.icon',
      output_path: '/tmp/output.png',
      platform: 'iOS',
      rendition: 'Default',
      width: 512,
      height: 512,
      scale: 1,
      zoom: 1.0,
    });

    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('Icon Composer.app not found');
  });
});

// --- Error cases ---

describe('error cases', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir('ops-render-err-');
  });

  afterEach(async () => {
    await cleanTempDir(tmpDir);
  });

  test('exportPreview returns error for invalid bundle path', async () => {
    const outputPath = path.join(tmpDir, 'bad-output.png');

    const result = await exportPreview({
      bundle_path: '/nonexistent/path/bundle.icon',
      output_path: outputPath,
      size: 256,
      flat: true,
      zoom: 1.0,
    });

    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('Error:');
  });

  test('exportPreview returns error for missing bundle manifest', async () => {
    // Create a directory that looks like a bundle but has no icon.json
    const fakeBundlePath = path.join(tmpDir, 'fake.icon');
    await fs.mkdir(fakeBundlePath, { recursive: true });
    const outputPath = path.join(tmpDir, 'bad-output2.png');

    const result = await exportPreview({
      bundle_path: fakeBundlePath,
      output_path: outputPath,
      size: 256,
      flat: true,
      zoom: 1.0,
    });

    expect(isErrorResult(result)).toBe(true);
    expect(responseText(result)).toContain('Error:');
  });
});
