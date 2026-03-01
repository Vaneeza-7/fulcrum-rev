import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Set the current tenant context for RLS policies.
 * Must be called before any tenant-scoped query.
 */
export async function setTenantContext(tenantId: string): Promise<void> {
  await prisma.$executeRaw`SET LOCAL app.current_tenant = ${tenantId}`;
}

/**
 * Execute a callback within a tenant-scoped transaction.
 * All queries inside the callback will be filtered by RLS.
 */
export async function withTenant<T>(
  tenantId: string,
  callback: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL app.current_tenant = ${tenantId}`;
    return callback(tx as unknown as PrismaClient);
  });
}

/**
 * Log an action to the audit log.
 */
export async function auditLog(
  tenantId: string | null,
  actionType: string,
  resourceId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId,
      actionType,
      resourceId,
      details: (details ?? {}) as any,
    },
  });
}
