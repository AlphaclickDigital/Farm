import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { PromotionExpiryJob } from './promotion-expiry.job';

/**
 * Entry points for Vercel Cron (schedules live in backend/vercel.json).
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` on every invocation;
 * without CRON_SECRET configured these routes reject everything.
 */
@Controller('cron')
export class CronController {
  constructor(private promotionExpiry: PromotionExpiryJob) {}

  @Get('promotion-expiry')
  async promotionExpiryRun(@Headers('authorization') authorization?: string) {
    assertCronSecret(authorization);
    const expired = await this.promotionExpiry.run();
    return { expired };
  }
}

export function assertCronSecret(authorization: string | undefined) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorization) throw new UnauthorizedException();
  // Hash both sides so the comparison is constant-time regardless of length.
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))) {
    throw new UnauthorizedException();
  }
}
