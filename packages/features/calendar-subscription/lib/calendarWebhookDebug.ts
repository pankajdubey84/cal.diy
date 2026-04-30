import { redactSensitiveData } from "@calcom/lib/redactSensitiveData";
import { safeStringify } from "@calcom/lib/safeStringify";

const HEADER_KEYS_TO_REDACT = new Set(
  [
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-goog-channel-token",
    "clientstate",
    "proxy-authorization",
  ].map((s) => s.toLowerCase())
);

const MAX_RAW_BODY_LOG_CHARS = 64_000;

export type WebhookRequestDebugContext = {
  webhookRequestId: string;
  requestUrlForLog: string;
  requestMethod: string;
  requestHeaders: Record<string, string>;
  requestBodyForLog: unknown;
  requestBodyRawLength: number;
};

function scrubUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    const sensitiveParams = ["validationToken", "validationtoken", "token", "access_token", "code"];
    for (const key of sensitiveParams) {
      if (u.searchParams.has(key)) {
        u.searchParams.set(key, "[REDACTED]");
      }
    }
    return u.toString();
  } catch {
    return url.slice(0, 512);
  }
}

export function headersToRedactedRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    out[key] = HEADER_KEYS_TO_REDACT.has(lower) ? "[REDACTED]" : value;
  });
  return out;
}

export function buildWebhookBodyForLog(bodyText: string): unknown {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return { empty: true };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return redactSensitiveData(parsed);
  } catch {
    return {
      nonJson: true,
      preview: trimmed.slice(0, MAX_RAW_BODY_LOG_CHARS),
      truncated: trimmed.length > MAX_RAW_BODY_LOG_CHARS,
    };
  }
}

export async function bufferWebhookRequestForLogging(
  webhookRequestId: string,
  request: Request
): Promise<{ replayRequest: Request; debugContext: WebhookRequestDebugContext }> {
  const requestHeaders = headersToRedactedRecord(request.headers);
  let bodyText = "";
  try {
    bodyText = await request.text();
  } catch {
    bodyText = "";
  }

  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
  };
  if (bodyText.length > 0) {
    init.body = bodyText;
  }

  const replayRequest = new Request(request.url, init);

  const debugContext: WebhookRequestDebugContext = {
    webhookRequestId,
    requestUrlForLog: scrubUrlForLog(request.url),
    requestMethod: request.method,
    requestHeaders,
    requestBodyForLog: buildWebhookBodyForLog(bodyText),
    requestBodyRawLength: bodyText.length,
  };

  return { replayRequest, debugContext };
}

type ErrorWithProviderResponse = Error & { providerResponseBody?: string };

export function serializeProviderFetchError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") {
    return { detail: safeStringify(error) };
  }

  const base: Record<string, unknown> = {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
  };

  if (error instanceof Error && error.stack) {
    base.stack = error.stack;
  }

  const withResp = error as ErrorWithProviderResponse;
  if (typeof withResp.providerResponseBody === "string") {
    base.providerResponseBody = withResp.providerResponseBody.slice(0, 16_000);
  }

  const maybeResponse = (error as { response?: { status?: number; statusText?: string; data?: unknown } })
    .response;
  if (maybeResponse && typeof maybeResponse === "object") {
    base.providerHttpStatus = maybeResponse.status;
    base.providerHttpStatusText = maybeResponse.statusText;
    if (maybeResponse.data !== undefined) {
      base.providerResponseData = redactSensitiveData(maybeResponse.data);
    }
  }

  const maybeErrors = (error as { errors?: unknown }).errors;
  if (maybeErrors !== undefined) {
    base.providerErrors = redactSensitiveData(maybeErrors);
  }

  if ("code" in error && typeof (error as { code?: unknown }).code === "string") {
    base.code = (error as { code: string }).code;
  }

  return base;
}

export function serializeErrorForSupportLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return serializeProviderFetchError(error);
  }
  return { detail: safeStringify(redactSensitiveData(error)) };
}

/** Booker / primary attendee email from booking fields available on sync queries. */
export function primaryBookerEmailForLog(booking: {
  responses?: unknown;
  userPrimaryEmail?: string | null;
}): string | null {
  const responses = booking.responses;
  if (responses && typeof responses === "object" && !Array.isArray(responses)) {
    const email = (responses as Record<string, unknown>).email;
    if (typeof email === "string" && email.length > 0) {
      return email;
    }
  }
  return booking.userPrimaryEmail ?? null;
}
