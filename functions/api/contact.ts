// Cloudflare Pages Function - handles POST /api/contact.
//
// This is the site's only dynamic endpoint; everything else is static.
// Flow: honeypot check -> field validation -> Turnstile server-side
// verification -> send via Resend. Required secrets/vars (set in the
// Cloudflare Pages dashboard, not committed here) are documented in
// docs/DEPLOYMENT.md#contact-form-secrets.

interface Env {
  TURNSTILE_SECRET_KEY: string;
  RESEND_API_KEY: string;
  CONTACT_TO_EMAIL: string;
  CONTACT_FROM_EMAIL: string;
}

interface ContactPayload {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  website?: unknown; // honeypot - must stay empty
  turnstileToken?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LEN = 200;
const MAX_MESSAGE_LEN = 5000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  let payload: ContactPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body' }, 400);
  }

  // Honeypot: bots that fill every field trip this. Respond as if the
  // submission succeeded so the bot doesn't learn the field is a trap.
  if (typeof payload.website === 'string' && payload.website.trim() !== '') {
    return json({ ok: true });
  }

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  const turnstileToken = typeof payload.turnstileToken === 'string' ? payload.turnstileToken : '';

  if (!name || name.length > MAX_NAME_LEN) {
    return json({ ok: false, error: 'Please provide a valid name.' }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return json({ ok: false, error: 'Please provide a valid email address.' }, 400);
  }
  if (!message || message.length > MAX_MESSAGE_LEN) {
    return json({ ok: false, error: 'Please provide a message.' }, 400);
  }
  if (!turnstileToken) {
    return json({ ok: false, error: 'Verification failed. Please try again.' }, 400);
  }

  const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      secret: env.TURNSTILE_SECRET_KEY,
      response: turnstileToken,
      remoteip: request.headers.get('CF-Connecting-IP') ?? undefined,
    }),
  });
  const verifyResult = await verifyRes.json<{ success: boolean }>();
  if (!verifyResult.success) {
    return json({ ok: false, error: 'Verification failed. Please try again.' }, 403);
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL,
      to: env.CONTACT_TO_EMAIL,
      reply_to: email,
      subject: `New contact form message from ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    }),
  });

  if (!emailRes.ok) {
    return json({ ok: false, error: 'Could not send your message. Please try again shortly.' }, 502);
  }

  return json({ ok: true });
};
