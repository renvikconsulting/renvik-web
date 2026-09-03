# Renvik Consulting website

AI-first marketing site for Renvik Consulting (AI strategy/implementation, IT consulting, technical staffing).
Rebuilt 2026-09 from a legacy Create React App SPA into a static Astro site, self-hosted on Cloudflare Pages.
Full rebuild plan/history: see git log (started on `new-design-26`, PR #1; the visual redesign below landed on
`genai-redesign-v2`).

## Stack

- **Astro 7**, static output (`output: 'static'` in `astro.config.mjs`). No React/Vue/etc. — plain `.astro`
  components with vanilla `<script>` for interactivity (nav toggle, theme toggle, contact form). There was no
  reason to pull in a UI framework for a 4-page marketing site; don't add one without a real need. Pinned to
  7.x (not 5.x) because several high-severity XSS/SSRF CVEs are only patched there — check `npm audit` before
  ever downgrading.
- **Tailwind CSS v4** via `@tailwindcss/vite` (no separate `@astrojs/tailwind` integration, no `tailwind.config.js`
  — v4 is CSS-config-first, see `src/styles/global.css`).
- **Design language (v2 — "Bold AI-native")**: dark-first, gradient-mesh glow blobs, glassmorphism cards, a
  violet→fuchsia→cyan brand gradient, mono accents (JetBrains Mono) for eyebrow badges/numbering, Space
  Grotesk for headings. Chosen over two other directions considered and rejected: a light "premium
  editorial/minimal" look, and a "warm human-forward" look — both read as generic-consultancy rather than
  AI-native; see conversation history for the tradeoffs if the direction is revisited. The reusable primitives
  live in `src/styles/global.css` (`.glass`, `.gradient-ring`, `.text-gradient`, `.blob`/`.blob-alt`,
  `.bg-grid`, `.glow-hover`) — reach for those instead of writing new ad-hoc gradient/blur CSS per component.
  The v1 design (AstroWind-inspired, light-first, plain cards) is still in `new-design-26`'s history if you
  need to compare.
- **Cloudflare Pages** hosting the static build; **one** Cloudflare Pages Function
  (`functions/api/contact.ts`) for the contact form, the site's only dynamic endpoint.
- **Resend** for outbound email from the contact form, **Cloudflare Turnstile** for bot verification.

Run locally: `npm install && npm run dev`. Build: `npm run build` (runs `astro check` first — this is a type
check across `.astro` files and `functions/*.ts`, treat failures as real). Preview a production build:
`npm run preview`.

## Directory layout

- `src/layouts/BaseLayout.astro` — the only layout; every page uses it. Contains the pre-paint theme script
  (see Theming below) and mounts `Navbar`/`Footer` once, so don't add per-page `<Navbar>`/`<Footer>` imports.
- `src/components/` — small reusable pieces (`Button`, `Container`, `SectionHeading`, `ServiceCard`,
  `Navbar`, `Footer`, `ThemeToggle`). Keep new shared UI here rather than inlining it in a page.
- `src/pages/` — one file per route: `index.astro`, `about.astro`, `services.astro`, `contact.astro`.
- `src/styles/global.css` — Tailwind import + the light/dark CSS custom-property tokens. This is the single
  source of truth for color tokens (`--color-bg`, `--color-text`, `--color-brand`, etc.) — don't hardcode hex
  colors in components, use the token-backed utilities (`bg-bg`, `text-text`, `text-text-muted`, `bg-brand`,
  `border-border`, `text-accent`, ...).
- `functions/api/contact.ts` — Cloudflare Pages Function handling `POST /api/contact`. Runs on Cloudflare's
  Workers runtime, not Node — no Node-only APIs.
- `public/` — static assets served as-is: product photos (`*.jpg`, reused across Home/Services), `_headers`
  (security headers/CSP), `robots.txt`, `manifest.json`, favicon.
- `docs/DEPLOYMENT.md` — manual Cloudflare/Resend setup steps (account-gated actions no agent can perform).
- `docs/SECURITY.md` — what's implemented in code vs. what must be enabled in the Cloudflare dashboard, and
  the realistic scope of "bot/scraper protection" for a public marketing site.

## Theming (light/dark)

