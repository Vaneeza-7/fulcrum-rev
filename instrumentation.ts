export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Validate environment variables on server startup
    await import('./lib/config');
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = async (...args: unknown[]) => {
  const { captureRequestError } = await import('@sentry/nextjs');
  return (captureRequestError as (...a: unknown[]) => void)(...args);
};
