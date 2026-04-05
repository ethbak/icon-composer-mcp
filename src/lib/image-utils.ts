import sharp from 'sharp';

/**
 * Remove alpha channel from a PNG buffer by flattening onto a background color.
 * Returns a 3-channel (RGB) PNG with no transparency.
 */
export async function stripAlpha(
  buffer: Buffer,
  backgroundColor: { r: number; g: number; b: number } = { r: 255, g: 255, b: 255 },
): Promise<Buffer> {
  return sharp(buffer)
    .flatten({ background: backgroundColor })
    .png()
    .toBuffer();
}
