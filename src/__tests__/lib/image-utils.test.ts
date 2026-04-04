import { test, expect, describe } from 'bun:test';
import sharp from 'sharp';
import { stripAlpha } from '../../lib/image-utils';

// Create a small RGBA test PNG
async function makeRgbaPng(size: number = 16): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 100, g: 150, b: 200, alpha: 128 } },
  }).png().toBuffer();
}

// Create a small opaque RGB test PNG
async function makeRgbPng(size: number = 16): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: 100, g: 150, b: 200 } },
  }).png().toBuffer();
}

describe('stripAlpha', () => {
  test('removes alpha channel from RGBA PNG', async () => {
    const input = await makeRgbaPng();
    const output = await stripAlpha(input);
    const meta = await sharp(output).metadata();
    expect(meta.channels).toBe(3);
  });

  test('already-opaque PNG stays 3 channels', async () => {
    const input = await makeRgbPng();
    const output = await stripAlpha(input);
    const meta = await sharp(output).metadata();
    expect(meta.channels).toBe(3);
  });

  test('uses custom background color for flattening', async () => {
    // Create a fully transparent pixel
    const input = await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();

    const output = await stripAlpha(input, { r: 255, g: 0, b: 0 });
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });

    // Fully transparent flattened onto red should be red
    expect(info.channels).toBe(3);
    expect(data[0]).toBe(255); // R
    expect(data[1]).toBe(0);   // G
    expect(data[2]).toBe(0);   // B
  });

  test('defaults to white background', async () => {
    const input = await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();

    const output = await stripAlpha(input);
    const { data } = await sharp(output).raw().toBuffer({ resolveWithObject: true });

    expect(data[0]).toBe(255);
    expect(data[1]).toBe(255);
    expect(data[2]).toBe(255);
  });

  test('output is valid PNG', async () => {
    const input = await makeRgbaPng(64);
    const output = await stripAlpha(input);
    const meta = await sharp(output).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(64);
  });
});
