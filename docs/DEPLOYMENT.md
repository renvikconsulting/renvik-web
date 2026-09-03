# Deployment (Cloudflare Pages)

Manual, account-gated setup. Everything here requires the site owner's own Cloudflare (and Resend) account
access — no agent session can complete these steps. Do them in roughly this order; later steps depend on
earlier ones.

## 1. Create the Pages project

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick the
   `renvikconsulting/renvik-web` repo, branch to deploy from `main` (merge `new-design-26` into `main` first,
   or point Pages at `new-design-26` temporarily for a preview).
2. Build settings:
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`
3. Deploy. The first deploy will fail to send email / verify Turnstile until steps 2–4 below are done — the
   rest of the site will still work.

## 2. Custom domain

**Workers & Pages** → your project → **Custom domains** → add `renvikconsulting.com` and `www`. If the
domain's DNS isn't already on Cloudflare, add the zone first (**Websites** → **Add a site**) and update
nameservers at the registrar.

## 3. Turnstile

1. **Turnstile** (left sidebar) → **Add site**. Domain: your production domain. Widget mode: **Managed**.
2. Copy the **Site Key** → Pages project → **Settings** → **Environment variables** → add
   `PUBLIC_TURNSTILE_SITE_KEY` (Production **and** Preview) — this is a *build-time* variable baked into the
   static HTML, so a change here needs a redeploy to take effect.
3. Copy the **Secret Key** → same Environment variables screen → add `TURNSTILE_SECRET_KEY` as a **secret**
   (not a plain variable) — this one is read at request time by `functions/api/contact.ts`, never shipped to
   the browser.
4. **Verify the CSP doesn't silently break the widget**: `public/_headers`' `connect-src` is `'self'` only.
   Turnstile's widget runs inside a cross-origin iframe with its own CSP context, so this should be fine —
   but confirm it for real: after the site key is live, open `/contact` with devtools open, solve the
   Turnstile challenge, and submit the form. If the console shows a `connect-src` CSP violation instead of
   a network request to `/api/contact`, add `https://challenges.cloudflare.com` to `connect-src` in
   `public/_headers` and redeploy. Do this once, after keys are live — it can't be verified without them.

## 4. Contact-form email (Resend)

1. Create a Resend account, verify a sending domain (or subdomain, e.g. `mail.renvikconsulting.com`) via the
   DNS records Resend gives you — add those to the Cloudflare DNS zone from step 2.
2. Create an API key → Pages project → Environment variables → add `RESEND_API_KEY` as a **secret**.
3. Add plain environment variables: `CONTACT_FROM_EMAIL` (an address on the verified sending domain, e.g.
   `noreply@renvikconsulting.com`) and `CONTACT_TO_EMAIL` (where form submissions should land).
4. Redeploy after adding these — Pages Functions pick up new env vars on the next deploy, not live.

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
- `curl https://<domain>/robots.txt` and confirm it's served (Cloudflare Pages serves `public/` files as-is).
- Run Lighthouse against the production URL — the static Astro output should score well on Performance/SEO
  out of the box; if not, check whether image sizes need attention (`public/*.jpg` are the original,
  unoptimized stock photos from the previous site).

## Rollback

Cloudflare Pages keeps every deployment; **Workers & Pages** → project → **Deployments** → pick a previous
one → **Rollback to this deployment**. No CLI/API step needed for a simple rollback.
