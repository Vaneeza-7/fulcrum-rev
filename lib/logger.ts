import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Root logger instance.
 * In production: JSON output for structured log aggregation.
 * In development: Pretty-printed for readability.
 */
export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  ...(isProduction
    ? {}
    : { transport: { target: 'pino/file', options: { destination: 1 } } }),
});

/**
 * Create a child logger with job context.
 * Use for scheduled jobs and background tasks.
 */
export function jobLogger(jobName: string, tenantId?: string) {
  return logger.child({
    jobName,
    ...(tenantId ? { tenantId } : {}),
  });
}

/**
 * Create a child logger with route context.
 * Use for API route handlers.
 */
export function routeLogger(route: string) {
  return logger.child({ route });
}
