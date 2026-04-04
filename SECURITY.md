# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email **ethan@ethanbaker.com** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive a response within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Scope

This policy applies to the `icon-composer-mcp` npm package and its source code. It covers:

- Path traversal or file system access vulnerabilities
- Command injection via ictool or other subprocess calls
- MCP protocol security issues
- Denial of service via malformed `.icon` bundles

## Security Measures

- All user-supplied filenames are sanitized via `path.basename()` + character allowlist
- Asset file sizes are capped at 20 MB by default
- Subprocess execution uses `execFile` (not `exec`) to prevent shell injection
- File extensions are validated against an allowlist for image formats
- Temporary files are cleaned up in `finally` blocks
