/**
 * End-to-end API tests for the farm marketplace.
 *
 * Runs against a live API (E2E_API_URL, default http://localhost:3101) and
 * the Next.js app's real NextAuth login (E2E_WEB_URL, default
 * http://localhost:3000), using the sample data from `npm run seed:sample --
 * --with-admin` and Stripe TEST mode only.
 *
 * Write-heavy tests use two dedicated fixture vendors (e2e.vendor.a/b@example.com)
 * that are suspended again in afterAll, so they never show up publicly.
 */
import * as crypto from 'crypto';
import {
  API,
  api,
  ensureUser,
  findSensitive,
  login,
  payIntent,
  prisma,
  sendWebhook,
  stripe,
  tokenFor,
} from './helpers/e2e-client';

jest.setTimeout(180_000);

const SAMPLE_VENDORS = [
  'greenvalley@example.com',
  'southerncross@example.com',
  'goldenharvest@example.com',
  'riverlandfresh@example.com',
  'highlanddairy@example.com',
  'outbackfree@example.com',
  'sunnyacres@example.com',
  'bluemountain@example.com',
  'coastalseafood@example.com',
  'freshroots@example.com',
];
const PENDING_VENDOR = 'wattlecreek@example.com';
const CUSTOMER_1 = 'sample.customer1@example.com';
const CUSTOMER_2 = 'sample.customer2@example.com';
const ADMIN = 'sample.admin@example.com';
const FIXTURE_VENDORS = [
  { email: 'e2e.vendor.a@example.com', storeName: 'E2E Test Farm A' },
  { email: 'e2e.vendor.b@example.com', storeName: 'E2E Test Farm B' },
];

const ADDRESS = {
  name: 'Sam Sample',
  address: '1 Example Street',
  city: 'Ballarat',
  state: 'VIC',
  zip: '3350',
  phone: '0491 570 156',
};

interface Fixture {
  email: string;
  token: string;
  vendorId: string;
  flatOptionId: string;
  flatRateCents: number;
}

let adminToken: string;
let c1: string;
let c2: string;
let vendorA: Fixture;
let vendorB: Fixture;
let categoryId: string;
let commissionRate: number;
let promoPriceCents: number;

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function createProduct(
  v: Fixture,
  overrides: Partial<{
    name: string;
    stockAmount: number;
    isActive: boolean;
    variants: {
      label: string;
      unitAmount: number;
      priceCents: number;
      weightGrams?: number;
    }[];
    discountName: string;
    discountCents: number;
    discountEndsAt: string;
  }> = {},
) {
  const res = await api('POST', '/products', {
    token: v.token,
    body: {
      name: `E2E Product ${uniq()}`,
      description: 'Automated test fixture',
      baseUnit: 'gram',
      stockAmount: 5000,
      categoryId,
      variants: [
        { label: '500g', unitAmount: 500, priceCents: 1000, weightGrams: 500 },
        { label: '1kg', unitAmount: 1000, priceCents: 1800, weightGrams: 1000 },
      ],
      imageUrls: [
        'https://images.pexels.com/photos/4110462/pexels-photo-4110462.jpeg?w=400',
      ],
      ...overrides,
    },
  });
  expect(res.status).toBe(201);
  return res.body;
}

type Line = {
  productId: string;
  variantId: string;
  quantity: number;
  priceCents: number;
};
const line = (
  product: any,
  variantIndex: number,
  quantity: number,
  priceCents?: number,
): Line => ({
  productId: product.id,
  variantId: product.variants[variantIndex].id,
  quantity,
  priceCents: priceCents ?? product.variants[variantIndex].priceCents,
});

async function createIntent(
  token: string,
  items: Line[],
  selections: { vendorId: string; shippingOptionId: string }[],
) {
  return api('POST', '/payment/create-intent', {
    token,
    body: { items, shippingSelections: selections, shippingAddress: ADDRESS },
  });
}

async function createOrder(
  token: string,
  paymentIntentId: string,
  items: Line[],
  selections: { vendorId: string; shippingOptionId: string }[],
) {
  return api('POST', '/payment/create-order', {
    token,
    body: {
      paymentIntentId,
      items,
      shippingSelections: selections,
      shippingAddress: ADDRESS,
    },
  });
}

/** Full happy-path purchase: intent -> Stripe test card -> create order. */
async function purchase(token: string, items: Line[], vendors: Fixture[]) {
  const sel = vendors.map((v) => ({
    vendorId: v.vendorId,
    shippingOptionId: v.flatOptionId,
  }));
  const intent = await createIntent(token, items, sel);
  expect(intent.status).toBe(201);
  await payIntent(intent.body.paymentIntentId);
  const order = await createOrder(
    token,
    intent.body.paymentIntentId,
    items,
    sel,
  );
  expect(order.status).toBe(201);
  return { intent: intent.body, order: order.body };
}

