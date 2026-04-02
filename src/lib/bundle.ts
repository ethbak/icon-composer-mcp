import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IconManifest } from '../types';

/**
 * Read an existing .icon bundle from disk.
 * Returns the parsed manifest and a Map of asset filename → Buffer.
 * If the Assets/ directory does not exist, the Map will be empty.
 */
export async function readIconBundle(bundlePath: string): Promise<{
  manifest: IconManifest;
  assets: Map<string, Buffer>;
}> {
  const manifestPath = path.join(bundlePath, 'icon.json');
  const manifestJson = await fs.readFile(manifestPath, 'utf-8');

  // Let SyntaxError propagate naturally
  const parsed: unknown = JSON.parse(manifestJson);

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('icon.json does not contain a valid IconManifest object');
  }

  const manifest = parsed as IconManifest;
  const assets = new Map<string, Buffer>();
  const assetsPath = path.join(bundlePath, 'Assets');

  try {
    const files = await fs.readdir(assetsPath);
    for (const file of files) {
      const buffer = await fs.readFile(path.join(assetsPath, file));
      assets.set(file, buffer);
    }
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      // Assets dir doesn't exist — valid state, return empty map
    } else {
      throw err;
    }
  }

  return { manifest, assets };
}

/**
 * Write a .icon bundle to disk.
 * Creates <outputDir>/<bundleName>.icon/icon.json and Assets/<files>.
 * Returns the full path to the bundle directory.
 */
export async function writeIconBundle(
  outputDir: string,
  bundleName: string,
  manifest: IconManifest,
  assets: Map<string, Buffer>
): Promise<string> {
  const bundlePath = path.join(outputDir, `${bundleName}.icon`);
  const assetsPath = path.join(bundlePath, 'Assets');

  await fs.mkdir(assetsPath, { recursive: true });

  await fs.writeFile(
    path.join(bundlePath, 'icon.json'),
    JSON.stringify(manifest, null, 2)
  );

  for (const [filename, buffer] of assets) {
    await fs.writeFile(path.join(assetsPath, filename), buffer);
  }

  return bundlePath;
}

/**
 * Persist an updated manifest back into an existing bundle.
 * Does not touch the Assets/ directory.
 * Errors propagate to the caller.
 */
export async function saveManifest(bundlePath: string, manifest: IconManifest): Promise<void> {
  await fs.writeFile(
    path.join(bundlePath, 'icon.json'),
    JSON.stringify(manifest, null, 2)
  );
}
