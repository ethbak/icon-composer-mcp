import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    server: 'src/server.ts',
  },
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  splitting: true,
  sourcemap: false,
  external: ['sharp', /visual-test/],
});
