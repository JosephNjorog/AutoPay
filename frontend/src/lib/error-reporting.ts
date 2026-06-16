// Generic client-side error reporting hook.
// Swap reportError for your own provider (Sentry, Datadog, etc.) when ready.

export function reportError(
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  if (typeof window === "undefined") return;

  const detail = {
    message: error instanceof Error ? error.message : String(error),
    route: window.location.pathname,
    ...context,
  };

  // Development: surface to console so nothing is silently swallowed.
  if (import.meta.env.DEV) {
    console.error("[autopayke/error]", detail);
  }

  // Production: wire up your real provider here.
  // Example: Sentry.captureException(error, { extra: context });
}
