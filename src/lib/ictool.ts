import * as fs from 'node:fs/promises';

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

const ICTOOL_PATH = '/Applications/Icon Composer.app/Contents/Executables/ictool';

// ClearLight/ClearDark do not support background compositing — Apple's glass shader
// requires the Metal GPU pipeline with a live background, which ictool doesn't expose.
export const CLEAR_RENDITIONS: ReadonlySet<string> = new Set(['ClearLight', 'ClearDark']);

export async function ictoolAvailable(): Promise<boolean> {
  try { await fs.access(ICTOOL_PATH); return true; } catch { return false; }
}

export async function renderWithIctool(options: IctoolOptions): Promise<void> {
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

  const proc = Bun.spawn([ICTOOL_PATH, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();
  if (exitCode !== 0) throw new Error(`ictool exited with code ${exitCode}: ${stderr}`);
}
