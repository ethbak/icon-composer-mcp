import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// Use StdioClientTransport — spawn the server as a subprocess.
// This avoids the singleton/double-connect issue and tests the real transport.

const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

const TEST_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/></svg>',
);

let client: Client;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'mcp-int-'));

  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.resolve('dist/server.js')],
  });
  client = new Client({ name: 'test', version: '1.0' });
  await client.connect(transport);
}, 15000);

afterAll(async () => {
  await client.close();
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

async function writePng(name: string): Promise<string> {
  const p = path.join(tmpDir, name);
  await writeFile(p, TEST_PNG);
  return p;
}

async function writeSvg(name: string): Promise<string> {
  const p = path.join(tmpDir, name);
  await writeFile(p, TEST_SVG);
  return p;
}

function text(result: any): string {
  return result.content[0].text;
}

// ── Discovery ──

describe('discovery', () => {
  test('lists all 12 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBe(12);
  });

  test('lists all 3 prompts', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.length).toBe(3);
  });

  test('server info', () => {
    const info = client.getServerVersion();
    expect(info?.name).toBe('icon-composer');
  });
});

// ── create_icon ──

describe('create_icon', () => {
  test('creates bundle from PNG', async () => {
    const png = await writePng('glyph.png');
    const result = await client.callTool({ name: 'create_icon', arguments: {
      foreground_path: png, output_dir: tmpDir, bundle_name: 'McpTest', bg_color: '#0A66C2',
    } });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('Created .icon bundle');
  });

  test('error on missing file', async () => {
    const result = await client.callTool({ name: 'create_icon', arguments: {
      foreground_path: '/nonexistent.png', output_dir: tmpDir, bundle_name: 'Bad', bg_color: '#000',
    } });
    expect(result.isError).toBe(true);
  });
});

// ── read_icon ──

test('read_icon returns manifest and assets', async () => {
  const result = await client.callTool({ name: 'read_icon', arguments: {
    bundle_path: path.join(tmpDir, 'McpTest.icon'),
  } });
  expect(result.isError).toBeFalsy();
  expect(text(result)).toContain('Manifest:');
});

// ── add_layer_to_icon ──

test('add_layer_to_icon adds layer', async () => {
  const png = await writePng('overlay.png');
  const result = await client.callTool({ name: 'add_layer_to_icon', arguments: {
    bundle_path: path.join(tmpDir, 'McpTest.icon'),
    image_path: png, layer_name: 'overlay', group_index: 0,
  } });
  expect(result.isError).toBeFalsy();
  expect(text(result)).toContain('Added layer');
});

// ── set_fill ──

test('set_fill solid', async () => {
  const r = await client.callTool({ name: 'set_fill', arguments: {
    bundle_path: path.join(tmpDir, 'McpTest.icon'), fill_type: 'solid', color: '#FF6B35',
  } });
  expect(r.isError).toBeFalsy();
});

// ── set_glass_effects ──

test('set_glass_effects', async () => {
  const r = await client.callTool({ name: 'set_glass_effects', arguments: {
    bundle_path: path.join(tmpDir, 'McpTest.icon'), group_index: 0,
    specular: true, shadow_kind: 'layer-color', shadow_opacity: 0.5,
  } });
  expect(r.isError).toBeFalsy();
});

// ── set_appearances ──

test('set_appearances dark mode', async () => {
  const r = await client.callTool({ name: 'set_appearances', arguments: {
    bundle_path: path.join(tmpDir, 'McpTest.icon'), target: 'fill', appearance: 'dark', bg_color: '#1A1A2E',
  } });
  expect(r.isError).toBeFalsy();
});

// ── set_layer_position ──

test('set_layer_position', async () => {
  const r = await client.callTool({ name: 'set_layer_position', arguments: {
    bundle_path: path.join(tmpDir, 'McpTest.icon'), target: 'layer',
    group_index: 0, layer_index: 0, scale: 0.8,
  } });
  expect(r.isError).toBeFalsy();
});

// ── toggle_fx ──

test('toggle_fx disable then enable', async () => {
  const r1 = await client.callTool({ name: 'toggle_fx', arguments: {
    bundle_path: path.join(tmpDir, 'McpTest.icon'), enabled: false,
  } });
  expect(r1.isError).toBeFalsy();
  expect(text(r1).toLowerCase()).toContain('disabled');

  const r2 = await client.callTool({ name: 'toggle_fx', arguments: {
    bundle_path: path.join(tmpDir, 'McpTest.icon'), enabled: true,
  } });
  expect(text(r2).toLowerCase()).toContain('enabled');
});

// ── export_preview ──

test('export_preview flat', async () => {
  const out = path.join(tmpDir, 'preview.png');
  const r = await client.callTool({ name: 'export_preview', arguments: {
    bundle_path: path.join(tmpDir, 'McpTest.icon'), output_path: out, size: 256, flat: true,
  } });
  expect(r.isError).toBeFalsy();
  const stat = await fs.stat(out);
  expect(stat.size).toBeGreaterThan(0);
});

// ── export_marketing ──

test('export_marketing', async () => {
  const out = path.join(tmpDir, 'marketing.png');
  const r = await client.callTool({ name: 'export_marketing', arguments: {
    bundle_path: path.join(tmpDir, 'McpTest.icon'), output_path: out,
  } });
  expect(r.isError).toBeFalsy();
  expect(text(r)).toContain('no alpha');
});

// ── remove_layer ──

test('remove_layer', async () => {
  const r = await client.callTool({ name: 'remove_layer', arguments: {
    bundle_path: path.join(tmpDir, 'McpTest.icon'), target: 'layer',
    group_index: 0, layer_index: 1, cleanup_assets: true,
  } });
  expect(r.isError).toBeFalsy();
  expect(text(r)).toContain('Removed layer');
});

// ── render_liquid_glass ──

test('render_liquid_glass renders or reports missing', async () => {
  const out = path.join(tmpDir, 'glass.png');
  const r = await client.callTool({ name: 'render_liquid_glass', arguments: {
    bundle_path: path.join(tmpDir, 'McpTest.icon'), output_path: out,
    platform: 'iOS', rendition: 'Default', width: 256, height: 256, scale: 1,
  } });
  const t = text(r);
  expect(t.includes('Rendered Liquid Glass') || t.includes('Icon Composer.app')).toBe(true);
});