const stockOf = async (productId: string) =>
  (await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
    .stockAmount;

async function setupFixtureVendor(
  email: string,
  storeName: string,
): Promise<Fixture> {
  await ensureUser(email, storeName);
  const token = await tokenFor(email);
  let me = await api('GET', '/vendors/me', { token });
  if (me.status === 404) {
    const reg = await api('POST', '/vendors/register', {
      token,
      body: { storeName, description: 'E2E test fixture vendor' },
    });
    expect(reg.status).toBe(201);
    me = await api('GET', '/vendors/me', { token });
  }
  const vendorId = me.body.id;
  await api('POST', `/admin/vendors/${vendorId}/approve`, {
    token: adminToken,
  });
  await api('POST', `/admin/vendors/${vendorId}/unsuspend`, {
    token: adminToken,
  });

  const options = await api('GET', '/vendors/me/shipping', { token });
  let flat = options.body.find(
    (o: any) => o.name === 'E2E Flat Rate' && o.isActive,
  );
  if (!flat) {
    const created = await api('POST', '/vendors/me/shipping', {
      token,
      body: {
        name: 'E2E Flat Rate',
        type: 'FLAT_RATE',
        flatRateCents: 1000,
        estimatedDays: '2-3 business days',
      },
    });
    expect(created.status).toBe(201);
    flat = created.body;
  }
  return {
    email,
    token,
    vendorId,
    flatOptionId: flat.id,
    flatRateCents: flat.flatRateCents,
  };
}

beforeAll(async () => {
  adminToken = await tokenFor(ADMIN);
  c1 = await tokenFor(CUSTOMER_1);
  c2 = await tokenFor(CUSTOMER_2);

  const cats = await api('GET', '/categories');
  categoryId = cats.body.find((c: any) => c.slug === 'farm-produce').id;

  const config = await api('GET', '/admin/configuration', {
    token: adminToken,
  });
  const byKey = Object.fromEntries(
    config.body.map((c: any) => [c.key, c.value]),
  );
  commissionRate = Number.isFinite(parseFloat(byKey.commission_rate))
    ? parseFloat(byKey.commission_rate)
    : 0.1;
  promoPriceCents = Number.isFinite(
    parseInt(byKey.featured_listing_price_cents, 10),
  )
    ? parseInt(byKey.featured_listing_price_cents, 10)
    : 2000;

  vendorA = await setupFixtureVendor(
    FIXTURE_VENDORS[0].email,
    FIXTURE_VENDORS[0].storeName,
  );
  vendorB = await setupFixtureVendor(
    FIXTURE_VENDORS[1].email,
    FIXTURE_VENDORS[1].storeName,
  );
});

afterAll(async () => {
  // Hide fixture vendors (and therefore their products) from the storefront.
  for (const v of [vendorA, vendorB]) {
    if (v) {
      await api('POST', `/admin/vendors/${v.vendorId}/suspend`, {
        token: adminToken,
        body: { reason: 'E2E test fixture vendor' },
      });
    }
  }
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Sample accounts', () => {
  it.each(SAMPLE_VENDORS)(
    '%s can log in with the shared sample password and sees its own store',
    async (email) => {
      const token = await login(email);
      expect(token).toBeTruthy();
      const payload = JSON.parse(
        Buffer.from(token!.split('.')[1], 'base64url').toString(),
      );
      expect(payload.role).toBe('VENDOR');

      const me = await api('GET', '/vendors/me', { token: token! });
      expect(me.status).toBe(200);
      expect(me.body.isApproved).toBe(true);
      expect(me.body.location).toBeTruthy();
      expect(me.body.state).toMatch(/^(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)$/);
      expect(me.body.phone).toMatch(/^\(0\d\) 5550 \d{4}$/);
      expect(me.body.photo).toMatch(/^https:\/\//);

      const products = await api('GET', '/products/vendor/my-products', {
        token: token!,
      });
      expect(products.status).toBe(200);
      expect(products.body.length).toBeGreaterThanOrEqual(8);
      expect(products.body.every((p: any) => p.vendorId === me.body.id)).toBe(
        true,
      );

      const orders = await api('GET', '/orders/vendor/orders', {
        token: token!,
      });
      expect(orders.status).toBe(200);
      expect(orders.body.every((o: any) => o.vendorId === me.body.id)).toBe(
        true,
      );

      expect(
        (await api('GET', '/orders/vendor/stats', { token: token! })).status,
      ).toBe(200);
      const shipping = await api('GET', '/vendors/me/shipping', {
        token: token!,
      });
      expect(shipping.body.length).toBeGreaterThanOrEqual(1);

      // No Stripe Connect account is pretended for sample vendors.
      const balance = await api('GET', '/payouts/me/balance', {
        token: token!,
      });
      expect(balance.status).toBe(200);
      expect(balance.body.stripeConnected).toBe(false);
      expect(balance.body.eligible).toBe(false);
    },
  );

  it('pending vendor can log in but is not approved', async () => {
    const token = await tokenFor(PENDING_VENDOR);
    const me = await api('GET', '/vendors/me', { token });
    expect(me.body.isApproved).toBe(false);
  });

  it('rejects a wrong password', async () => {
    expect(await login(SAMPLE_VENDORS[0], 'not-the-password')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Public catalog', () => {
  it('lists 13 categories', async () => {
    const res = await api('GET', '/categories');
    const slugs = res.body.map((c: any) => c.slug);
    for (const s of [
      'beef',
      'lamb',
      'chicken',
      'pork',
      'eggs',
      'dairy',
      'fruits',
      'vegetable',
      'organic-produce',
      'honey',
      'seafood',
      'herbs',
      'farm-produce',
    ]) {
      expect(slugs).toContain(s);
    }
  });

  it('only lists active products from approved, unsuspended vendors', async () => {
    const res = await api('GET', '/products');
    expect(res.status).toBe(200);
    const ids: string[] = res.body.map((p: any) => p.id);
    const hidden = await prisma.product.findMany({
      where: {
        OR: [
          { isActive: false },
          { vendor: { isApproved: false } },
          { vendor: { isSuspended: true } },
        ],
      },
      select: { id: true },
    });
    expect(hidden.length).toBeGreaterThan(0);
    for (const h of hidden) expect(ids).not.toContain(h.id);
    expect(res.body.length).toBeGreaterThanOrEqual(90);
  });

  it('search matches product names and descriptions', async () => {
    const res = await api('GET', '/products?search=honey');
    expect(res.body.length).toBeGreaterThanOrEqual(5);
    expect(
      res.body.every((p: any) => /honey/i.test(`${p.name} ${p.description}`)),
    ).toBe(true);
  });

  it('vendor directory lists approved sample vendors and hides the pending one', async () => {
    const res = await api('GET', '/vendors');
    const names = res.body.map((v: any) => v.storeName);
    expect(names).toEqual(
      expect.arrayContaining([
        'Green Valley Farm',
        'Coastal Seafood Farm',
        'Blue Mountain Honey Farm',
      ]),
    );
    expect(names).not.toContain('Wattle Creek Pastures');
    const gv = res.body.find((v: any) => v.storeName === 'Green Valley Farm');
    // Product count badge should only count publicly visible products.
    expect(gv._count.products).toBe(10);
  });

  it('a pending vendor store page is not publicly accessible', async () => {
    const pending = await prisma.vendor.findFirstOrThrow({
      where: { storeName: 'Wattle Creek Pastures' },
    });
    expect((await api('GET', `/vendors/${pending.id}`)).status).toBe(404);
  });

  it('a vendor store page returns only active products', async () => {
    const gv = await prisma.vendor.findFirstOrThrow({
      where: { storeName: 'Green Valley Farm' },
    });
    const res = await api('GET', `/vendors/${gv.id}`);
    expect(res.status).toBe(200);
    expect(res.body.products.length).toBe(10);
    expect(res.body.products.every((p: any) => p.isActive)).toBe(true);
    expect(res.body.location).toBe('Yarra Valley');
  });

  it('public responses never contain password hashes', async () => {
    const gv = await prisma.vendor.findFirstOrThrow({
      where: { storeName: 'Green Valley Farm' },
    });
    const product = await prisma.product.findFirstOrThrow({
      where: { vendorId: gv.id },
    });
    for (const path of [
      '/products',
      '/vendors',
      `/vendors/${gv.id}`,
      `/products/${product.id}`,
      '/promotions/featured-products',
      `/reviews/vendor/${gv.id}`,
    ]) {
      const res = await api('GET', path);
      expect(findSensitive(res.body)).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Authentication and authorization', () => {
  const forge = (payload: object, secret: string) => {
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = b64({ alg: 'HS256', typ: 'JWT' });
    const body = b64(payload);
    const sig = crypto
      .createHmac('sha256', secret)
      .update(`${head}.${body}`)
      .digest('base64url');
    return `${head}.${body}.${sig}`;
  };

  it.each([
    ['POST', '/products'],
    ['GET', '/vendors/me'],
    ['GET', '/orders/my-orders'],
    ['GET', '/orders/vendor/orders'],
    ['POST', '/payment/create-intent'],
    ['GET', '/admin/stats'],
    ['GET', '/payouts/admin'],
    ['GET', '/promotions/admin'],
    ['DELETE', '/products/00000000-0000-0000-0000-000000000000'],
  ])('%s %s requires authentication', async (method, path) => {
    expect(
      (await api(method, path, { body: method === 'GET' ? undefined : {} }))
        .status,
    ).toBe(401);
  });

  it('rejects tokens signed with the wrong secret, and expired tokens', async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: ADMIN },
    });
    const now = Math.floor(Date.now() / 1000);
    const wrongSecret = forge(
      { sub: admin.id, email: ADMIN, role: 'ADMIN', iat: now, exp: now + 3600 },
      'guessed-secret',
    );
    expect(
      (await api('GET', '/admin/stats', { token: wrongSecret })).status,
    ).toBe(401);
    const expired = forge(
      {
        sub: admin.id,
        email: ADMIN,
        role: 'ADMIN',
        iat: now - 7200,
        exp: now - 3600,
      },
      process.env.AUTH_SECRET ?? '',
    );
    expect((await api('GET', '/admin/stats', { token: expired })).status).toBe(
      401,
    );
  });

  it.each([
    ['customer', CUSTOMER_1],
    ['vendor', SAMPLE_VENDORS[0]],
  ])('%s cannot use admin endpoints', async (_label, email) => {
    const token = await tokenFor(email);
    for (const [method, path] of [
      ['GET', '/admin/stats'],
      ['GET', '/admin/vendors'],
      ['GET', '/admin/orders'],
      ['GET', '/admin/users'],
      ['POST', '/admin/categories'],
      ['PATCH', '/admin/configuration/commission_rate'],
      ['GET', '/payouts/admin'],
      ['GET', '/promotions/admin'],
    ]) {
      const res = await api(method, path, {
        token,
        body:
          method === 'GET' ? undefined : { name: 'x', slug: 'x', value: '0' },
      });
      expect(res.status).toBe(403);
    }
  });

  it('category seeding is not open to anonymous callers', async () => {
    expect([401, 403, 404]).toContain(
      (await api('POST', '/categories/seed')).status,
    );
  });

  it('customer cannot create products or access the vendor dashboard API', async () => {
    expect(
      (
        await api('POST', '/products', {
          token: c1,
          body: {
            name: 'x',
            baseUnit: 'gram',
            stockAmount: 1,
            categoryId,
            variants: [{ label: 'a', unitAmount: 1, priceCents: 100 }],
          },
        })
      ).status,
    ).toBe(400);
    expect((await api('GET', '/vendors/me', { token: c1 })).status).toBe(404);
    expect(
      (await api('GET', '/orders/vendor/orders', { token: c1 })).status,
    ).toBe(404);
  });

  it("vendor cannot edit or delete another vendor's product", async () => {
    const productB = await createProduct(vendorB);
    const edit = await api('PATCH', `/products/${productB.id}`, {
      token: vendorA.token,
      body: { name: 'Hijacked' },
    });
    expect(edit.status).toBe(403);
    const del = await api('DELETE', `/products/${productB.id}`, {
      token: vendorA.token,
    });
    expect(del.status).toBe(403);
    const delByCustomer = await api('DELETE', `/products/${productB.id}`, {
      token: c1,
    });
    expect(delByCustomer.status).toBe(403);
    expect(
      await prisma.product.findUnique({ where: { id: productB.id } }),
    ).not.toBeNull();
  });

  it("vendor cannot modify another vendor's variant through their own product", async () => {
    const productA = await createProduct(vendorA);
    const productB = await createProduct(vendorB);
    const victim = productB.variants[0];
    const res = await api('PATCH', `/products/${productA.id}`, {
      token: vendorA.token,
      body: {
        variants: [
          { id: victim.id, label: 'Pwned', unitAmount: 1, priceCents: 1 },
        ],
      },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const after = await prisma.productVariant.findUniqueOrThrow({
      where: { id: victim.id },
    });
    expect(after.priceCents).toBe(victim.priceCents);
    expect(after.label).toBe(victim.label);
    expect(after.productId).toBe(productB.id);
  });

  it("vendors cannot see or act on each other's orders; customers cannot see each other's orders", async () => {
    const product = await createProduct(vendorB);
    const { order } = await purchase(c1, [line(product, 0, 1)], [vendorB]);
    const vo = order.vendorOrders[0];

    expect(
      (
        await api('GET', `/orders/vendor/orders/${vo.id}`, {
          token: vendorA.token,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api('PATCH', `/orders/vendor/orders/${vo.id}/status`, {
          token: vendorA.token,
          body: { status: 'SHIPPED' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api('PATCH', `/orders/vendor/orders/${vo.id}/tracking`, {
          token: vendorA.token,
          body: { trackingNumber: 'X' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api('PATCH', `/orders/vendor/orders/${vo.id}/address`, {
          token: vendorA.token,
          body: { shippingCity: 'X' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api('POST', `/orders/vendor/orders/${vo.id}/refund`, {
          token: vendorA.token,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api('POST', `/orders/admin/orders/${vo.id}/refund`, {
          token: vendorB.token,
        })
      ).status,
    ).toBe(403);
    expect(
      (await api('GET', `/orders/my-orders/${order.id}`, { token: c2 })).status,
    ).toBe(403);

    const listA = await api('GET', '/orders/vendor/orders', {
      token: vendorA.token,
    });
    expect(listA.body.map((o: any) => o.id)).not.toContain(vo.id);
  });

  it('order responses do not leak password hashes of customers or vendors', async () => {
    const product = await createProduct(vendorB);
    const { order } = await purchase(c1, [line(product, 0, 1)], [vendorB]);
    expect(findSensitive(order)).toEqual([]);
    const vo = order.vendorOrders[0];
    for (const [path, token] of [
      ['/orders/vendor/orders', vendorB.token],
      [`/orders/vendor/orders/${vo.id}`, vendorB.token],
      ['/orders/my-orders', c1],
      [`/orders/my-orders/${order.id}`, c1],
      ['/admin/orders', adminToken],
      ['/admin/users', adminToken],
      ['/admin/vendors', adminToken],
    ] as const) {
      const res = await api('GET', path, { token });
      expect(res.status).toBe(200);
      expect(findSensitive(res.body)).toEqual([]);
    }
    const status = await api('PATCH', `/orders/vendor/orders/${vo.id}/status`, {
      token: vendorB.token,
      body: { status: 'PROCESSING' },
    });
    expect(findSensitive(status.body)).toEqual([]);
  });

  it('rejects webhooks with a missing or invalid Stripe signature', async () => {
    const noSig = await fetch(`${API}/stripe/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(noSig.status).toBe(400);
    const badSig = await sendWebhook(
      'payment_intent.succeeded',
      { id: 'pi_fake', object: 'payment_intent' },
      { secret: 'whsec_wrong' },
    );
    expect(badSig.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Input validation', () => {
  it('rejects invalid product payloads', async () => {
    const base = {
      name: 'Bad',
      baseUnit: 'gram',
      stockAmount: 10,
      categoryId,
      variants: [{ label: 'a', unitAmount: 1, priceCents: 100 }],
    };
    for (const body of [
      { ...base, stockAmount: -1 },
      { ...base, variants: [] },
      { ...base, variants: [{ label: 'a', unitAmount: 0, priceCents: 100 }] },
      { ...base, variants: [{ label: 'a', unitAmount: 1, priceCents: 0 }] },
      { ...base, categoryId: '00000000-0000-0000-0000-000000000000' },
      { ...base, name: '' },
    ]) {
      expect(
        (await api('POST', '/products', { token: vendorA.token, body })).status,
      ).toBe(400);
    }
  });

  it('rejects invalid vendor profile values', async () => {
    expect(
      (
        await api('PATCH', '/vendors/me', {
          token: vendorA.token,
          body: { state: 'XYZ' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api('PATCH', '/vendors/me', {
          token: vendorA.token,
          body: { phone: 'call me' },
        })
      ).status,
    ).toBe(400);
  });

  it('rejects invalid checkout quantities', async () => {
    const product = await createProduct(vendorA);
    const sel = [
      { vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId },
    ];
    expect((await createIntent(c1, [line(product, 0, 0)], sel)).status).toBe(
      400,
    );
    expect((await createIntent(c1, [line(product, 0, -2)], sel)).status).toBe(
      400,
    );
  });

  it('rejects reviews without a completed purchase and out-of-range ratings', async () => {
    const product = await createProduct(vendorA);
    expect(
      (
        await api('POST', '/reviews', {
          token: c1,
          body: { productId: product.id, rating: 5 },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api('POST', '/reviews', {
          token: c1,
          body: { productId: product.id, rating: 6 },
        })
      ).status,
    ).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Server-side pricing', () => {
  it('rejects a tampered item price', async () => {
    const product = await createProduct(vendorA);
    const res = await createIntent(
      c1,
      [line(product, 0, 1, 1)],
      [{ vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId }],
    );
    expect(res.status).toBe(400);
  });

  it('charges subtotal plus server-computed shipping', async () => {
    const product = await createProduct(vendorA);
    const res = await createIntent(
      c1,
      [line(product, 0, 2), line(product, 1, 1)],
      [{ vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId }],
    );
    expect(res.status).toBe(201);
    expect(res.body.productSubtotalCents).toBe(2 * 1000 + 1800);
    expect(res.body.shippingCents).toBe(vendorA.flatRateCents);
    expect(res.body.totalAmountCents).toBe(3800 + vendorA.flatRateCents);
    const pi = await stripe.paymentIntents.retrieve(res.body.paymentIntentId);
    expect(pi.amount).toBe(res.body.totalAmountCents);
    expect(pi.currency).toBe('aud');
    await stripe.paymentIntents.cancel(pi.id);
  });

  it('applies free-shipping thresholds and weight tiers server-side', async () => {
    const opt = await api('POST', '/vendors/me/shipping', {
      token: vendorA.token,
      body: {
        name: `E2E Weight ${uniq()}`,
        type: 'WEIGHT_BASED',
        estimatedDays: '1-2 days',
        minOrderCents: 5000,
        weightTiers: [
          { maxGrams: 1000, priceCents: 700 },
          { priceCents: 1500 },
        ],
      },
    });
    expect(opt.status).toBe(201);
    const product = await createProduct(vendorA);
    const sel = [{ vendorId: vendorA.vendorId, shippingOptionId: opt.body.id }];

    const light = await createIntent(c1, [line(product, 0, 1)], sel); // 500g, $10
    expect(light.body.shippingCents).toBe(700);
    const heavy = await createIntent(c1, [line(product, 1, 2)], sel); // 2kg, $36
    expect(heavy.body.shippingCents).toBe(1500);
    const free = await createIntent(c1, [line(product, 1, 3)], sel); // $54 >= $50
    expect(free.body.shippingCents).toBe(0);

    await api('PATCH', `/vendors/me/shipping/${opt.body.id}`, {
      token: vendorA.token,
      body: { isActive: false },
    });
    const inactive = await createIntent(c1, [line(product, 0, 1)], sel);
    expect(inactive.status).toBe(400);
  });

  it('requires a shipping selection for every vendor in the cart', async () => {
    const product = await createProduct(vendorA);
    const res = await createIntent(c1, [line(product, 0, 1)], []);
    expect(res.status).toBe(400);
  });

  it('rejects shipping selections for vendors not in the cart', async () => {
    const product = await createProduct(vendorA);
    const res = await createIntent(
      c1,
      [line(product, 0, 1)],
      [
        { vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId },
        { vendorId: vendorB.vendorId, shippingOptionId: vendorB.flatOptionId },
      ],
    );
    expect(res.status).toBe(400);
  });

  it('charges the discounted price shown to customers, and only while the discount is active', async () => {
    const product = await createProduct(vendorA, {
      discountName: 'E2E Special',
      discountCents: 200,
      discountEndsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const sel = [
      { vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId },
    ];
    const discounted = await createIntent(c1, [line(product, 0, 1, 800)], sel);
    expect(discounted.status).toBe(201);
    expect(discounted.body.productSubtotalCents).toBe(800);
    expect(
      (await createIntent(c1, [line(product, 0, 1, 1000)], sel)).status,
    ).toBe(400);

    const quote = await api(
      'POST',
      `/vendors/${vendorA.vendorId}/shipping/quote`,
      { body: { items: [line(product, 0, 1, 800)] } },
    );
    expect(quote.status).toBe(201);

    const expired = await createProduct(vendorA, {
      discountName: 'Old',
      discountCents: 200,
      discountEndsAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect(
      (await createIntent(c1, [line(expired, 0, 1, 800)], sel)).status,
    ).toBe(400);
    expect(
      (await createIntent(c1, [line(expired, 0, 1, 1000)], sel)).status,
    ).toBe(201);
  });

  it('a paid promotion PaymentIntent cannot be redeemed as a product order', async () => {
    const promoted = await createProduct(vendorA);
    const intent = await api('POST', '/promotions/intent', {
      token: vendorA.token,
      body: { type: 'FEATURED_PRODUCT', productId: promoted.id },
    });
    expect(intent.status).toBe(201);
    await payIntent(intent.body.paymentIntentId);

    const target = await createProduct(vendorB, {
      variants: [
        {
          label: 'exact',
          unitAmount: 1,
          priceCents: promoPriceCents - vendorB.flatRateCents,
        },
      ],
    });
    const sel = [
      { vendorId: vendorB.vendorId, shippingOptionId: vendorB.flatOptionId },
    ];
    const res = await createOrder(
      vendorA.token,
      intent.body.paymentIntentId,
      [line(target, 0, 1)],
      sel,
    );
    expect(res.status).toBe(400);
    expect(
      await prisma.order.findUnique({
        where: { stripePaymentId: intent.body.paymentIntentId },
      }),
    ).toBeNull();
  });

  it('builds the order from the server-side checkout record, not from client-submitted items', async () => {
    const product = await createProduct(vendorA);
    const sel = [
      { vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId },
    ];
    const items = [line(product, 1, 1)]; // 1kg @ $18
    const intent = await createIntent(c1, items, sel);
    await payIntent(intent.body.paymentIntentId);
    // Same $18 total, different items: 500g x ... priced to match is not possible, so swap quantity/variant.
    const swapped = [{ ...line(product, 0, 2), priceCents: 900 }];
    const res = await createOrder(
      c1,
      intent.body.paymentIntentId,
      swapped,
      sel,
    );
    expect(res.status).toBe(201);
    const orderItems = res.body.vendorOrders[0].items;
    expect(orderItems).toHaveLength(1);
    expect(orderItems[0].variantId).toBe(product.variants[1].id);
    expect(orderItems[0].quantity).toBe(1);
    expect(orderItems[0].priceCents).toBe(1800);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Stripe checkout', () => {
  it('multi-vendor order: totals, commission, vendor earnings and stock', async () => {
    const pa = await createProduct(vendorA, { stockAmount: 10000 });
    const pb = await createProduct(vendorB, { stockAmount: 10000 });
    const items = [line(pa, 0, 2), line(pa, 1, 1), line(pb, 1, 2)];
    const { intent, order } = await purchase(c1, items, [vendorA, vendorB]);

    expect(order.status).toBe('PAID');
    expect(order.totalAmountCents).toBe(intent.totalAmountCents);
    expect(order.shippingCents).toBe(
      vendorA.flatRateCents + vendorB.flatRateCents,
    );
    expect(order.vendorOrders).toHaveLength(2);

    const voA = order.vendorOrders.find(
      (vo: any) => vo.vendorId === vendorA.vendorId,
    );
    const voB = order.vendorOrders.find(
      (vo: any) => vo.vendorId === vendorB.vendorId,
    );
    expect(voA.subtotalCents).toBe(2 * 1000 + 1800);
    expect(voB.subtotalCents).toBe(2 * 1800);
    for (const vo of [voA, voB]) {
      expect(vo.commissionCents).toBe(
        Math.round(vo.subtotalCents * commissionRate),
      );
      expect(vo.payoutCents).toBe(
        vo.subtotalCents - vo.commissionCents + vo.shippingCents,
      );
      expect(vo.status).toBe('PROCESSING');
    }
    const pi = await stripe.paymentIntents.retrieve(intent.paymentIntentId);
    expect(pi.status).toBe('succeeded');
    expect(pi.amount_received).toBe(order.totalAmountCents);

    // 2 x 500g + 1 x 1kg = 2kg; 2 x 1kg = 2kg
    expect(await stockOf(pa.id)).toBe(8000);
    expect(await stockOf(pb.id)).toBe(8000);

    // Visible in the customer's order history and each vendor's order list.
    const mine = await api('GET', '/orders/my-orders', { token: c1 });
    expect(mine.body.map((o: any) => o.id)).toContain(order.id);
    const vendorList = await api('GET', '/orders/vendor/orders', {
      token: vendorB.token,
    });
    expect(vendorList.body.map((o: any) => o.id)).toContain(voB.id);
  });

  it('repeating create-order and duplicate webhook deliveries never duplicate orders or stock deductions', async () => {
    const product = await createProduct(vendorA, { stockAmount: 5000 });
    const items = [line(product, 0, 2)];
    const { intent, order } = await purchase(c1, items, [vendorA]);
    expect(await stockOf(product.id)).toBe(4000);

    const again = await createOrder(c1, intent.paymentIntentId, items, [
      { vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId },
    ]);
    expect(again.status).toBe(201);
    expect(again.body.id).toBe(order.id);

    for (let i = 0; i < 3; i++) {
      const res = await sendWebhook('payment_intent.succeeded', {
        id: intent.paymentIntentId,
        object: 'payment_intent',
      });
      expect(res.status).toBe(201);
    }
    expect(
      await prisma.order.count({
        where: { stripePaymentId: intent.paymentIntentId },
      }),
    ).toBe(1);
    expect(await stockOf(product.id)).toBe(4000);
  });

  it('webhook creates the order when the client never calls back, exactly once', async () => {
    const product = await createProduct(vendorA, { stockAmount: 3000 });
    const sel = [
      { vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId },
    ];
    const intent = await createIntent(c1, [line(product, 1, 1)], sel);
    await payIntent(intent.body.paymentIntentId);

    await Promise.all([
      sendWebhook('payment_intent.succeeded', {
        id: intent.body.paymentIntentId,
        object: 'payment_intent',
      }),
      sendWebhook('payment_intent.succeeded', {
        id: intent.body.paymentIntentId,
        object: 'payment_intent',
      }),
    ]);
    await sendWebhook('payment_intent.succeeded', {
      id: intent.body.paymentIntentId,
      object: 'payment_intent',
    });

    expect(
      await prisma.order.count({
        where: { stripePaymentId: intent.body.paymentIntentId },
      }),
    ).toBe(1);
    expect(await stockOf(product.id)).toBe(2000);
    expect(
      await prisma.pendingOrder.count({
        where: { paymentIntentId: intent.body.paymentIntentId },
      }),
    ).toBe(0);
  });

  it('declined card: no order, no stock change', async () => {
    const product = await createProduct(vendorA, { stockAmount: 2000 });
    const sel = [
      { vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId },
    ];
    const intent = await createIntent(c1, [line(product, 0, 1)], sel);
    await expect(
      payIntent(intent.body.paymentIntentId, 'pm_card_chargeDeclined'),
    ).rejects.toMatchObject({ code: 'card_declined' });
    const res = await createOrder(
      c1,
      intent.body.paymentIntentId,
      [line(product, 0, 1)],
      sel,
    );
    expect(res.status).toBe(400);
    expect(await stockOf(product.id)).toBe(2000);
    expect(
      await prisma.order.findUnique({
        where: { stripePaymentId: intent.body.paymentIntentId },
      }),
    ).toBeNull();
  });

  it('cancelled checkout: no order, no stock change', async () => {
    const product = await createProduct(vendorA, { stockAmount: 2000 });
    const sel = [
      { vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId },
    ];
    const intent = await createIntent(c1, [line(product, 0, 1)], sel);
    await stripe.paymentIntents.cancel(intent.body.paymentIntentId);
    expect(
      (
        await createOrder(
          c1,
          intent.body.paymentIntentId,
          [line(product, 0, 1)],
          sel,
        )
      ).status,
    ).toBe(400);
    expect(await stockOf(product.id)).toBe(2000);
  });

  it("a customer cannot claim another customer's payment", async () => {
    const product = await createProduct(vendorA);
    const sel = [
      { vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId },
    ];
    const intent = await createIntent(c1, [line(product, 0, 1)], sel);
    await payIntent(intent.body.paymentIntentId);
    expect(
      (
        await createOrder(
          c2,
          intent.body.paymentIntentId,
          [line(product, 0, 1)],
          sel,
        )
      ).status,
    ).toBe(400);
    // The rightful owner can still complete it.
    expect(
      (
        await createOrder(
          c1,
          intent.body.paymentIntentId,
          [line(product, 0, 1)],
          sel,
        )
      ).status,
    ).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Inventory', () => {
  it('out-of-stock, inactive, pending-vendor and suspended-vendor products cannot be bought', async () => {
    const sel = [
      { vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId },
    ];
    const empty = await createProduct(vendorA, { stockAmount: 0 });
    expect((await createIntent(c1, [line(empty, 0, 1)], sel)).status).toBe(400);
    const tooMany = await createProduct(vendorA, { stockAmount: 1000 });
    expect((await createIntent(c1, [line(tooMany, 1, 2)], sel)).status).toBe(
      400,
    );

    const inactive = await createProduct(vendorA, { isActive: false });
    expect((await createIntent(c1, [line(inactive, 0, 1)], sel)).status).toBe(
      400,
    );

    const pending = await prisma.product.findFirstOrThrow({
      where: { vendor: { storeName: 'Wattle Creek Pastures' } },
      include: { variants: true },
    });
    const pendingShip = await prisma.vendorShippingOption.findFirstOrThrow({
      where: { vendorId: pending.vendorId },
    });
    expect(
      (
        await createIntent(
          c1,
          [line(pending, 0, 1)],
          [{ vendorId: pending.vendorId, shippingOptionId: pendingShip.id }],
        )
      ).status,
    ).toBe(400);

    const productB = await createProduct(vendorB);
    await api('POST', `/admin/vendors/${vendorB.vendorId}/suspend`, {
      token: adminToken,
      body: { reason: 'E2E suspension test' },
    });
    try {
      const listed = await api('GET', '/products');
      expect(listed.body.map((p: any) => p.id)).not.toContain(productB.id);
      expect(
        (
          await createIntent(
            c1,
            [line(productB, 0, 1)],
            [
              {
                vendorId: vendorB.vendorId,
                shippingOptionId: vendorB.flatOptionId,
              },
            ],
          )
        ).status,
      ).toBe(400);
    } finally {
      await api('POST', `/admin/vendors/${vendorB.vendorId}/unsuspend`, {
        token: adminToken,
      });
    }
  });

  it('two customers racing for the last unit: exactly one order, stock never negative, loser refunded', async () => {
    const product = await createProduct(vendorA, { stockAmount: 500 });
    const sel = [
      { vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId },
    ];
    const items = [line(product, 0, 1)];
    const i1 = await createIntent(c1, items, sel);
    const i2 = await createIntent(c2, items, sel);
    expect(i1.status).toBe(201);
    expect(i2.status).toBe(201);
    await Promise.all([
      payIntent(i1.body.paymentIntentId),
      payIntent(i2.body.paymentIntentId),
    ]);

    const [r1, r2] = await Promise.all([
      createOrder(c1, i1.body.paymentIntentId, items, sel),
      createOrder(c2, i2.body.paymentIntentId, items, sel),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 400]);
    expect(await stockOf(product.id)).toBe(0);

    // The losing payment is reconciled by the webhook, which refunds it.
    const loser =
      r1.status === 400 ? i1.body.paymentIntentId : i2.body.paymentIntentId;
    await sendWebhook('payment_intent.succeeded', {
      id: loser,
      object: 'payment_intent',
    });
    const refunds = await stripe.refunds.list({ payment_intent: loser });
    expect(refunds.data.reduce((s, r) => s + r.amount, 0)).toBe(
      i1.body.totalAmountCents,
    );
    expect(
      await prisma.order.findUnique({ where: { stripePaymentId: loser } }),
    ).toBeNull();
    expect(await stockOf(product.id)).toBe(0);
  });

  it('a burst of concurrent orders never oversells: 6 paid checkouts for 2 units -> exactly 2 orders', async () => {
    const product = await createProduct(vendorA, { stockAmount: 1000 });
    const sel = [
      { vendorId: vendorA.vendorId, shippingOptionId: vendorA.flatOptionId },
    ];
    const items = [line(product, 0, 1)];
    const buyers = [c1, c2, c1, c2, c1, c2];
    const intents = [];
    for (const token of buyers) {
      const res = await createIntent(token, items, sel);
      expect(res.status).toBe(201);
      intents.push(res.body.paymentIntentId as string);
    }
    await Promise.all(intents.map((id) => payIntent(id)));

    const results = await Promise.all(
      intents.map((id, i) => createOrder(buyers[i], id, items, sel)),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 400)).toHaveLength(4);
    expect(await stockOf(product.id)).toBe(0);
    expect(
      await prisma.order.count({ where: { stripePaymentId: { in: intents } } }),
    ).toBe(2);

    // Every losing payment is refunded in full by webhook reconciliation.
    const losers = intents.filter((_, i) => results[i].status === 400);
    await Promise.all(
      losers.map((id) =>
        sendWebhook('payment_intent.succeeded', {
          id,
          object: 'payment_intent',
        }),
      ),
    );
    for (const id of losers) {
      const refunds = await stripe.refunds.list({ payment_intent: id });
      expect(refunds.data.reduce((s, r) => s + r.amount, 0)).toBe(
        1000 + vendorA.flatRateCents,
      );
    }
    expect(await stockOf(product.id)).toBe(0);
  });

  it('vendor refund restores stock exactly once, even if requested twice concurrently', async () => {
    // Multi-vendor order: Stripe would happily accept a second partial
    // refund here, so only the application can prevent a double refund.
    // Vendor B's share dominates, so two refunds of A's share fit inside the
    // charge and Stripe would accept both.
    const product = await createProduct(vendorA, { stockAmount: 5000 });
    const other = await createProduct(vendorB, { stockAmount: 10000 });
    const { intent, order } = await purchase(
      c1,
      [line(product, 0, 2), line(product, 1, 1), line(other, 1, 5)],
      [vendorA, vendorB],
    );
    expect(await stockOf(product.id)).toBe(3000);
    const vo = order.vendorOrders.find(
      (o: any) => o.vendorId === vendorA.vendorId,
    );

    const [a, b] = await Promise.all([
      api('POST', `/orders/vendor/orders/${vo.id}/refund`, {
        token: vendorA.token,
      }),
      api('POST', `/orders/vendor/orders/${vo.id}/refund`, {
        token: vendorA.token,
      }),
    ]);
    expect([a.status, b.status].filter((s) => s === 201)).toHaveLength(1);
    expect(await stockOf(product.id)).toBe(5000);

    const refunds = await stripe.refunds.list({
      payment_intent: intent.paymentIntentId,
    });
    expect(refunds.data).toHaveLength(1);
    expect(refunds.data[0].amount).toBe(vo.subtotalCents + vo.shippingCents);

    const after = await prisma.vendorOrder.findUniqueOrThrow({
      where: { id: vo.id },
    });
    expect(after.status).toBe('REFUNDED');
    expect(
      (
        await api('POST', `/orders/vendor/orders/${vo.id}/refund`, {
          token: vendorA.token,
        })
      ).status,
    ).toBe(400);
  });

  it('cancelling a paid order refunds the customer and restores stock', async () => {
    const product = await createProduct(vendorA, { stockAmount: 3000 });
    const { intent, order } = await purchase(
      c1,
      [line(product, 1, 2)],
      [vendorA],
    );
    expect(await stockOf(product.id)).toBe(1000);
    const vo = order.vendorOrders[0];

    const res = await api('PATCH', `/orders/vendor/orders/${vo.id}/status`, {
      token: vendorA.token,
      body: { status: 'CANCELLED' },
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(await stockOf(product.id)).toBe(3000);
    const refunds = await stripe.refunds.list({
      payment_intent: intent.paymentIntentId,
    });
    expect(refunds.data.reduce((s, r) => s + r.amount, 0)).toBe(
      vo.subtotalCents + vo.shippingCents,
    );
    const parent = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(parent.status).toBe('CANCELLED');
  });

  it("only refunds the cancelled vendor's share of a multi-vendor order", async () => {
    const pa = await createProduct(vendorA, { stockAmount: 2000 });
    const pb = await createProduct(vendorB, { stockAmount: 2000 });
    const { intent, order } = await purchase(
      c1,
      [line(pa, 0, 1), line(pb, 0, 1)],
      [vendorA, vendorB],
    );
    const voA = order.vendorOrders.find(
      (vo: any) => vo.vendorId === vendorA.vendorId,
    );
    await api('PATCH', `/orders/vendor/orders/${voA.id}/status`, {
      token: vendorA.token,
      body: { status: 'CANCELLED' },
    });
    const refunds = await stripe.refunds.list({
      payment_intent: intent.paymentIntentId,
    });
    expect(refunds.data.reduce((s, r) => s + r.amount, 0)).toBe(
      voA.subtotalCents + voA.shippingCents,
    );
    expect(await stockOf(pa.id)).toBe(2000);
    expect(await stockOf(pb.id)).toBe(1500);
    const parent = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(parent.status).toBe('PROCESSING');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Order lifecycle (vendor)', () => {
  it('moves forward through PROCESSING -> SHIPPED -> COMPLETED and rolls up the parent order', async () => {
    const product = await createProduct(vendorA);
    const { order } = await purchase(c1, [line(product, 0, 1)], [vendorA]);
    const vo = order.vendorOrders[0];

    const tracked = await api(
      'PATCH',
      `/orders/vendor/orders/${vo.id}/tracking`,
      {
        token: vendorA.token,
        body: {
          trackingNumber: 'AP123456789AU',
          trackingUrl:
            'https://auspost.com.au/mypost/track/#/details/AP123456789AU',
        },
      },
    );
    expect(tracked.status).toBe(200);
    expect(tracked.body.status).toBe('SHIPPED');

    const done = await api('PATCH', `/orders/vendor/orders/${vo.id}/status`, {
      token: vendorA.token,
      body: { status: 'COMPLETED' },
    });
    expect(done.status).toBe(200);
    const customerView = await api('GET', `/orders/my-orders/${order.id}`, {
      token: c1,
    });
    expect(customerView.body.status).toBe('COMPLETED');
    expect(customerView.body.vendorOrders[0].trackingNumber).toBe(
      'AP123456789AU',
    );

    // Completed orders count towards the vendor's payout balance.
    const balance = await api('GET', '/payouts/me/balance', {
      token: vendorA.token,
    });
    expect(balance.body.availableCents).toBeGreaterThanOrEqual(vo.payoutCents);

    // Customer can now review the product.
    const review = await api('POST', '/reviews', {
      token: c1,
      body: { productId: product.id, rating: 5, comment: 'E2E: lovely' },
    });
    expect(review.status).toBe(201);
  });

  it('rejects backwards or terminal-state transitions', async () => {
    const product = await createProduct(vendorA);
    const { order } = await purchase(c1, [line(product, 0, 1)], [vendorA]);
    const vo = order.vendorOrders[0];
    const set = (status: string) =>
      api('PATCH', `/orders/vendor/orders/${vo.id}/status`, {
        token: vendorA.token,
        body: { status },
      });

    expect((await set('PENDING')).status).toBe(400);
    expect((await set('REFUNDED')).status).toBe(400);
    expect((await set('SHIPPED')).status).toBe(200);
    expect((await set('PROCESSING')).status).toBe(400);
    expect((await set('COMPLETED')).status).toBe(200);
    expect((await set('SHIPPED')).status).toBe(400);
    expect((await set('CANCELLED')).status).toBe(400);
  });

  it('a refunded order cannot be revived into the payout balance', async () => {
    const product = await createProduct(vendorA);
    const { order } = await purchase(c1, [line(product, 0, 1)], [vendorA]);
    const vo = order.vendorOrders[0];
    expect(
      (
        await api('POST', `/orders/vendor/orders/${vo.id}/refund`, {
          token: vendorA.token,
        })
      ).status,
    ).toBe(201);

    const before = (
      await api('GET', '/payouts/me/balance', { token: vendorA.token })
    ).body.availableCents;
    expect(
      (
        await api('PATCH', `/orders/vendor/orders/${vo.id}/status`, {
          token: vendorA.token,
          body: { status: 'COMPLETED' },
        })
      ).status,
    ).toBe(400);
    const tracking = await api(
      'PATCH',
      `/orders/vendor/orders/${vo.id}/tracking`,
      { token: vendorA.token, body: { trackingNumber: 'X1' } },
    );
    expect(tracking.status).toBe(400);
    expect(
      (await prisma.vendorOrder.findUniqueOrThrow({ where: { id: vo.id } }))
        .status,
    ).toBe('REFUNDED');
    expect(
      (await api('GET', '/payouts/me/balance', { token: vendorA.token })).body
        .availableCents,
    ).toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Vendor product and profile management', () => {
  it('creates, edits, restocks, re-prices and toggles a product, managing variants and images', async () => {
    const created = await createProduct(vendorA, {
      name: `E2E Managed ${uniq()}`,
    });
    expect(created.slug).toMatch(/^e2e-managed-/);
    expect(created.images).toHaveLength(1);

    const [v500, v1k] = created.variants;
    const edited = await api('PATCH', `/products/${created.id}`, {
      token: vendorA.token,
      body: {
        name: `${created.name} Renamed`,
        stockAmount: 12345,
        variants: [
          {
            id: v500.id,
            label: '500g pack',
            unitAmount: 500,
            priceCents: 1100,
            weightGrams: 520,
          },
          {
            label: '2kg bulk',
            unitAmount: 2000,
            priceCents: 3200,
            weightGrams: 2050,
          },
        ],
        imageUrls: [
          'https://images.pexels.com/photos/4110462/pexels-photo-4110462.jpeg?w=400',
          'https://images.pexels.com/photos/4110466/pexels-photo-4110466.jpeg?w=400',
        ],
      },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.stockAmount).toBe(12345);
    expect(edited.body.slug).toMatch(/renamed$/);
    expect(edited.body.images).toHaveLength(2);
    const labels = edited.body.variants.map((v: any) => v.label).sort();
    expect(labels).toEqual(['2kg bulk', '500g pack']);
    expect(
      edited.body.variants.find((v: any) => v.id === v500.id).priceCents,
    ).toBe(1100);
    expect(
      await prisma.productVariant.findUnique({ where: { id: v1k.id } }),
    ).toBeNull();

    const off = await api('PATCH', `/products/${created.id}`, {
      token: vendorA.token,
      body: { isActive: false },
    });
    expect(off.body.isActive).toBe(false);
    const mine = await api('GET', '/products/vendor/my-products', {
      token: vendorA.token,
    });
    expect(mine.body.map((p: any) => p.id)).toContain(created.id);
  });

  it('vendor can delete an unsold product but not one with order history', async () => {
    const unsold = await createProduct(vendorA);
    expect(
      (await api('DELETE', `/products/${unsold.id}`, { token: vendorA.token }))
        .status,
    ).toBe(200);
    expect(
      await prisma.product.findUnique({ where: { id: unsold.id } }),
    ).toBeNull();

    const sold = await createProduct(vendorA);
    await purchase(c1, [line(sold, 0, 1)], [vendorA]);
    const res = await api('DELETE', `/products/${sold.id}`, {
      token: vendorA.token,
    });
    expect(res.status).toBe(400);
    expect(
      await prisma.product.findUnique({ where: { id: sold.id } }),
    ).not.toBeNull();
  });

  it('a sample vendor can update and restore its profile', async () => {
    const token = await tokenFor('greenvalley@example.com');
    const original = (await api('GET', '/vendors/me', { token })).body;
    const updated = await api('PATCH', '/vendors/me', {
      token,
      body: {
        description: `${original.description} (updated)`,
        phone: '(03) 5550 0199',
        location: 'Coldstream',
      },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.phone).toBe('(03) 5550 0199');
    const restored = await api('PATCH', '/vendors/me', {
      token,
      body: {
        description: original.description,
        phone: original.phone,
        location: original.location,
      },
    });
    expect(restored.body.location).toBe(original.location);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Admin', () => {
  it('views platform statistics, users, orders, payouts and promotions', async () => {
    const stats = await api('GET', '/admin/stats', { token: adminToken });
    expect(stats.status).toBe(200);
    expect(stats.body.vendors.approved).toBeGreaterThanOrEqual(11);
    expect(stats.body.products.total).toBeGreaterThanOrEqual(107);
    for (const path of [
      '/admin/users',
      '/admin/orders',
      '/admin/vendors',
      '/payouts/admin',
      '/promotions/admin',
      '/admin/configuration',
    ]) {
      expect((await api('GET', path, { token: adminToken })).status).toBe(200);
    }
  });

  it('approves and rejects the pending vendor (restoring it to pending)', async () => {
    const pending = await api('GET', '/admin/vendors/pending', {
      token: adminToken,
    });
    const wattle = pending.body.find(
      (v: any) => v.storeName === 'Wattle Creek Pastures',
    );
    expect(wattle).toBeTruthy();
    try {
      expect(
        (
          await api('POST', `/admin/vendors/${wattle.id}/approve`, {
            token: adminToken,
          })
        ).status,
      ).toBe(201);
      expect(
        (await api('GET', '/vendors')).body.map((v: any) => v.id),
      ).toContain(wattle.id);
      expect((await api('GET', `/vendors/${wattle.id}`)).status).toBe(200);
    } finally {
      expect(
        (
          await api('POST', `/admin/vendors/${wattle.id}/reject`, {
            token: adminToken,
          })
        ).status,
      ).toBe(201);
    }
    expect(
      (await api('GET', '/vendors')).body.map((v: any) => v.id),
    ).not.toContain(wattle.id);
  });

  it('manages categories', async () => {
    const slug = `e2e-cat-${uniq()}`;
    const created = await api('POST', '/admin/categories', {
      token: adminToken,
      body: { name: 'E2E Category', slug },
    });
    expect(created.status).toBe(201);
    expect(
      (
        await api('POST', '/admin/categories', {
          token: adminToken,
          body: { name: 'Dup', slug },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await api('POST', '/admin/categories', {
          token: adminToken,
          body: { name: 'Bad', slug: 'Not A Slug' },
        })
      ).status,
    ).toBe(400);
    const renamed = await api('PATCH', `/admin/categories/${created.body.id}`, {
      token: adminToken,
      body: { name: 'E2E Renamed' },
    });
    expect(renamed.body.name).toBe('E2E Renamed');
    expect(
      (
        await api('DELETE', `/admin/categories/${created.body.id}`, {
          token: adminToken,
        })
      ).status,
    ).toBe(200);

    const beef = (await api('GET', '/categories')).body.find(
      (c: any) => c.slug === 'beef',
    );
    expect(
      (
        await api('DELETE', `/admin/categories/${beef.id}`, {
          token: adminToken,
        })
      ).status,
    ).toBe(400);
  });

  it('can refund any vendor order', async () => {
    const product = await createProduct(vendorB, { stockAmount: 1000 });
    const { order } = await purchase(c1, [line(product, 0, 1)], [vendorB]);
    const vo = order.vendorOrders[0];
    const res = await api('POST', `/orders/admin/orders/${vo.id}/refund`, {
      token: adminToken,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('REFUNDED');
    expect(await stockOf(product.id)).toBe(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Promotions', () => {
  it('vendor pays for a featured listing and it is featured for the configured duration', async () => {
    const product = await createProduct(vendorA);
    const intent = await api('POST', '/promotions/intent', {
      token: vendorA.token,
      body: { type: 'FEATURED_PRODUCT', productId: product.id },
    });
    expect(intent.status).toBe(201);
    expect(intent.body.priceCents).toBe(promoPriceCents);

    // Unpaid intents cannot be confirmed.
    expect(
      (
        await api('POST', '/promotions/confirm', {
          token: vendorA.token,
          body: { paymentIntentId: intent.body.paymentIntentId },
        })
      ).status,
    ).toBe(400);

    await payIntent(intent.body.paymentIntentId);
    const [p1, p2] = await Promise.all([
      api('POST', '/promotions/confirm', {
        token: vendorA.token,
        body: { paymentIntentId: intent.body.paymentIntentId },
      }),
      api('POST', '/promotions/confirm', {
        token: vendorA.token,
        body: { paymentIntentId: intent.body.paymentIntentId },
      }),
    ]);
    expect(p1.status).toBe(201);
    expect(p2.body.id).toBe(p1.body.id);
    expect(
      await prisma.promotion.count({
        where: { stripePaymentId: intent.body.paymentIntentId },
      }),
    ).toBe(1);
    expect(p1.body.status).toBe('ACTIVE');
    expect(p1.body.priceCents).toBe(promoPriceCents);

    const config = await api('GET', '/admin/configuration', {
      token: adminToken,
    });
    const days = parseInt(
      config.body.find((c: any) => c.key === 'featured_listing_duration_days')
        ?.value ?? '7',
      10,
    );
    const durationMs =
      new Date(p1.body.endDate).getTime() -
      new Date(p1.body.startDate).getTime();
    expect(durationMs).toBe(days * 86_400_000);

    const featured = await api('GET', '/promotions/featured-products');
    expect(featured.body.map((p: any) => p.id)).toContain(product.id);
    const mine = await api('GET', '/promotions/me', { token: vendorA.token });
    expect(mine.body.map((p: any) => p.id)).toContain(p1.body.id);

    // Another vendor cannot confirm this vendor's payment.
    expect(
      (
        await api('POST', '/promotions/confirm', {
          token: vendorB.token,
          body: { paymentIntentId: intent.body.paymentIntentId },
        })
      ).status,
    ).toBe(400);

    // Expired promotions stop being featured.
    await prisma.promotion.update({
      where: { id: p1.body.id },
      data: { endDate: new Date(Date.now() - 1000) },
    });
    const after = await api('GET', '/promotions/featured-products');
    expect(after.body.map((p: any) => p.id)).not.toContain(product.id);
  });

  it("vendors cannot promote other vendors' products or inactive products", async () => {
    const productB = await createProduct(vendorB);
    expect(
      (
        await api('POST', '/promotions/intent', {
          token: vendorA.token,
          body: { type: 'FEATURED_PRODUCT', productId: productB.id },
        })
      ).status,
    ).toBe(400);
    const inactive = await createProduct(vendorA, { isActive: false });
    expect(
      (
        await api('POST', '/promotions/intent', {
          token: vendorA.token,
          body: { type: 'FEATURED_PRODUCT', productId: inactive.id },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api('POST', '/promotions/intent', {
          token: c1,
          body: { type: 'FEATURED_VENDOR' },
        })
      ).status,
    ).toBe(404);
  });

  it('unapproved vendors cannot buy promotions that would never be shown', async () => {
    const token = await tokenFor(PENDING_VENDOR);
    expect(
      (
        await api('POST', '/promotions/intent', {
          token,
          body: { type: 'FEATURED_VENDOR' },
        })
      ).status,
    ).toBe(400);
  });
});
