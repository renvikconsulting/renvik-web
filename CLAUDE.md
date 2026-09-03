# Renvik Consulting website

AI-first marketing site for Renvik Consulting (AI strategy/implementation, IT consulting, technical staffing).
Rebuilt 2026-09 from a legacy Create React App SPA into a static Astro site, self-hosted on Cloudflare Pages.
Full rebuild plan/history: see git log on the `new-design-26` branch.

## Stack

- **Astro 5**, static output (`output: 'static'` in `astro.config.mjs`). No React/Vue/etc. — plain `.astro`
  components with vanilla `<script>` for interactivity (nav toggle, theme toggle, contact form). There was no
  reason to pull in a UI framework for a 4-page marketing site; don't add one without a real need.
- **Tailwind CSS v4** via `@tailwindcss/vite` (no separate `@astrojs/tailwind` integration, no `tailwind.config.js`
  — v4 is CSS-config-first, see `src/styles/global.css`).
- **Design language**: an original design system inspired by [AstroWind](https://github.com/onwidget/astrowind)
  (MIT-licensed Astro+Tailwind theme — clean SaaS/consulting aesthetic, built-in dark mode, strong
  Lighthouse/SEO scores) — not a fork, no AstroWind code was copied. Two other free/MIT options were
  considered and passed over: `shadcn-landing-page` (React+shadcn/ui — would have pulled in a UI framework
  this static 4-page site doesn't need) and a fully-custom design (more design iteration for no clear payoff
  over adapting a proven layout). If the visual direction needs to change later, that's the tradeoff being
  revisited.
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
- Color tokens live in `src/styles/global.css`: a `:root` block (light), a `@media (prefers-color-scheme:
  dark)` block, and a `:root[data-theme="dark"]` block, exposed to Tailwind via `@theme inline` (the `inline`
  keyword matters — it makes Tailwind's generated utilities reference the CSS variable at runtime instead of
  baking in the light-mode value at build time).

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
