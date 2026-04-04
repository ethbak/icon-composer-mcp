import * as fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface IctoolOptions {
  bundlePath: string;
  outputPath: string;
  platform?: string;
  rendition?: string;
  width?: number;
  height?: number;
  scale?: number;
  lightAngle?: number;
  tintColor?: number;
  tintStrength?: number;
}

// Search paths in priority order
const ICTOOL_SEARCH_PATHS = [
  process.env.ICTOOL_PATH,
  '/Applications/Icon Composer.app/Contents/Executables/ictool',
  '/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool',
  '/Applications/Xcode-beta.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool',
].filter(Boolean) as string[];

const INSTALL_MESSAGE = `Icon Composer.app is required for Liquid Glass rendering.

Install via Homebrew:
  brew install --cask icon-composer

Or download from:
  https://developer.apple.com/icon-composer/

Bundle creation, editing, and flat previews work without it.`;

// ClearLight/ClearDark do not support background compositing — Apple's glass shader
// requires the Metal GPU pipeline with a live background, which ictool doesn't expose.
export const CLEAR_RENDITIONS: ReadonlySet<string> = new Set(['ClearLight', 'ClearDark']);

let resolvedPath: string | null | undefined; // undefined = not checked yet

/** Reset cached path — for testing only */
export function _resetCache(): void { resolvedPath = undefined; }

async function findIctool(): Promise<string | null> {
  if (resolvedPath !== undefined) return resolvedPath;
  for (const p of ICTOOL_SEARCH_PATHS) {
    try {
      await fs.access(p);
      resolvedPath = p;
      return p;
    } catch {}
  }
  resolvedPath = null;
  return null;
}

export async function ictoolAvailable(): Promise<boolean> {
  return (await findIctool()) !== null;
}

export async function getIctoolVersion(): Promise<{ path: string; version: string; build: string } | null> {
  const ictoolPath = await findIctool();
  if (!ictoolPath) return null;
  try {
    const { stdout } = await execFileAsync(ictoolPath, ['--version']);
    const info = JSON.parse(stdout);
    return {
      path: ictoolPath,
      version: info['short-bundle-version'] ?? 'unknown',
      build: info['bundle-version'] ?? 'unknown',
    };
  } catch {
    return { path: ictoolPath, version: 'unknown', build: 'unknown' };
  }
}

export function getInstallMessage(): string {
  return INSTALL_MESSAGE;
}

export async function renderWithIctool(options: IctoolOptions): Promise<void> {
  const ictoolPath = await findIctool();
  if (!ictoolPath) throw new Error(INSTALL_MESSAGE);

  const args = [
    options.bundlePath,
    '--export-image',
    '--output-file', options.outputPath,
    '--platform', options.platform ?? 'iOS',
    '--rendition', options.rendition ?? 'Default',
    '--width', String(options.width ?? 1024),
    '--height', String(options.height ?? 1024),
    '--scale', String(options.scale ?? 1),
  ];
  if (options.lightAngle !== undefined) args.push('--light-angle', String(options.lightAngle));
  if (options.tintColor !== undefined) args.push('--tint-color', String(options.tintColor));
  if (options.tintStrength !== undefined) args.push('--tint-strength', String(options.tintStrength));

  try {
    await execFileAsync(ictoolPath, args);
  } catch (err: unknown) {
    const e = err as { code?: number; stderr?: string; message?: string };
    throw new Error(`ictool failed: ${e.stderr || e.message || 'unknown error'}`);
  }
}
