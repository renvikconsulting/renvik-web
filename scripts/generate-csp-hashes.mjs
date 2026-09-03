#!/usr/bin/env node
// Post-build step: Astro inlines small page scripts (theme pre-paint script,
// ThemeToggle, Navbar's mobile-menu toggle, the contact form handler, ...)
// directly into the HTML as <script type="module"> rather than emitting
// external files - see CLAUDE.md#theming-light-dark and docs/SECURITY.md.
// A strict CSP can't allow-list those with 'self', so this script walks the
// finished dist/**/*.html, hashes every inline (non-src) <script>, and
// patches the %%INLINE_SCRIPT_HASHES%% placeholder in dist/_headers with
// the resulting sha256 allowlist. Runs automatically as part of `npm run
// build` - see package.json.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const HEADERS_PATH = join(DIST, '_headers');
const PLACEHOLDER = '%%INLINE_SCRIPT_HASHES%%';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

const inlineScriptRe = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
const hashes = new Set();

for (const file of walk(DIST)) {
  const html = readFileSync(file, 'utf8');
  let match;
  while ((match = inlineScriptRe.exec(html))) {
    const [, attrs, body] = match;
    if (/type\s*=\s*["']application\/(ld\+json|json)["']/.test(attrs)) continue; // data, not executable
    if (!body.trim()) continue;
    hashes.add('sha256-' + createHash('sha256').update(body, 'utf8').digest('base64'));
  }
}

if (hashes.size === 0) {
  console.warn('[generate-csp-hashes] No inline scripts found - is this expected?');
}

const headers = readFileSync(HEADERS_PATH, 'utf8');
if (!headers.includes(PLACEHOLDER)) {
  console.error(`[generate-csp-hashes] ${PLACEHOLDER} not found in dist/_headers - aborting so CSP isn't silently wrong.`);
  process.exit(1);
}

const allowlist = [...hashes].sort().map((h) => `'${h}'`).join(' ');
writeFileSync(HEADERS_PATH, headers.replace(PLACEHOLDER, allowlist));
console.log(`[generate-csp-hashes] Patched dist/_headers with ${hashes.size} inline script hash(es).`);
