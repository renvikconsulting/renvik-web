# Deployment (Cloudflare Worker)

Manual, account-gated setup. Everything here requires the site owner's own Cloudflare (and Resend) account
access — no agent session can complete these steps. Do them in roughly this order; later steps depend on
earlier ones.

**This deploys as a Cloudflare Worker with static assets, not classic Cloudflare Pages.** The dashboard
project is named `renvik-web` under Workers & Pages → Workers Builds (git-connected), deployed with
`wrangler deploy`. If you only know the older Pages workflow: the equivalent concepts still exist (custom
domains, environment variables/secrets, "Pages Functions" for the one dynamic route) but live under a
Worker's settings pages instead of a Pages project's, and `functions/api/contact.ts` gets compiled into the
Worker's `main` script (`wrangler.jsonc` → `worker-build/index.js`) by `wrangler pages functions build` as
part of `npm run build` — see CLAUDE.md#stack for why that command is still the right tool despite its name.

## 1. Confirm the Workers Builds project

The `renvik-web` project already exists in the Cloudflare dashboard (Workers & Pages → Workers Builds),
git-connected to `renvikconsulting/renvik-web`, production branch `main`. Build settings should be:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

If you ever need to recreate it from scratch: **Workers & Pages** → **Create** → **Workers** → **Import a
repository** (not the "Pages" tab) → pick the repo → same build/deploy commands as above. `wrangler.jsonc`
in the repo root supplies `name` (must be `renvik-web` to match this project), `compatibility_date`,
`assets.directory` (`dist/`), and `main` (`worker-build/index.js`).

## 2. Custom domain

The Worker's dashboard page → **Settings** → **Domains & Routes** → add `renvikconsulting.com` and `www`. If
the domain's DNS isn't already on Cloudflare, add the zone first (**Websites** → **Add a site**) and update
nameservers at the registrar.

## 3. Turnstile

1. **Turnstile** (left sidebar) → **Add site**. Domain: your production domain. Widget mode: **Managed**.
2. Copy the **Site Key** → the Worker's **Settings** → **Variables and Secrets** → add
   `PUBLIC_TURNSTILE_SITE_KEY` — this is a *build-time* variable baked into the static HTML by Astro, so a
   change here needs a rebuild+redeploy (pushing to `main`, or re-running the Workers Build) to take effect.
3. Copy the **Secret Key** → same screen → add `TURNSTILE_SECRET_KEY` as a **secret** (not a plain
   variable) — this one is read at request time by the compiled `functions/api/contact.ts` logic, never
   shipped to the browser.
4. **Verify the CSP doesn't silently break the widget**: `public/_headers`' `connect-src` is `'self'` only.
   Turnstile's widget runs inside a cross-origin iframe with its own CSP context, so this should be fine —
   but confirm it for real: after the site key is live, open `/contact` with devtools open, solve the
   Turnstile challenge, and submit the form. If the console shows a `connect-src` CSP violation instead of
   a network request to `/api/contact`, add `https://challenges.cloudflare.com` to `connect-src` in
   `public/_headers` and redeploy. Do this once, after keys are live — it can't be verified without them.

## 4. Contact-form email (Resend)

1. Create a Resend account, verify a sending domain (or subdomain, e.g. `mail.renvikconsulting.com`) via the
   DNS records Resend gives you — add those to the Cloudflare DNS zone from step 2.
2. Create an API key → the Worker's **Settings** → **Variables and Secrets** → add `RESEND_API_KEY` as a
   **secret**.
3. Add plain environment variables: `CONTACT_FROM_EMAIL` (an address on the verified sending domain, e.g.
   `noreply@renvikconsulting.com`) and `CONTACT_TO_EMAIL` (where form submissions should land).
4. Redeploy after adding these — the compiled Worker script picks up new env vars on the next deploy, not
   live.

## 5. Rate limiting on `/api/contact`

**Security** → **WAF** → **Rate limiting rules** → create a rule scoped to `URI Path equals /api/contact`,
method `POST`, something like 5 requests / 1 minute per IP, action **Block** (or **Managed Challenge** if you
want to give real users a retry path instead of a hard block).

## 6. Block AI-training crawlers

**Security** → **Bots** → enable **"Block AI Scrapers and Crawlers"**. This is the real enforcement behind
the `Disallow` rules already in `public/robots.txt` — see `docs/SECURITY.md` for why both exist.

## 7. Verify after going live

- Load the production URL, confirm `https://<domain>/_headers`-configured headers are present:
  `curl -sI https://<domain>/ | grep -i content-security-policy` — it should show the CSP with the Turnstile
  allowance and a handful of `'sha256-...'` entries in `script-src`, **never** the literal string
  `%%INLINE_SCRIPT_HASHES%%` (that means the build ran `astro build` directly instead of `npm run build` —
  see `docs/SECURITY.md#inline-script-csp-hashes` — and every inline script on the site is currently being
  silently blocked; redeploy with `npm run build`).
- Submit the contact form for real; confirm the email arrives and check the Turnstile dashboard shows a
  verification event.
- `curl https://<domain>/robots.txt` and confirm it's served (Workers Static Assets serves `public/` files
  as-is, same `_headers`/`_redirects` convention Cloudflare Pages used).
- Run Lighthouse against the production URL — the static Astro output should score well on Performance/SEO
  out of the box.

## Rollback

The Worker's dashboard page → **Deployments** → pick a previous one → **Rollback to this deployment**. No
CLI/API step needed for a simple rollback.

## Troubleshooting: `[MISSING_EXPORT] "renderForPrerender" is not exported by "astro/app"`

If a build ever fails with this error pointing at `node_modules/@astrojs/cloudflare/...`: that package
should never be a dependency of this project (it's the Astro SSR adapter for Cloudflare — we deliberately
use static output + a hand-written Worker instead, see CLAUDE.md#stack) — check `git diff` on `package.json`
for how it got added and remove it. This is what broke the very first deploy attempt: the project had no
`wrangler.jsonc` at all yet, `wrangler deploy` had nothing to work from, and something in that gap pulled in
an incompatible `@astrojs/cloudflare` version. Fixed by adding `wrangler.jsonc` + the `worker-build` compile
step to `npm run build` (see CLAUDE.md#stack) — if this recurs, the fix is almost certainly "make sure
`@astrojs/cloudflare` is absent, not adding it back."
