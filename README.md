<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/banner-light.png">
    <img alt="icon-composer-mcp" src="assets/banner-light.png" width="700">
  </picture>
</p>

<h1 align="center">icon-composer-mcp</h1>

<p align="center">
  CLI and MCP server for creating Apple .icon bundles with Liquid Glass effects (iOS 26+)
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/icon-composer-mcp"><img src="https://img.shields.io/npm/v/icon-composer-mcp" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/icon-composer-mcp" alt="license"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/MCP-compatible-green" alt="MCP compatible">
</p>

---

## Demo

<!-- TODO: Add screenshot grid or GIF showing the tool in action -->
<!-- Suggested: 3-4 rendered icons showing different styles (flat, glass, dark mode, marketing export) -->

<p align="center">
  <img src="assets/demo.png" alt="demo" width="600">
</p>

## Key Features

- **Create `.icon` bundles** programmatically from PNG or SVG glyphs
- **Full Liquid Glass** support: specular highlights, blur material, shadows, translucency
- **Dark mode + appearance variants** with per-appearance fill specializations
- **AI-agent ready**: 12 MCP tools + 3 workflow prompts with built-in instructions
- **Cross-platform**: flat rendering everywhere, Liquid Glass on macOS with Icon Composer

## How It Works

<!-- TODO: Add a diagram or before/after showing the workflow -->

<p align="center">
  <img src="assets/how-it-works.png" alt="how it works" width="600">
</p>

1. **Provide a glyph** — any PNG or SVG logo/image
2. **Create a `.icon` bundle** — sets background fill, layer scale, and glass effects
3. **Apple's ictool renders Liquid Glass** — specular highlights, shadows, depth, and translucency
4. **Export** — preview PNGs, App Store marketing icon, or the `.icon` bundle for Xcode

## Quick Start

```bash
# Install
npm install -g icon-composer-mcp

# Create an icon
icon-composer create logo.svg ./out --bg-color "#0A66C2"

# Preview it
icon-composer preview ./out/AppIcon.icon preview.png

# Export for App Store
icon-composer export-marketing ./out/AppIcon.icon marketing.png
```

## Installation

<details open>
<summary>&nbsp;&nbsp;<img src="https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-svg/icons/claudecode-color.svg" width="16" height="16">&nbsp;<b>Claude Code</b></summary>

&nbsp;

```bash
claude mcp add icon-composer -- npx -y icon-composer-mcp
```

</details>

<details>
<summary>&nbsp;&nbsp;<img src="https://cdn.simpleicons.org/claude/D97757" width="16" height="16">&nbsp;<b>Claude Desktop</b></summary>

&nbsp;

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "icon-composer": {
      "command": "npx",
      "args": ["-y", "icon-composer-mcp"]
    }
  }
}
```

</details>

<details>
<summary>&nbsp;&nbsp;<picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.simpleicons.org/cursor/FFFFFF"><source media="(prefers-color-scheme: light)" srcset="https://cdn.simpleicons.org/cursor/000000"><img src="https://cdn.simpleicons.org/cursor/000000" width="16" height="16"></picture>&nbsp;<b>Cursor</b></summary>

&nbsp;

Add to `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "icon-composer": {
      "command": "npx",
      "args": ["-y", "icon-composer-mcp"]
    }
  }
}
```

The server will appear in **Cursor Settings > MCP Servers**. No restart required.

</details>

<details>
<summary>&nbsp;&nbsp;<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vscode/vscode-original.svg" width="16" height="16">&nbsp;<b>VS Code</b></summary>

&nbsp;

Add to `.vscode/mcp.json` in your project root (or open **Command Palette > MCP: Open User Configuration** for global):

> **Note:** VS Code uses `"servers"` (not `"mcpServers"`) and requires a `"type"` field.

```json
{
  "servers": {
    "icon-composer": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "icon-composer-mcp"]
    }
  }
}
```

You'll see Start/Stop/Restart buttons inline in the editor. First launch will prompt a trust confirmation.

</details>

<details>
<summary>&nbsp;&nbsp;<picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.simpleicons.org/windsurf/FFFFFF"><source media="(prefers-color-scheme: light)" srcset="https://cdn.simpleicons.org/windsurf/0B100F"><img src="https://cdn.simpleicons.org/windsurf/0B100F" width="16" height="16"></picture>&nbsp;<b>Windsurf</b></summary>

&nbsp;

First, enable MCP in **Windsurf Settings > Cascade > Model Context Protocol (MCP)**.

Then add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "icon-composer": {
      "command": "npx",
      "args": ["-y", "icon-composer-mcp"]
    }
  }
}
```

Press the **refresh button** in Windsurf settings to load the server.

</details>

<details>
<summary>&nbsp;&nbsp;<b>Other MCP clients</b></summary>

&nbsp;

The server uses stdio transport. Most MCP clients use this config format:

```json
{
  "mcpServers": {
    "icon-composer": {
      "command": "npx",
      "args": ["-y", "icon-composer-mcp"]
    }
  }
}
```

Or run the server directly:

```bash
npx -y icon-composer-mcp
```

