
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Project Context

- **Project**: icon-composer-mcp — CLI and MCP server for Apple .icon bundle creation (Liquid Glass, iOS 26+)
- **Stack**: Bun + TypeScript + sharp + Commander.js + MCP SDK
- **Architecture**: CLI-first — `src/lib/` (pure library) → `src/lib/ops-*.ts` (operations) → `src/cli.ts` (Commander.js, 12 subcommands) → `src/server.ts` (thin MCP wrapper, 216 lines)
- **Test harness**: `src/visual-test.ts` — 79 visual test cases with HTML gallery at `tools/visual-test.html`
- **Competitive position**: zero direct competitors for programmatic .icon bundle creation

## Lessons Learned

<!-- Updated by dream-cycle agent. Do not edit manually. -->

- [2026-04-01] ictool squircle crop: use SAFE_RATIO=0.46 to crop iOS rounded shape for content-only preview. Skip crop when canvas background is used (keep full icon shape). Scale correction is 1.54x, applied ONLY in canvas/preset renders (renderWithIctoolScaled) — never in manifest or crop path.
- [2026-04-01] Flat renderer auto-trims transparent padding so scale=1.0 fills canvas based on visible content. Test glyphs should fill their full SVG dimensions (r=256 in 512x512) with no transparent padding to get predictable scale behavior.
- [2026-04-01] Apple preset backgrounds: center-crop 20% of 8192px JPEG for natural zoom level. Composite icon at same size as regular canvas backgrounds.
- [2026-04-03] Apple compatibility VALIDATED (COMPLETE): Icon Composer v1.2 (Homebrew stable) successfully renders our .icon bundles via --export-image. End-to-end workflow confirmed: bundle creation -> ictool render -> PNG export. docs/apple-compatibility.md documents the validation. All P0 blockers resolved.
- [2026-04-01] P0 security issues (FIXED): (1) path traversal via layer_name — sanitize.ts with path.basename() + character whitelist; (2) asset size bomb — bundle.ts with 20MB limit via fs.stat().size check; (3) temp file leak — finally blocks in ops-render.ts.
- [2026-04-01] TODO.md is the canonical backlog — prioritized P0/P1/P2/P3. Biggest schema gap: layer glass-specializations, opacity-specializations, and blend-mode-specializations are used in virtually every real production icon but are not yet exposed via CLI or MCP tools. Next major feature work should start here, after P0 security and compatibility blockers are resolved.
- [2026-04-03] Icon Composer version compatibility: v1.2 (Homebrew stable, build 76, January 2026) uses identical --export-image CLI syntax as v1.4 (internal beta). Homebrew is the primary install path for users — always validate against v1.2, not the locally-installed beta. Only v1.2 DMG is publicly accessible from Apple CDN; v1.0 and v1.4 return 403.
- [2026-04-03] ictool auto-discovery: check ICTOOL_PATH env var first, then /Applications/Icon Composer.app/Contents/Executables/ictool (standalone), then Xcode-bundled and Xcode-beta paths. Cache the resolved path in a module-level variable to avoid repeated fs.access calls. Export getInstallMessage() and getIctoolVersion() for diagnostics.
- [2026-04-03] ictool scale behavior: ictool outputs (width * scale) pixels — --width 512 --scale 2 produces a 1024x1024 PNG. Integration tests must account for this multiplication. Mocking Bun.spawn will hide this behavior; real integration tests with skip-if-missing guards are required.
- [2026-04-03] npm package preparation: bin needs two entries (CLI + MCP server), .npmignore must exclude CLAUDE.md, TODO.md, .claude/, src/__tests__/, gallery/, scripts/, docs/. Keep INSTALL_MESSAGE in ictool.ts pointing to brew install --cask icon-composer as primary install method.
- [2026-04-04] MCP SDK 1.29 callTool signature: use client.callTool({ name, arguments }) not client.callTool(name, args). The convenience overload was removed — the old form silently hangs instead of throwing.
- [2026-04-04] Default glyph scale changed from 0.65 to 1.0. Apple's ictool renders scale=1.0 at ~65% of icon area (the standard size). Flat renderer uses APPLE_NATIVE_SCALE=0.39 to match. ICTOOL_SCALE_FACTOR removed — ictool now renders at native manifest scale.
