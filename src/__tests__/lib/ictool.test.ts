import { test, expect, mock, beforeEach } from 'bun:test';

// ── CLEAR_RENDITIONS ──────────────────────────────────────────────────────────

test('CLEAR_RENDITIONS contains ClearLight', async () => {
  const { CLEAR_RENDITIONS } = await import('../../lib/ictool');
  expect(CLEAR_RENDITIONS.has('ClearLight')).toBe(true);
});

test('CLEAR_RENDITIONS contains ClearDark', async () => {
  const { CLEAR_RENDITIONS } = await import('../../lib/ictool');
  expect(CLEAR_RENDITIONS.has('ClearDark')).toBe(true);
});

test('CLEAR_RENDITIONS does not contain Default', async () => {
  const { CLEAR_RENDITIONS } = await import('../../lib/ictool');
  expect(CLEAR_RENDITIONS.has('Default')).toBe(false);
});

// ── ictoolAvailable ───────────────────────────────────────────────────────────

test('ictoolAvailable returns true when fs.access resolves', async () => {
  mock.module('node:fs/promises', () => ({
    access: async () => undefined,
  }));

  // Re-import after mock to pick up the new module
  const mod = await import('../../lib/ictool');
  const result = await mod.ictoolAvailable();
  expect(result).toBe(true);
});

test('ictoolAvailable returns false when fs.access throws', async () => {
  mock.module('node:fs/promises', () => ({
    access: async () => { throw new Error('ENOENT'); },
  }));

  const mod = await import('../../lib/ictool');
  const result = await mod.ictoolAvailable();
  expect(result).toBe(false);
});

// ── renderWithIctool ──────────────────────────────────────────────────────────

const ICTOOL_PATH = '/Applications/Icon Composer.app/Contents/Executables/ictool';

test('renderWithIctool builds correct args for required options only', async () => {
  const originalSpawn = Bun.spawn;
  let capturedArgs: string[] = [];

  (Bun as any).spawn = (args: string[], _opts: any) => {
    capturedArgs = args;
    return {
      exited: Promise.resolve(0),
      stderr: new Response('').body,
      stdout: new Response('').body,
    };
  };

  try {
    const { renderWithIctool } = await import('../../lib/ictool');
    await renderWithIctool({
      bundlePath: '/path/to/icon.icon',
      outputPath: '/tmp/out.png',
    });

    expect(capturedArgs).toEqual([
      ICTOOL_PATH,
      '/path/to/icon.icon',
      '--export-image',
      '--output-file', '/tmp/out.png',
      '--platform', 'iOS',
      '--rendition', 'Default',
      '--width', '1024',
      '--height', '1024',
      '--scale', '1',
    ]);
  } finally {
    (Bun as any).spawn = originalSpawn;
  }
});

test('renderWithIctool throws when exit code is non-zero', async () => {
  const originalSpawn = Bun.spawn;
  const stderrText = 'something went wrong';

  (Bun as any).spawn = (_args: string[], _opts: any) => {
    return {
      exited: Promise.resolve(1),
      stderr: new Response(stderrText).body,
      stdout: new Response('').body,
    };
  };

  try {
    const { renderWithIctool } = await import('../../lib/ictool');
    await expect(
      renderWithIctool({ bundlePath: '/path/to/icon.icon', outputPath: '/tmp/out.png' })
    ).rejects.toThrow(`ictool exited with code 1: ${stderrText}`);
  } finally {
    (Bun as any).spawn = originalSpawn;
  }
});

test('renderWithIctool includes all optional args, and lightAngle: 0 is not filtered out', async () => {
  const originalSpawn = Bun.spawn;
  let capturedArgs: string[] = [];

  (Bun as any).spawn = (args: string[], _opts: any) => {
    capturedArgs = args;
    return {
      exited: Promise.resolve(0),
      stderr: new Response('').body,
      stdout: new Response('').body,
    };
  };

  try {
    const { renderWithIctool } = await import('../../lib/ictool');
    await renderWithIctool({
      bundlePath: '/path/to/icon.icon',
      outputPath: '/tmp/out.png',
      platform: 'macOS',
      rendition: 'Dark',
      width: 512,
      height: 512,
      scale: 2,
      lightAngle: 0,     // falsy but should still be included
      tintColor: 0xFF0000,
      tintStrength: 0.5,
    });

    expect(capturedArgs).toContain('--light-angle');
    expect(capturedArgs).toContain('0');
    expect(capturedArgs).toContain('--tint-color');
    expect(capturedArgs).toContain('--tint-strength');
    expect(capturedArgs).toContain('0.5');

    // Verify lightAngle: 0 IS included (not filtered by falsy check)
    const lightAngleIdx = capturedArgs.indexOf('--light-angle');
    expect(lightAngleIdx).toBeGreaterThan(-1);
    expect(capturedArgs[lightAngleIdx + 1]).toBe('0');
  } finally {
    (Bun as any).spawn = originalSpawn;
  }
});
