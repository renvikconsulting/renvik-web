# Renvik Consulting

Marketing site for Renvik Consulting — AI strategy & implementation, IT consulting, and technical staffing.
Static [Astro](https://astro.build) site with Tailwind CSS v4, deployed to Cloudflare Pages.

## Development

```bash
npm install
npm run dev       # http://localhost:4321
```

```bash
npm run build      # type-checks (astro check) then builds to dist/
npm run preview    # serve the production build locally
```

## Project structure

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture/conventions writeup (stack, directory layout,
theming, contact-form flow, content rules). Short version:

- `src/pages/` — the four routes (Home, About, Services, Contact)
- `src/components/` / `src/layouts/` — shared UI
- `src/styles/global.css` — Tailwind + light/dark theme tokens
- `functions/api/contact.ts` — the contact form's Cloudflare Pages Function backend
- `public/_headers`, `public/robots.txt` — security headers/CSP and bot-crawler rules

## Deployment & security

- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — Cloudflare Pages setup, custom domain, Turnstile, Resend,
  rate limiting, AI-crawler blocking. All manual/account-gated steps.
- [`docs/SECURITY.md`](./docs/SECURITY.md) — what's implemented in code vs. dashboard-configured, and the
  realistic scope of bot/scraper defense for a public marketing site.