</details>

<details>
<summary>&nbsp;&nbsp;<b>CLI only (no MCP)</b></summary>

&nbsp;

```bash
npm install -g icon-composer-mcp
icon-composer --help
```

</details>

## Requirements

- **Node.js 18+**
- **macOS** with [Icon Composer](https://developer.apple.com/icon-composer/) for Liquid Glass rendering (optional)
  ```bash
  brew install --cask icon-composer
  ```
- Flat previews, bundle creation/editing, and marketing export work on **any platform** without Icon Composer

Run `icon-composer doctor` to check your setup.

## CLI Commands

| Command | Description |
|---------|-------------|
| `create` | Create a new `.icon` bundle from a foreground image |
| `add-layer` | Add a layer to an existing bundle |
| `remove` | Remove a layer or group |
| `inspect` | Read and display bundle contents |
| `glass` | Configure Liquid Glass effects on a group |
| `appearance` | Set dark/tinted mode overrides |
| `fill` | Set background fill (solid, gradient, automatic, none) |
| `position` | Set layer/group scale and offset |
| `fx` | Toggle all glass effects on/off |
| `preview` | Export a preview PNG (Liquid Glass or flat) |
| `render` | Render pixel-perfect Liquid Glass via ictool |
| `export-marketing` | Export flat 1024x1024 PNG for App Store Connect (no alpha) |
| `doctor` | Check system setup and dependencies |

## MCP Tools

| Tool | Description |
|------|-------------|
| `create_icon` | Create a `.icon` bundle from a foreground image and background color |
| `add_layer_to_icon` | Add a new layer to an existing bundle |
| `remove_layer` | Remove a layer or group, optionally clean up assets |
| `read_icon` | Inspect bundle manifest and assets |
| `set_glass_effects` | Configure specular, blur, shadow, translucency |
| `set_appearances` | Set dark/tinted mode overrides |
| `set_fill` | Set background fill |
| `set_layer_position` | Adjust layer scale and offset |
| `toggle_fx` | Enable/disable all glass effects at once |
| `export_preview` | Render a preview PNG |
| `render_liquid_glass` | Render via Apple's ictool (requires Icon Composer) |
| `export_marketing` | Export flat opaque PNG for App Store Connect |

### MCP Prompts

| Prompt | Description |
|--------|-------------|
| `create-app-icon` | Guided workflow: create icon from a logo image |
| `add-dark-mode` | Add dark mode appearance to an existing icon |
| `export-for-app-store` | Export all required assets for App Store submission |

## Example Workflows

### Create a branded icon

```bash
# Create with brand color
icon-composer create logo.svg ./out --bg-color "#0A66C2"

# Add dark mode
icon-composer appearance ./out/AppIcon.icon --target fill --appearance dark --bg-color "#0D1B2A"

# Configure glass effects
icon-composer glass ./out/AppIcon.icon --specular --shadow-kind layer-color --blur-material 0.3

# Preview
icon-composer preview ./out/AppIcon.icon preview.png
```

<!-- TODO: Add screenshot of the output icon here -->

### Export for App Store

```bash
# Marketing icon (flat, no alpha, 1024x1024)
icon-composer export-marketing ./out/AppIcon.icon marketing.png

# The .icon bundle goes into your Xcode project's asset catalog
```

### Multi-layer icon with glass

```bash
# Create base icon
icon-composer create background.svg ./out --bg-color "#1C1C2E"

# Add foreground layers
icon-composer add-layer ./out/AppIcon.icon glyph.svg --name glyph --opacity 0.8
icon-composer add-layer ./out/AppIcon.icon badge.svg --name badge --create-group

# Configure glass per group
icon-composer glass ./out/AppIcon.icon --group-index 0 --specular --blur-material 0.3
icon-composer glass ./out/AppIcon.icon --group-index 1 --specular --shadow-kind neutral

# Render Liquid Glass
icon-composer render ./out/AppIcon.icon glass-preview.png
```

<!-- TODO: Add screenshot showing multi-layer result -->

## Limitations

- **Liquid Glass rendering requires macOS** with Apple's Icon Composer.app installed — flat rendering works everywhere
- **ClearLight/ClearDark renditions** render against gray — Apple's glass transparency requires Metal GPU, not available via CLI
- **blur-material effect** only visible against textured/gradient backgrounds, not solid colors
- **visionOS and tvOS** use separate icon formats, not `.icon` bundles
- **No per-locale icons** — the `.icon` format has no localization mechanism

## Architecture

```
src/lib/          Pure library (bundle, manifest, render, ictool)
src/lib/ops-*.ts  Operations layer (MCP result format)
src/cli.ts        CLI (Commander.js, 14 commands)
src/server.ts     MCP server (thin wrapper, 12 tools + 3 prompts)
```

## Contributing

```bash
# Install dependencies
bun install

# Run tests
bun test              # 175 unit tests
npm run test:mcp      # 16 MCP integration tests

# Build
bun run build

# Visual test gallery
bun src/cli.ts visual-test --out ./gallery
```

## License

[MIT](LICENSE)
