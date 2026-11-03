import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { attachDatabasePool } from '@vercel/functions';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // App traffic uses DATABASE_URL: on Neon that's the pooled (-pooler) string.
    // Migrations take the direct string instead; see prisma.config.ts.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // On Vercel Fluid compute, keeps the function alive until idle clients are
    // released so connections aren't leaked on suspend. No-op anywhere else.
    attachDatabasePool(pool);
    super({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
