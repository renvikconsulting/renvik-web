# Security & bot defense

What's implemented in this repo, what's a Cloudflare dashboard setting, and — importantly — what's
realistically out of reach for a public marketing site. Read the last section before promising a
stakeholder "the site is scraper-proof."

## Implemented in code

### Security headers / CSP (`public/_headers`)

Cloudflare Pages reads `public/_headers` and applies it to every response. Currently set:

- `Content-Security-Policy` — default-deny (`default-src 'self'`), with narrow allowances for Cloudflare
  Turnstile (`script-src`/`frame-src https://challenges.cloudflare.com`) and Google Fonts
  (`style-src https://fonts.googleapis.com`, `font-src https://fonts.gstatic.com`). No `unsafe-inline` for
  scripts — inline scripts are allow-listed by hash instead, generated automatically at build time (below).
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a locked-down `Permissions-Policy`.

#### Inline-script CSP hashes

Astro inlines small page scripts directly into the HTML as `<script type="module">` (the theme pre-paint
script, `ThemeToggle`, `Navbar`'s mobile-menu toggle, the contact form handler, the contact-detail decoder)
rather than emitting them as external files — so `script-src 'self'` doesn't cover them, and there's no
single stable script to hand-maintain a hash for.

`npm run build` runs `astro build` and then `scripts/generate-csp-hashes.mjs`, which:

1. Walks every `dist/**/*.html` after the build.
2. Hashes (SHA-256, base64) the exact content of every inline (no `src=`) `<script>` tag.
3. Replaces the `%%INLINE_SCRIPT_HASHES%%` placeholder in `dist/_headers` (copied from `public/_headers`)
   with the full `'sha256-...' 'sha256-...' ...` allow-list.

Consequences worth knowing:

- **`public/_headers` intentionally contains the literal placeholder, not real hashes.** Don't replace it
  with a hardcoded hash — the next build's generated output would just be wrong, and a hand-written single
  hash can't cover multiple distinct inline scripts anyway.
- **Always deploy via `npm run build`** (or a CI step that runs the same command). If you run `astro build`
  directly and skip the hash-generation step, `dist/_headers` still has the raw `%%INLINE_SCRIPT_HASHES%%`
  text — Cloudflare will serve a CSP with a syntactically-invalid script-src entry, and browsers will block
  every inline script on the site (nav menu, theme toggle, and the contact form all silently stop working,
  with CSP violations in the console as the only clue).
- Adding a new inline script, or editing an existing one, needs no manual step — the next `npm run build`
  picks it up automatically.

### Contact-form spam defense (`functions/api/contact.ts`, `src/pages/contact.astro`)

1. **Honeypot** — a visually-hidden `website` field (hidden via `clip`/1px sizing, not `display:none`, since
   some bots specifically skip `display:none` fields when filling forms). Any non-empty value is treated as
   spam; the Function returns a fake success so the bot doesn't learn the field is a trap.
2. **Turnstile** — the token from Cloudflare's Turnstile widget is verified server-side against
   `https://challenges.cloudflare.com/turnstile/v0/siteverify` before anything is sent.
3. **Field validation** — length limits and an email-shape check, server-side (never trust client validation).

### AI-crawler blocking backstop (`public/robots.txt`)

`Disallow` rules for known AI-training crawler user agents (GPTBot, CCBot, Google-Extended, ClaudeBot,
Bytespider, PerplexityBot, etc.). This only works for bots that honor `robots.txt` — it's a courtesy signal,
not enforcement. Real enforcement is the Cloudflare dashboard toggle (below).

### Contact-detail obfuscation (`src/pages/contact.astro`)

The phone/email on the Contact page are base64-encoded in the page source and assembled into visible
text + `mailto:`/`tel:` links by a small client-side script, rather than appearing as a raw string. This
stops trivial regex scrapers grepping HTML for `@` or `tel:`; it does nothing against a scraper that
executes JavaScript (see "not achievable" below).

## Required, but only configurable in the Cloudflare dashboard

These need the site owner's own Cloudflare account access — no agent session can create them. Full steps
in `docs/DEPLOYMENT.md`.

- **Turnstile widget** — create the site, get the site key (→ `PUBLIC_TURNSTILE_SITE_KEY` build env var) and
  secret key (→ `TURNSTILE_SECRET_KEY` Pages Function env var).
- **Rate limiting on `/api/contact`** — a Cloudflare rate-limiting rule (e.g. 5 requests/minute per IP).
  Code-level rate limiting inside a stateless Pages Function isn't meaningful without an external store, so
  this is intentionally left to the edge rule.
- **"Block AI Scrapers and Crawlers"** — Cloudflare's own bot-management toggle (Security → Bots). This is
  the real enforcement layer behind the `robots.txt` backstop above; it blocks at the edge regardless of
  whether a bot honors `robots.txt`.
- **WAF custom rules** — general hardening (e.g. challenge traffic with no/garbage `User-Agent`, block known
  bad ASNs) if abuse patterns show up after launch. Not pre-configured here since there's no traffic data
  yet to tune rules against.

## What's realistically NOT achievable — and why we didn't try

"Scraper-proof" was part of the original ask. Worth being direct about this with whoever owns the site:

**A public marketing site cannot be made scrape-proof without also blocking the search engines and social
previews it depends on for traffic.** Any measure strong enough to stop a determined scraper (aggressive JS
challenges, content that only renders after solving a puzzle, blocking headless browsers outright) also
blocks Googlebot, the LinkedIn/Twitter link-preview crawlers, and Lighthouse/PageSpeed-style tooling — which
defeats the point of having a public site at all. What this repo does instead is scope "scraper-proof" down
to the parts that are actually winnable:

- Spam **submissions** through the contact form → solved (Turnstile + honeypot + rate limiting).
- **AI-training** crawlers specifically → solved (the dashboard toggle targets exactly this category without
  touching search/social crawlers).
- Trivial **contact-detail harvesting** by regex → raised the bar (obfuscation), not eliminated.
- Wholesale **content copying** by a scraper willing to run a real browser → out of scope. If this becomes a
  real problem post-launch, the actual lever is legal (DMCA, ToS) or watermarking, not more client-side code.