- Default is **system preference** (`prefers-color-scheme`) — no `data-theme` attribute set.
- `ThemeToggle.astro` lets a visitor override that; the override is written to `localStorage` under the key
  `renvik-theme` (`'light'` or `'dark'`) and applied via `document.documentElement.dataset.theme`.
- The override must be applied **before first paint** to avoid a flash of the wrong theme, so
  `BaseLayout.astro` has a small inline `<script is:inline>` in `<head>` that reads `localStorage` and sets
  `data-theme` synchronously.
- Astro inlines this (and every other small page `<script>` — ThemeToggle, Navbar's mobile menu, the
  contact form handler) directly into the HTML as literal `<script type="module">` content rather than
  emitting external files, so none of them are covered by `script-src 'self'`. Rather than hand-maintain a
  CSP hash per script (fragile — minified output shifts on nearly any edit), `npm run build` runs
  `scripts/generate-csp-hashes.mjs` after `astro build`, which hashes every inline script across the whole
  built `dist/` and patches them into `dist/_headers` (`public/_headers` ships a `%%INLINE_SCRIPT_HASHES%%`
  placeholder, not real hashes — don't hand-edit hashes into `public/_headers`, they'd be discarded). See
  `docs/SECURITY.md#inline-script-csp-hashes`. This means `dist/_headers` — not `public/_headers` — is the
  one that's actually correct; if you ever bypass `npm run build` (e.g. run `astro build` directly), the
  deployed CSP will be broken (still carrying the literal placeholder text) and every inline script will be
  silently blocked by the browser.
- Color tokens live in `src/styles/global.css`, exposed to Tailwind via `@theme inline` (the `inline` keyword
  matters — it makes Tailwind's generated utilities reference the CSS variable at runtime instead of baking
  in a value at build time). The design is dark-first (v2 "Bold AI-native"), so the cascade is inverted from
  a typical light-default site: the unconditional `:root` block holds the **dark** tokens, a
  `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) {...} }` block overrides to light,
  and explicit `:root[data-theme="light"]` / `:root[data-theme="dark"]` blocks (highest specificity, latest
  source order) make the manual toggle win in both directions regardless of system preference. A new token
  needs a value in all four blocks (base `:root`, the light media override, and both explicit blocks) — see
  the file itself for the exact pattern, it's fiddly to get right from a description alone.

## Contact form

`src/pages/contact.astro` posts JSON to `/api/contact` (`functions/api/contact.ts`). Defense layers, in
order: a visually-hidden honeypot field (`website`) — any bot that fills it gets a fake success response —
then Cloudflare Turnstile server-side verification, then basic field validation, then the email send via
Resend. Rate limiting on the endpoint is a **Cloudflare dashboard rule**, not code — see
`docs/DEPLOYMENT.md#rate-limiting`.

Required secrets (Cloudflare Pages project → Settings → Environment variables; never commit these):
`TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`. The Turnstile **site**
key is public and is injected at build time as `PUBLIC_TURNSTILE_SITE_KEY`. Without it set, the page still
renders and the form still POSTs — the Turnstile widget and its token are simply omitted, and the Function
will reject the submission for a missing token. Don't treat that as a bug when testing locally without the key.

## Content honesty — read before adding "proof" content

This is a real company's real site. There are currently **no real client names, logos, testimonials,
metrics, certifications, or team bios** in this codebase. Several sections (homepage proof section, About
team section) were **deliberately left out** rather than filled with placeholder/invented content — look for
`TODO(content)` comments marking exactly where real content goes. If asked to "fill in" these sections:

- Never invent client names, logos, quotes, case-study numbers, or team members/photos.
- If the user supplies real content, use it. Otherwise ask, or leave the `TODO(content)` comment in place.
- The Contact page's phone/email/address were placeholders at launch; confirmed with real values via PR #1
  review comments (`src/pages/contact.astro`) and updated — no longer a `TODO(content)` item.

## Deploying

Static build → Cloudflare Pages, `functions/` deployed automatically as Pages Functions alongside it. Full
step-by-step (Pages project creation, custom domain, secrets, Turnstile, WAF, AI-scraper blocking) is in
`docs/DEPLOYMENT.md` — those are Cloudflare/Resend account actions that need the user's own dashboard access.
