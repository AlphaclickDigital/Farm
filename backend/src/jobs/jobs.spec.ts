import { UnauthorizedException } from '@nestjs/common';
import { assertCronSecret } from './cron.controller';
import { PromotionExpiryJob } from './promotion-expiry.job';

describe('assertCronSecret', () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it('rejects everything when CRON_SECRET is not configured', () => {
    delete process.env.CRON_SECRET;
    expect(() => assertCronSecret('Bearer ')).toThrow(UnauthorizedException);
    expect(() => assertCronSecret('Bearer undefined')).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a missing or wrong header', () => {
    process.env.CRON_SECRET = 's3cret-value-for-tests';
    expect(() => assertCronSecret(undefined)).toThrow(UnauthorizedException);
    expect(() => assertCronSecret('s3cret-value-for-tests')).toThrow(
      UnauthorizedException,
    );
    expect(() => assertCronSecret('Bearer wrong')).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the bearer token Vercel Cron sends', () => {
    process.env.CRON_SECRET = 's3cret-value-for-tests';
    expect(() =>
      assertCronSecret('Bearer s3cret-value-for-tests'),
    ).not.toThrow();
  });
});

describe('PromotionExpiryJob.run', () => {
  const promo = (id: string) => ({
    id,
    vendorId: `vendor-${id}`,
    type: 'FEATURED_STORE',
    product: null,
    vendor: { storeName: 'Farm' },
  });

  function setup(claimed: Record<string, boolean>) {
    const prisma = {
      promotion: {
        findMany: jest.fn().mockResolvedValue(Object.keys(claimed).map(promo)),
        updateMany: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve({ count: claimed[where.id] ? 1 : 0 }),
        ),
      },
    };
    const notifications = {
      notifyVendor: jest.fn().mockResolvedValue(undefined),
    };
    const activity = { record: jest.fn().mockResolvedValue(undefined) };
    const cache = { invalidateVendor: jest.fn() };
    const job = new PromotionExpiryJob(
      prisma as never,
      notifications as never,
      activity as never,
      cache as never,
    );
    return { job, prisma, notifications, activity };
  }

  it('only notifies for promotions this run flipped', async () => {
    // "b" was already expired by an overlapping run between find and update.
    const { job, notifications, activity } = setup({
      a: true,
      b: false,
      c: true,
    });

    await expect(job.run()).resolves.toBe(2);
    expect(notifications.notifyVendor).toHaveBeenCalledTimes(2);
    expect(notifications.notifyVendor).toHaveBeenCalledWith(
      'vendor-a',
      expect.anything(),
    );
    expect(notifications.notifyVendor).toHaveBeenCalledWith(
      'vendor-c',
      expect.anything(),
    );
    expect(activity.record).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ metadata: { ids: ['a', 'c'] } }),
    );
  });

  it('does nothing when another run already claimed every row', async () => {
    const { job, notifications, activity } = setup({ a: false });

    await expect(job.run()).resolves.toBe(0);
    expect(notifications.notifyVendor).not.toHaveBeenCalled();
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('rethrows failures so the cron invocation is logged as failed', async () => {
    const { job, prisma } = setup({});
    prisma.promotion.findMany.mockRejectedValue(new Error('db down'));
    jest.spyOn(job['logger'], 'error').mockImplementation(() => undefined);

    await expect(job.run()).rejects.toThrow('db down');
  });
});
