/**
 * Prisma middleware for tenant isolation validation.
 * Ensures all queries on multi-tenant models include a tenantId filter.
 * Defense-in-depth: catches accidental cross-tenant data leakage at the ORM layer.
 */

/** Models that require tenantId in all queries. */
const MULTI_TENANT_MODELS = new Set([
  'Lead',
  'IntentSignal',
  'DealDiagnostic',
  'TenantSearchQuery',
  'TenantIntentKeyword',
  'TenantScoringConfig',
  'ConversationMessage',
  'OnboardingWorkflow',
  'SystemHealthCheck',
  'KnowledgeBasePattern',
  'CommissionTracker',
  'CommissionLedger',
  'Dispute',
  'Clawback',
  'PreExistingDeal',
  'ServiceProfile',
  'ContentAsset',
  'SEOKeywordTracker',
  'SEOAudit',
  'CROAudit',
  'ABTest',
]);

/** Actions that read or mutate multiple rows and must be tenant-scoped. */
const CHECKED_ACTIONS = new Set([
  'findMany',
  'findFirst',
  'updateMany',
  'deleteMany',
]);

/**
 * Check if a query's args contain a tenantId filter at any level.
 */
function hasTenantId(args: Record<string, unknown> | undefined): boolean {
  if (!args) return false;

  const where = args.where as Record<string, unknown> | undefined;
  if (!where) return false;

  // Direct tenantId in where clause
  if ('tenantId' in where) return true;

  // Composite unique key containing tenantId (e.g., tenantId_crmDealId)
  for (const key of Object.keys(where)) {
    if (key.startsWith('tenantId_')) return true;
    // Check nested objects for tenantId
    const val = where[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && 'tenantId' in (val as Record<string, unknown>)) {
      return true;
    }
  }

  // Check OR conditions
  const orClauses = where.OR as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(orClauses)) {
    return orClauses.every((clause) => 'tenantId' in clause);
  }

  return false;
}

/**
 * Creates the tenant isolation middleware function.
 * In production, throws on violation. In development, logs a warning.
 */
export function tenantIsolationMiddleware() {
  const isProduction = process.env.NODE_ENV === 'production';

  return async (params: {
    model?: string;
    action: string;
    args: Record<string, unknown>;
  }, next: (params: unknown) => Promise<unknown>): Promise<unknown> => {
    const { model, action, args } = params;

    if (model && MULTI_TENANT_MODELS.has(model) && CHECKED_ACTIONS.has(action)) {
      if (!hasTenantId(args)) {
        const message = `Tenant isolation violation: ${model}.${action}() called without tenantId`;
        if (isProduction) {
          throw new Error(message);
        } else {
          console.warn(`[TenantIsolation] ${message}`);
        }
      }
    }

    return next(params);
  };
}
