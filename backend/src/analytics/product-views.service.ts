import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { localDateKey } from './reporting/date-range';

const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;
const MAX_TRACKED_FINGERPRINTS = 200_000;

/**
 * Counts product page views as one daily aggregate per product.
 *
 * Privacy: nothing identifying is persisted. Deduplication (one view per
 * visitor per product per day) uses a salted SHA-256 of IP + user agent held
 * only in memory; the salt and the set are discarded at the start of every
 * reporting day, so hashes can't be linked across days or reversed later.
 * The trade-off is that a server restart may let a repeat view through.
 */
@Injectable()
export class ProductViewsService {
  private day = '';
  private salt = randomBytes(32);
  private seen = new Set<string>();

  constructor(private prisma: PrismaService) {}

  async record(
    productId: string,
    visitor: { ip?: string; userAgent?: string },
  ) {
    if (!visitor.userAgent || BOT_PATTERN.test(visitor.userAgent))
      return { counted: false };

    const today = localDateKey(new Date());
    if (today !== this.day) {
      this.day = today;
      this.salt = randomBytes(32);
      this.seen.clear();
    }
    if (this.seen.size >= MAX_TRACKED_FINGERPRINTS) this.seen.clear();

    const fingerprint = createHash('sha256')
      .update(this.salt)
      .update(visitor.ip ?? '')
      .update('|')
      .update(visitor.userAgent)
      .update('|')
      .update(productId)
      .digest('base64url');
    if (this.seen.has(fingerprint)) return { counted: false };

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { vendorId: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    this.seen.add(fingerprint);
    await this.prisma.$executeRaw`
      INSERT INTO "ProductViewDaily" (id, "productId", "vendorId", day, views)
      VALUES (${randomUUID()}, ${productId}, ${product.vendorId}, ${today}::date, 1)
      ON CONFLICT ("productId", day) DO UPDATE SET views = "ProductViewDaily".views + 1
    `;
    return { counted: true };
  }
}
