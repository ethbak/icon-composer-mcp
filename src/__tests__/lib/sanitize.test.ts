import { test, expect, describe } from 'bun:test';
import { sanitizeFilename } from '../../lib/sanitize';

describe('sanitizeFilename', () => {
  test('passes through valid names unchanged', () => {
    expect(sanitizeFilename('my-icon')).toBe('my-icon');
    expect(sanitizeFilename('glyph_01.png')).toBe('glyph_01.png');
    expect(sanitizeFilename('Logo-v2')).toBe('Logo-v2');
  });

  test('strips directory components (path traversal)', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('../../../tmp/evil.png')).toBe('evil.png');
    expect(sanitizeFilename('/absolute/path/file.png')).toBe('file.png');
  });

  test('replaces non-whitelisted characters with underscore', () => {
    expect(sanitizeFilename('hello world')).toBe('hello_world');
    expect(sanitizeFilename('icon@2x#1')).toBe('icon_2x_1');
    expect(sanitizeFilename('café')).toBe('caf_');
  });

  test('strips leading dots', () => {
    expect(sanitizeFilename('.hidden')).toBe('hidden');
    expect(sanitizeFilename('..double')).toBe('double');
    expect(sanitizeFilename('...triple')).toBe('triple');
  });

  test('throws on empty result after sanitization', () => {
    expect(() => sanitizeFilename('...')).toThrow('empty name');
    expect(() => sanitizeFilename('../../..')).toThrow('empty name');
    expect(() => sanitizeFilename('')).toThrow('empty name');
  });

  test('handles names with extensions', () => {
    expect(sanitizeFilename('my icon.png')).toBe('my_icon.png');
    expect(sanitizeFilename('../../evil.png')).toBe('evil.png');
  });

  test('handles long names without truncating', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeFilename(long)).toBe(long);
  });
});
