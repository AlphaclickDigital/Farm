/**
 * Service-level concurrency test for order creation against the real
 * database. Stripe's PaymentIntent lookup is stubbed to return instantly so
 * that many order transactions genuinely overlap — over HTTP, Stripe's own
 * latency spreads requests out and hides read-then-write stock races.
 *
 * Requires the fixture vendor created by marketplace.e2e-spec.ts.
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentService } from '../src/payment/payment.service';
import { ShippingCalculatorService } from '../src/vendors/shipping-calculator.service';
import { EmailService } from '../src/email/email.service';
import { MarketplaceEventsService } from '../src/notifications/marketplace-events.service';

jest.setTimeout(120_000);

const CONCURRENT_ORDERS = 8;
const UNITS_IN_STOCK = 2;
const UNIT_GRAMS = 500;
const PRICE_CENTS = 1000;

const ADDRESS = {
  name: 'Sam Sample',
  address: '1 Example Street',
  city: 'Ballarat',
  state: 'VIC',
  zip: '3350',
  phone: '0491 570 156',
};

describe('Order creation under concurrency', () => {
  const prisma = new PrismaService();
  const paymentIntentIds = Array.from(
    { length: CONCURRENT_ORDERS },
    (_, i) => `pi_e2e_concurrency_${Date.now()}_${i}`,
  );
  let productId: string;

  afterAll(async () => {
    // These orders reference fake PaymentIntent ids, so remove them entirely.
    const orders = await prisma.order.findMany({
      where: { stripePaymentId: { in: paymentIntentIds } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    await prisma.orderItem.deleteMany({
      where: { vendorOrder: { orderId: { in: orderIds } } },
    });
    await prisma.vendorOrder.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.pendingOrder.deleteMany({
      where: { paymentIntentId: { in: paymentIntentIds } },
    });
    if (productId) {
      await prisma.productVariant.deleteMany({ where: { productId } });
      await prisma.product.delete({ where: { id: productId } });
    }
    await prisma.$disconnect();
  });

  it(`${CONCURRENT_ORDERS} simultaneous paid orders for ${UNITS_IN_STOCK} units create exactly ${UNITS_IN_STOCK} orders and never oversell`, async () => {
    const customer = await prisma.user.findUniqueOrThrow({
      where: { email: 'sample.customer1@example.com' },
    });
    const vendor = await prisma.vendor.findFirstOrThrow({
      where: { user: { email: 'e2e.vendor.a@example.com' } },
    });
    const shipping = await prisma.vendorShippingOption.findFirstOrThrow({
      where: { vendorId: vendor.id, name: 'E2E Flat Rate', isActive: true },
    });
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: 'farm-produce' },
    });

    const product = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: category.id,
        name: `E2E Concurrency ${Date.now()}`,
        slug: `e2e-concurrency-${Date.now()}`,
        baseUnit: 'gram',
        stockAmount: UNITS_IN_STOCK * UNIT_GRAMS,
        variants: {
          create: [
            {
              label: '500g',
              unitAmount: UNIT_GRAMS,
              priceCents: PRICE_CENTS,
              weightGrams: UNIT_GRAMS,
            },
          ],
        },
      },
      include: { variants: true },
    });
    productId = product.id;

    const items = [
      {
        productId,
        variantId: product.variants[0].id,
        quantity: 1,
        priceCents: PRICE_CENTS,
      },
    ];
    const shippingSelections = [
      { vendorId: vendor.id, shippingOptionId: shipping.id },
    ];
    const shippingCents = shipping.flatRateCents ?? 0;

    // Checkout records as create-intent would have persisted them.
    await prisma.pendingOrder.createMany({
      data: paymentIntentIds.map((paymentIntentId) => ({
        paymentIntentId,
        userId: customer.id,
        payload: {
          items,
          shippingSelections,
          shippingAddress: ADDRESS,
          vendorShipping: {
            [vendor.id]: {
              cents: shippingCents,
              method: shipping.name,
              optionId: shipping.id,
            },
          },
        },
      })),
    });

    const emailStub = {
      sendOrderConfirmation: async () => undefined,
      sendVendorNewOrder: async () => undefined,
    };
    const eventsStub = {
      orderCreated: async () => undefined,
      reconciliationFailed: async () => undefined,
    };
    const service = new PaymentService(
      prisma,
      new ConfigService(),
      new ShippingCalculatorService(prisma),
      emailStub as unknown as EmailService,
      eventsStub as unknown as MarketplaceEventsService,
    );
    (service as any).stripe = {
      paymentIntents: {
        retrieve: async (id: string) => ({
          id,
          status: 'succeeded',
          amount: PRICE_CENTS + shippingCents,
          metadata: { userId: customer.id },
        }),
      },
    };

    // Extra args keep this test runnable against the pre-fix signature too.
    const results = await Promise.allSettled(
      paymentIntentIds.map((id) =>
        (service as any).createOrderFromPayment(
          customer.id,
          id,
          items,
          shippingSelections,
          ADDRESS,
        ),
      ),
    );

    const stock = (
      await prisma.product.findUniqueOrThrow({ where: { id: productId } })
    ).stockAmount;
    const orderCount = await prisma.order.count({
      where: { stripePaymentId: { in: paymentIntentIds } },
    });

    expect(stock).toBeGreaterThanOrEqual(0);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(
      UNITS_IN_STOCK,
    );
    expect(orderCount).toBe(UNITS_IN_STOCK);
    expect(stock).toBe(0);
  });
});
