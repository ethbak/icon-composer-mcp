// Minimal valid 1x1 PNG (white pixel)
export const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);

// Minimal valid SVG (white 100x100 square)
export const TEST_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/></svg>'
);

// A 2x2 red PNG for testing color differentiation
export const TEST_RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQDwQMMAIAELgD/cF7MfYAAAAASUVORK5CYII=',
  'base64'
);
