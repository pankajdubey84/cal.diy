/**
 * It stringifies the object which is necessary to ensure that in a logging system(like Axiom) we see the object in context in a single log event
 */
export function safeStringify(obj: unknown) {
  try {
    if (obj instanceof Error) {
      // Errors don't serialize well, so we extract what we want
      // We stringify so that we can log the error message and stack trace in a single log event
      return JSON.stringify(obj.stack ?? obj.message);
    }
    // Avoid crashing on circular references
    return JSON.stringify(obj);
  } catch (e) {
    return obj;
  }
}

/** Structured error fields for support/debug logs (webhooks, sync, etc.). */
export function errorDetailsForLogs(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { raw: safeStringify(error) };
  }
  const details: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  const withExtras = error as Error & {
    providerResponse?: string;
    statusCode?: number;
  };
  if (withExtras.providerResponse !== undefined) {
    details.providerResponse = withExtras.providerResponse;
  }
  if (withExtras.statusCode !== undefined) {
    details.statusCode = withExtras.statusCode;
  }
  if ("cause" in error && error.cause !== undefined) {
    details.cause = errorDetailsForLogs(error.cause);
  }
  return details;
}
