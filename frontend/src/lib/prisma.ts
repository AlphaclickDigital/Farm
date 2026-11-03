import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { attachDatabasePool } from "@vercel/functions"
import { Pool } from "pg"

const prismaClientSingleton = () => {
  // DATABASE_URL is Neon's pooled (-pooler) string in deployed environments.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  // On Vercel Fluid compute, keeps the function alive until idle clients are
  // released so connections aren't leaked on suspend. No-op anywhere else.
  attachDatabasePool(pool)
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma
