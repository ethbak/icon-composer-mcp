import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sharp from 'sharp';
import type { IconManifest, FillValue } from '../types';

// Parse an Apple color string like "srgb:0.50000,0.00000,1.00000,1.00000" to RGBA
function parseColorString(cs: string): { r: number; g: number; b: number; alpha: number } {
  const parts = cs.split(':')[1].split(',').map(Number);
  return {
    r: Math.round(parts[0] * 255),
    g: Math.round(parts[1] * 255),
    b: Math.round(parts[2] * 255),
    alpha: parts[3],
  };
}

// Generate a checkerboard pattern as a PNG buffer
export async function generateCheckerboard(size: number, cellSize: number = 32): Promise<Buffer> {
  const channels = 4;
  const data = Buffer.alloc(size * size * channels);
  const lightGray = { r: 204, g: 204, b: 204 };
  const white = { r: 255, g: 255, b: 255 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * channels;
      const isLight = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
      const color = isLight ? white : lightGray;
      data[idx] = color.r;
      data[idx + 1] = color.g;
      data[idx + 2] = color.b;
      data[idx + 3] = 255;
    }
  }

  return sharp(data, { raw: { width: size, height: size, channels } }).png().toBuffer();
}

// Apple Icon Composer preset background names
export type ApplePresetName =
  | 'sine-purple-orange'
  | 'sine-gasflame'
  | 'sine-magenta'
  | 'sine-green-yellow'
  | 'sine-purple-orange-black'
  | 'sine-gray';

// Map preset names to filenames
const APPLE_PRESET_FILES: Record<ApplePresetName, string> = {
  'sine-purple-orange': '1 - sine-purple-orange.jpeg',
  'sine-gasflame': '2 - sine-gasflame.jpeg',
  'sine-magenta': '3 - sine-magenta.jpeg',
  'sine-green-yellow': '4 - sine-green-yellow.jpeg',
  'sine-purple-orange-black': '5 - sine-purple-orange-black.jpeg',
  'sine-gray': '6 - sine-gray.jpeg',
};

// Resolve path to bundled backgrounds directory
function getBackgroundsDir(): string {
  return path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'backgrounds');
}

// Canvas background presets
export type CanvasBackground =
  | { type: 'none' }
  | { type: 'solid'; color: string } // hex color
  | { type: 'checkerboard'; cellSize?: number }
  | { type: 'image'; path: string }
  | { type: 'preset'; name: 'light' | 'dark' | 'checkerboard' | 'homescreen-light' | 'homescreen-dark' }
  | { type: 'apple-preset'; name: ApplePresetName };

// Resolve a canvas background to a sharp image buffer at the given size
export async function resolveCanvasBackground(bg: CanvasBackground, size: number): Promise<Buffer | null> {
  switch (bg.type) {
    case 'none':
      return null;

    case 'solid': {
      const hex = bg.color.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return sharp({
        create: { width: size, height: size, channels: 4, background: { r, g, b, alpha: 255 } },
      }).png().toBuffer();
    }

    case 'checkerboard':
      return generateCheckerboard(size, bg.cellSize ?? 32);

    case 'image': {
      const imgBuf = await fs.readFile(bg.path);
      return sharp(imgBuf).resize(size, size, { fit: 'cover' }).png().toBuffer();
    }

    case 'apple-preset': {
      const filename = APPLE_PRESET_FILES[bg.name];
      const bgPath = path.join(getBackgroundsDir(), filename);
      const imgBuf = await fs.readFile(bgPath);
      return sharp(imgBuf).resize(size, size, { fit: 'cover' }).png().toBuffer();
    }

    case 'preset': {
      switch (bg.name) {
        case 'light':
          return sharp({
            create: { width: size, height: size, channels: 4, background: { r: 242, g: 242, b: 247, alpha: 255 } },
          }).png().toBuffer();
        case 'dark':
          return sharp({
            create: { width: size, height: size, channels: 4, background: { r: 28, g: 28, b: 30, alpha: 255 } },
          }).png().toBuffer();
        case 'checkerboard':
          return generateCheckerboard(size, 32);
        case 'homescreen-light': {
          // iOS-style light gradient wallpaper
          const channels = 4;
          const data = Buffer.alloc(size * size * channels);
          for (let y = 0; y < size; y++) {
            const t = y / size;
            const r = Math.round(200 + t * 40);
            const g = Math.round(210 + t * 30);
            const b = Math.round(235 + t * 15);
            for (let x = 0; x < size; x++) {
              const idx = (y * size + x) * channels;
              data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
            }
          }
          return sharp(data, { raw: { width: size, height: size, channels } }).png().toBuffer();
        }
        case 'homescreen-dark': {
          // iOS-style dark gradient wallpaper
          const channels = 4;
          const data = Buffer.alloc(size * size * channels);
          for (let y = 0; y < size; y++) {
            const t = y / size;
            const r = Math.round(15 + t * 15);
            const g = Math.round(15 + t * 10);
            const b = Math.round(25 + t * 20);
            for (let x = 0; x < size; x++) {
              const idx = (y * size + x) * channels;
              data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
            }
          }
          return sharp(data, { raw: { width: size, height: size, channels } }).png().toBuffer();
        }
        default:
          return null;
      }
    }
  }
}

