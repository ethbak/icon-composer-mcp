import * as fs from 'fs/promises';
import * as path from 'path';
import { TEST_PNG, TEST_SVG } from './fixtures';
import type { IconManifest, FillValue } from '../../types';

// Create a unique temp directory for a test
export async function makeTempDir(prefix: string = 'ic-test-'): Promise<string> {
  const base = path.join('/tmp', prefix + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  await fs.mkdir(base, { recursive: true });
  return base;
}

// Clean up a temp directory
export async function cleanTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

// Write a test PNG to a temp directory, return its path
export async function writeTempPng(dir: string, name: string = 'test.png'): Promise<string> {
  const p = path.join(dir, name);
  await fs.writeFile(p, TEST_PNG);
  return p;
}

// Write a test SVG to a temp directory, return its path
export async function writeTempSvg(dir: string, name: string = 'test.svg'): Promise<string> {
  const p = path.join(dir, name);
  await fs.writeFile(p, TEST_SVG);
  return p;
}

// Read and parse icon.json from a .icon bundle
export async function readManifest(bundlePath: string): Promise<IconManifest> {
  const raw = await fs.readFile(path.join(bundlePath, 'icon.json'), 'utf-8');
  return JSON.parse(raw);
}

// Write a manifest back to a .icon bundle
export async function writeManifest(bundlePath: string, manifest: IconManifest): Promise<void> {
  await fs.writeFile(path.join(bundlePath, 'icon.json'), JSON.stringify(manifest, null, 2));
}

// List asset filenames in a bundle
export async function listAssets(bundlePath: string): Promise<string[]> {
  try {
    return await fs.readdir(path.join(bundlePath, 'Assets'));
  } catch {
    return [];
  }
}

// Check if a specific asset exists in a bundle
export async function assetExists(bundlePath: string, assetName: string): Promise<boolean> {
  try {
    await fs.access(path.join(bundlePath, 'Assets', assetName));
    return true;
  } catch {
    return false;
  }
}

// Create a fixture .icon bundle for mutation tests
export async function createFixtureBundle(
  dir: string,
  name: string,
  options: {
    fill?: string;
    darkFill?: string;
    layerCount?: number;
    groupCount?: number;
    specular?: boolean;
    shadow?: { kind: 'neutral' | 'layer-color' | 'none'; opacity: number };
    blurMaterial?: number | null;
    translucency?: { enabled: boolean; value: number };
    glyphScale?: number;
  } = {}
): Promise<string> {
  const { createManifest, addGroup, addLayer, writeIconBundle } = await import('../../icon-builder');

  const manifest = createManifest({
    fill: options.fill ?? '#0A66C2',
    darkFill: options.darkFill,
  });

  const groupCount = options.groupCount ?? 1;
  const layerCount = options.layerCount ?? 1;
  const assets = new Map<string, Buffer>();

  for (let gi = 0; gi < groupCount; gi++) {
    const group = addGroup(manifest, {
      name: `Group${gi}`,
      specular: options.specular ?? true,
      shadow: options.shadow ?? { kind: 'layer-color', opacity: 0.5 },
      blurMaterial: options.blurMaterial,
      translucency: options.translucency,
    });

    for (let li = 0; li < layerCount; li++) {
      const imageName = `g${gi}_l${li}.png`;
      addLayer(group, {
        imageName,
        name: `layer-${gi}-${li}`,
        scale: options.glyphScale ?? 0.65,
        glass: true,
      });
      assets.set(imageName, TEST_PNG);
    }
  }

  return writeIconBundle(dir, name, manifest, assets);
}

// Extract the MCP response text from a handler result
export function responseText(result: { content: { type: string; text: string }[] }): string {
  return result.content[0]?.text ?? '';
}

// Check if a handler result is an error
export function isErrorResult(result: { isError?: boolean }): boolean {
  return result.isError === true;
}

// Assert group count in a manifest
export function expectGroupCount(manifest: IconManifest, count: number): void {
  if (manifest.groups.length !== count) {
    throw new Error(`Expected ${count} groups, got ${manifest.groups.length}`);
  }
}

// Assert layer count in a specific group
export function expectLayerCount(manifest: IconManifest, groupIndex: number, count: number): void {
  const group = manifest.groups[groupIndex];
  if (!group) throw new Error(`Group ${groupIndex} does not exist`);
  if (group.layers.length !== count) {
    throw new Error(`Expected ${count} layers in group ${groupIndex}, got ${group.layers.length}`);
  }
}
