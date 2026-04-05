import { test, expect, beforeEach } from 'bun:test';
import { _resetCache, ictoolAvailable, getIctoolVersion, CLEAR_RENDITIONS } from '../../lib/ictool';

beforeEach(() => { _resetCache(); });

// ── CLEAR_RENDITIONS ──────────────────────────────────────────────────────────

test('CLEAR_RENDITIONS contains ClearLight', () => {
  expect(CLEAR_RENDITIONS.has('ClearLight')).toBe(true);
});

test('CLEAR_RENDITIONS contains ClearDark', () => {
  expect(CLEAR_RENDITIONS.has('ClearDark')).toBe(true);
});

test('CLEAR_RENDITIONS does not contain Default', () => {
  expect(CLEAR_RENDITIONS.has('Default')).toBe(false);
});

// ── ictoolAvailable ───────────────────────────────────────────────────────────

test('ictoolAvailable returns a boolean', async () => {
  const result = await ictoolAvailable();
  expect(typeof result).toBe('boolean');
});

// ── getIctoolVersion ─────────────────────────────────────────────────────────

test('getIctoolVersion returns version info when ictool is available', async () => {
  const available = await ictoolAvailable();
  if (!available) return; // skip on machines without ictool

  const info = await getIctoolVersion();
  expect(info).not.toBeNull();
  expect(info!.path).toContain('ictool');
  expect(info!.version).toMatch(/^\d+\.\d+$/);
  expect(info!.build).toMatch(/^\d+$/);
});

// ── renderWithIctool ──────────────────────────────────────────────────────────

test('renderWithIctool builds correct args and renders', async () => {
  const available = await ictoolAvailable();
  if (!available) return; // skip

  const { renderWithIctool } = await import('../../lib/ictool');
  const { makeTempDir, cleanTempDir } = await import('../helpers/test-helpers');
  const { createFixtureBundle } = await import('../helpers/test-helpers');
  const fs = await import('node:fs/promises');
  const sharp = (await import('sharp')).default;

  const tmpDir = await makeTempDir('ictool-render-');
  try {
    const bundlePath = await createFixtureBundle(tmpDir, 'RenderTest');
    const outputPath = `${tmpDir}/output.png`;

    await renderWithIctool({
      bundlePath,
      outputPath,
    });

    const stat = await fs.stat(outputPath);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(0);

    const meta = await sharp(outputPath).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
  } finally {
    await cleanTempDir(tmpDir);
  }
});

test('renderWithIctool respects optional params', async () => {
  const available = await ictoolAvailable();
  if (!available) return; // skip

  const { renderWithIctool } = await import('../../lib/ictool');
  const { makeTempDir, cleanTempDir } = await import('../helpers/test-helpers');
  const { createFixtureBundle } = await import('../helpers/test-helpers');
  const sharp = (await import('sharp')).default;

  const tmpDir = await makeTempDir('ictool-opts-');
  try {
    const bundlePath = await createFixtureBundle(tmpDir, 'OptsTest');
    const outputPath = `${tmpDir}/output.png`;

    await renderWithIctool({
      bundlePath,
      outputPath,
      platform: 'iOS',
      rendition: 'Default',
      width: 512,
      height: 512,
      scale: 2,
      lightAngle: 0,
    });

    const meta = await sharp(outputPath).metadata();
    // ictool --width 512 --scale 2 outputs 1024px (width * scale)
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
  } finally {
    await cleanTempDir(tmpDir);
  }
});

test('renderWithIctool throws on invalid bundle', async () => {
  const available = await ictoolAvailable();
  if (!available) return; // skip

  const { renderWithIctool } = await import('../../lib/ictool');

  await expect(
    renderWithIctool({ bundlePath: '/nonexistent/bundle.icon', outputPath: '/tmp/out.png' })
  ).rejects.toThrow();
});