// Get the native size of an apple preset background image
async function getApplePresetNativeSize(name: ApplePresetName): Promise<number> {
  const filename = APPLE_PRESET_FILES[name];
  const bgPath = path.join(getBackgroundsDir(), filename);
  const metadata = await sharp(bgPath).metadata();
  return metadata.width ?? 8192;
}

// Composite an icon image on top of a canvas background
// For apple presets, preserves the native ratio between icon and background
export async function compositeOnBackground(
  iconBuffer: Buffer,
  canvasBg: CanvasBackground,
  canvasSize: number,
  iconSize?: number
): Promise<Buffer> {
  // For apple presets, handle separately to avoid decoding the 8192 JPEG twice.
  if (canvasBg.type === 'apple-preset') {
    // The icon stays at its native rendered size (e.g. 1024px)
    // and the canvas grows around it to preserve the correct icon-to-background ratio.
    // Zoom only affects how much background is visible, not icon resolution.
    // The background is 8192x8192 and the icon is ~1024px within that.
    // This native ratio must NEVER change — the icon-to-pattern scale is fixed.
    //
    // Step 1: Composite icon onto bg at native ratio (icon = bg / 8)
    // Step 2: Crop the center to show desired zoom level
    // Step 3: Output is always sized so the icon is at its native pixel size
    //
    // zoom=1.0 (default) → visible icon is ~50% of output
    // zoom=0.5 → zoomed out, visible icon is ~25%
    // zoom<0.25 → full background visible
    const { width: iconW } = await sharp(iconBuffer).metadata();
    const nativeIconSize = iconW ?? 1024;
    const zoom = iconSize ? (iconSize / canvasSize) : 1.0;

    // Match the non-preset behavior: icon is (zoom * 100%) of the output canvas.
    // Crop center of the 8192 bg to show a zoomed-in portion, then resize to canvas.
    const bgPath = path.join(getBackgroundsDir(), APPLE_PRESET_FILES[canvasBg.name]);
    const bgRaw = await fs.readFile(bgPath);
    const bgMeta = await sharp(bgRaw).metadata();
    const bgNative = bgMeta.width ?? 8192;
    // Crop center ~25% of the wallpaper so the pattern looks natural at icon scale
    const cropRegion = Math.round(bgNative * 0.20);
    const cropOffset = Math.round((bgNative - cropRegion) / 2);
    const bgResized = await sharp(bgRaw)
      .extract({ left: cropOffset, top: cropOffset, width: cropRegion, height: cropRegion })
      .resize(canvasSize, canvasSize)
      .ensureAlpha()
      .png()
      .toBuffer();

    const actualIconSize = iconSize ?? canvasSize;
    const iconResized = await sharp(iconBuffer)
      .resize(actualIconSize, actualIconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const offset = Math.round((canvasSize - actualIconSize) / 2);

    return sharp(bgResized)
      .composite([{ input: iconResized, left: offset, top: offset }])
      .png()
      .toBuffer();
  }

  const bgBuffer = await resolveCanvasBackground(canvasBg, canvasSize);
  const actualIconSize = iconSize ?? canvasSize;

  // Resize icon if needed
  let iconResized = iconBuffer;
  if (actualIconSize !== canvasSize) {
    iconResized = await sharp(iconBuffer)
      .resize(actualIconSize, actualIconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  const offset = Math.round((canvasSize - actualIconSize) / 2);

  if (bgBuffer) {
    return sharp(bgBuffer)
      .composite([{ input: iconResized, left: offset, top: offset }])
      .png()
      .toBuffer();
  }

  // No background — just return the icon (possibly resized onto transparent canvas)
  if (actualIconSize !== canvasSize) {
    return sharp({
      create: { width: canvasSize, height: canvasSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: iconResized, left: offset, top: offset }])
      .png()
      .toBuffer();
  }

  return iconBuffer;
}

// Resolve the effective fill for a given appearance, respecting fill-specializations
export function resolveFill(manifest: IconManifest, appearance?: 'dark' | 'tinted'): FillValue | undefined {
  const specs = manifest['fill-specializations'];
  if (specs && specs.length > 0) {
    // Try exact appearance match first
    if (appearance) {
      const match = specs.find((s) => s.appearance === appearance);
      if (match) return match.value;
    }
    // Fall back to default (entry with no appearance key)
    const def = specs.find((s) => !s.appearance);
    if (def) return def.value;
  }
  return manifest.fill;
}

// Generate a flat preview PNG by compositing layers
export async function renderPreview(
  manifest: IconManifest,
  assets: Map<string, Buffer>,
  size: number = 1024,
  appearance?: 'dark' | 'tinted'
): Promise<Buffer> {
  // Start with background
  let bgColor = { r: 255, g: 255, b: 255, alpha: 1 };
  let gradientOverlay: Buffer | null = null;

  const fill = resolveFill(manifest, appearance);

  if (fill === 'none') {
    bgColor = { r: 0, g: 0, b: 0, alpha: 0 };
  } else if (fill === 'automatic') {
    // Sample dominant color from first layer asset
    const firstAsset = manifest.groups[0]?.layers[0]?.['image-name'];
    const buf = firstAsset ? assets.get(firstAsset) : undefined;
    if (buf) {
      const { dominant } = await sharp(buf).stats();
      bgColor = { r: dominant.r, g: dominant.g, b: dominant.b, alpha: 1 };
    }
  } else if (fill && typeof fill === 'object' && 'solid' in fill) {
    bgColor = parseColorString(fill.solid);
  } else if (fill && typeof fill === 'object' && 'linear-gradient' in fill) {
    const c1 = parseColorString(fill['linear-gradient'][0]);
    const c2 = parseColorString(fill['linear-gradient'][1]);
    const { start, stop } = fill.orientation;
    // Generate gradient as SVG, then rasterize
    const angle = Math.atan2(stop.x - start.x, start.y - stop.y) * (180 / Math.PI);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs><linearGradient id="g" x1="${start.x}" y1="${start.y}" x2="${stop.x}" y2="${stop.y}">
        <stop offset="0%" stop-color="rgb(${c1.r},${c1.g},${c1.b})" stop-opacity="${c1.alpha}"/>
        <stop offset="100%" stop-color="rgb(${c2.r},${c2.g},${c2.b})" stop-opacity="${c2.alpha}"/>
      </linearGradient></defs>
      <rect width="${size}" height="${size}" fill="url(#g)"/>
    </svg>`;
    gradientOverlay = await sharp(Buffer.from(svg)).png().toBuffer();
    bgColor = { r: 0, g: 0, b: 0, alpha: 0 };
  }

  let composite = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bgColor,
    },
  }).png();

  const compositeInputs: sharp.OverlayOptions[] = [];

  if (gradientOverlay) {
    compositeInputs.push({ input: gradientOverlay, left: 0, top: 0 });
  }

  // Composite each layer from each group
  for (const group of manifest.groups) {
    const groupOpacity = group.opacity ?? 1.0;

    for (const layer of group.layers) {
      if (layer.hidden) continue;

      const imageName = layer['image-name'];
      const assetBuffer = assets.get(imageName);
      if (!assetBuffer) continue;

      const layerOpacity = (layer.opacity ?? 1.0) * groupOpacity;
      const pos = layer.position;
      const scale = pos?.scale ?? 1.0;
      const [offX, offY] = pos?.['translation-in-points'] ?? [0, 0];

      // Detect actual content bounds by trimming transparent pixels.
      // Scale is relative to visible content, not file dimensions —
      // scale=1.0 means the content's longest dimension fills the icon.
      const origMeta = await sharp(assetBuffer).metadata();
      const origMax = Math.max(origMeta.width ?? 1, origMeta.height ?? 1);
      let contentRatio = 1.0;
      try {
        const trimmed = await sharp(assetBuffer).trim().toBuffer({ resolveWithObject: true });
        const trimMax = Math.max(trimmed.info.width, trimmed.info.height);
        contentRatio = trimMax / origMax;
      } catch {
        // trim() fails on fully transparent or single-color images — use 1.0
      }

      const layerSize = Math.round(size * scale / contentRatio);
      let layerImage = sharp(assetBuffer).resize(layerSize, layerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });

      if (layerOpacity < 1.0) {
        // Apply opacity by compositing with transparency
        const buf = await layerImage.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const pixels = buf.data;
        for (let i = 3; i < pixels.length; i += 4) {
          pixels[i] = Math.round(pixels[i] * layerOpacity);
        }
        layerImage = sharp(pixels, { raw: { width: buf.info.width, height: buf.info.height, channels: 4 } }).png();
      }

      let layerBuf = await layerImage.toBuffer();

      let left = Math.round((size - layerSize) / 2 + offX);
      let top = Math.round((size - layerSize) / 2 + offY);

      // If the layer exceeds the canvas, crop it to fit
      if (left < 0 || top < 0 || layerSize > size) {
        const cropLeft = Math.max(0, -left);
        const cropTop = Math.max(0, -top);
        const cropWidth = Math.min(layerSize - cropLeft, size);
        const cropHeight = Math.min(layerSize - cropTop, size);
        layerBuf = await sharp(layerBuf)
          .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
          .png()
          .toBuffer();
        left = Math.max(0, left);
        top = Math.max(0, top);
      }

      compositeInputs.push({
        input: layerBuf,
        left,
        top,
      });
    }
  }

  if (compositeInputs.length > 0) {
    composite = composite.composite(compositeInputs);
  }

  return composite.toBuffer();
}
