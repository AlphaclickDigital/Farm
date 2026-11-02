import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import Stripe from 'stripe';

// The API under test. Defaults to an isolated instance started with
// RESEND_API_KEY unset so no real emails are sent during test runs.
export const API = process.env.E2E_API_URL ?? 'http://localhost:3101';
// The Next.js app, used only for its real NextAuth credentials login.
export const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';

export const SAMPLE_PASSWORD = '12345678';

const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
if (!stripeKey.startsWith('sk_test_')) {
  throw new Error(
    'E2E tests only run against a Stripe TEST secret key (sk_test_...).',
  );
}
export const stripe = new Stripe(stripeKey, {
  apiVersion: '2026-01-28.clover',
});

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

export async function api<T = any>(
  method: string,
  path: string,
  opts: {
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResponse<T>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined && { 'Content-Type': 'application/json' }),
      ...(opts.token && { Authorization: `Bearer ${opts.token}` }),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body; keep raw text
  }
  return { status: res.status, body };
}

class CookieJar {
  private cookies = new Map<string, string>();
  store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      this.cookies.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

/**
 * Logs in through the real NextAuth credentials provider (bcrypt password
 * check against the database) and returns the backend access token that the
 * frontend would attach to API calls. Returns null when login is rejected.
 */
export async function login(
  email: string,
  password = SAMPLE_PASSWORD,
): Promise<string | null> {
  const jar = new CookieJar();
  const csrfRes = await fetch(`${WEB}/api/auth/csrf`);
  jar.store(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const cbRes = await fetch(`${WEB}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: jar.header(),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${WEB}/`,
    }),
  });
  jar.store(cbRes);

  const sessionRes = await fetch(`${WEB}/api/auth/session`, {
    headers: { Cookie: jar.header() },
  });
  const session = (await sessionRes.json()) as {
    user?: { accessToken?: string };
  } | null;
  return session?.user?.accessToken ?? null;
}

const tokenCache = new Map<string, string>();
export async function tokenFor(email: string): Promise<string> {
  const cached = tokenCache.get(email);
  if (cached) return cached;
  const token = await login(email);
  if (!token) throw new Error(`Login failed for ${email}`);
  tokenCache.set(email, token);
  return token;
}

/** Creates a user directly (registration is a Next.js server action, not an API). */
export async function ensureUser(email: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({
    data: { email, name, password: await bcrypt.hash(SAMPLE_PASSWORD, 10) },
  });
}

/** Sends a correctly signed Stripe webhook event to the API. */
export async function sendWebhook(
  type: string,
  object: Record<string, unknown>,
  opts: { secret?: string } = {},
) {
  const payload = JSON.stringify({
    id: `evt_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: 'event',
    api_version: '2026-01-28.clover',
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  });
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: opts.secret ?? process.env.STRIPE_WEBHOOK_SECRET ?? '',
  });
  return fetch(`${API}/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
    body: payload,
  });
}

/** Pays a PaymentIntent with a Stripe test card (no real money moves). */
export async function payIntent(
  paymentIntentId: string,
  paymentMethod = 'pm_card_visa',
) {
  return stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: paymentMethod,
    return_url: `${WEB}/checkout`,
  });
}

/** Recursively searches a JSON value for a key or a bcrypt-looking string. */
export function findSensitive(value: unknown, path = '$'): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...findSensitive(v, `${path}[${i}]`)));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'password' || k === 'tokenHash') hits.push(`${path}.${k}`);
      hits.push(...findSensitive(v, `${path}.${k}`));
    }
  } else if (typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value)) {
    hits.push(`${path} (bcrypt hash)`);
  }
  return hits;
}
