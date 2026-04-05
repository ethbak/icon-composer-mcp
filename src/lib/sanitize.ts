import * as path from 'node:path';

const FILENAME_WHITELIST = /[^a-zA-Z0-9._-]/g;

/**
 * Sanitize a user-supplied filename to prevent path traversal and filesystem issues.
 * 1. Strips directory components via path.basename()
 * 2. Replaces non-whitelisted characters with '_'
 * 3. Rejects empty or reserved names
 */
export function sanitizeFilename(input: string): string {
  let name = path.basename(input);
  name = name.replace(FILENAME_WHITELIST, '_');

  // Strip leading dots to prevent hidden files and reserved names
  name = name.replace(/^\.+/, '');

  if (name === '') {
    throw new Error(`Invalid filename: "${input}" produces an empty name after sanitization`);
  }

  return name;
}
