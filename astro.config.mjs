import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Static output: the site is deployed as static files to Cloudflare Pages.
// The one dynamic endpoint (contact form) is a Cloudflare Pages Function
// under /functions, not an Astro SSR route — see functions/api/contact.ts.
export default defineConfig({
  site: 'https://www.renvikconsulting.com',
  output: 'static',
  integrations: [sitemap()],
  build: {
    // Force external stylesheets instead of Astro's default auto-inlining,
    // so the CSP in public/_headers doesn't need 'unsafe-inline' for styles.
    inlineStylesheets: 'never',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
