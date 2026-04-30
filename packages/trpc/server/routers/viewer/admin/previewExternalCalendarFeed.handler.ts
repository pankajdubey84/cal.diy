import { logBlockedSSRFAttempt, validatePublicHttpUrlForFetch } from "@calcom/lib/ssrfProtection";

import type { TrpcSessionUser } from "../../../types";
import type { TPreviewExternalCalendarFeedSchema } from "./previewExternalCalendarFeed.schema";

type HandlerOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TPreviewExternalCalendarFeedSchema;
};

const FETCH_TIMEOUT_MS = 15_000;
const BODY_PREVIEW_MAX_BYTES = 512 * 1024;
const PREVIEW_MAX_CHARS = 12_000;

function normalizeCalendarFeedUrlInput(raw: string): string {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("webcal://")) {
    return `http://${trimmed.slice("webcal://".length)}`;
  }
  if (lower.startsWith("ical://")) {
    return `http://${trimmed.slice("ical://".length)}`;
  }
  return trimmed;
}

async function readUtf8ResponsePreview(
  response: Response,
  maxBytes: number,
  maxChars: number
): Promise<{
  preview: string;
  bytesRead: number;
  truncatedByBytes: boolean;
  truncatedByChars: boolean;
}> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { preview: "", bytesRead: 0, truncatedByBytes: false, truncatedByChars: false };
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  let bytesRead = 0;
  let preview = "";
  let truncatedByBytes = false;
  let truncatedByChars = false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      if (preview.length >= maxChars) {
        truncatedByChars = true;
        break;
      }
      if (bytesRead >= maxBytes) {
        truncatedByBytes = true;
        break;
      }

      const { done, value } = await reader.read();
      if (done) {
        preview += decoder.decode();
        if (preview.length > maxChars) {
          preview = preview.slice(0, maxChars);
          truncatedByChars = true;
        }
        break;
      }

      bytesRead += value.byteLength;
      preview += decoder.decode(value, { stream: true });

      if (preview.length > maxChars) {
        preview = preview.slice(0, maxChars);
        truncatedByChars = true;
        await reader.cancel();
        break;
      }

      if (bytesRead >= maxBytes) {
        truncatedByBytes = true;
        preview += decoder.decode();
        if (preview.length > maxChars) {
          preview = preview.slice(0, maxChars);
          truncatedByChars = true;
        }
        await reader.cancel();
        break;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  return { preview, bytesRead, truncatedByBytes, truncatedByChars };
}

const previewExternalCalendarFeedHandler = async ({ ctx, input }: HandlerOptions) => {
  const normalizedUrl = normalizeCalendarFeedUrlInput(input.url);

  const validation = await validatePublicHttpUrlForFetch(normalizedUrl);
  if (!validation.isValid) {
    logBlockedSSRFAttempt(normalizedUrl, validation.error ?? "unknown", {
      source: "previewExternalCalendarFeed",
      adminUserId: ctx.user.id,
    });
    return {
      ok: false as const,
      error: validation.error ?? "URL is not allowed",
    };
  }

  let response: Response;
  try {
    response = await fetch(normalizedUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "text/calendar, text/plain, application/octet-stream, */*",
        "User-Agent": "CalAdmin-CalendarFeedPreview/1.0",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    return {
      ok: false as const,
      error: isTimeout ? "Request timed out" : "Request failed",
    };
  }

  if (response.status >= 300 && response.status < 400) {
    return {
      ok: true as const,
      status: response.status,
      contentType: response.headers.get("content-type"),
      preview: "",
      truncated: false,
      bytesReceived: 0,
      looksLikeICalendar: false,
      redirectLocation: response.headers.get("location"),
    };
  }

  if (!response.ok) {
    return {
      ok: false as const,
      error: `HTTP ${response.status}`,
      status: response.status,
    };
  }

  const { preview, bytesRead, truncatedByBytes, truncatedByChars } = await readUtf8ResponsePreview(
    response,
    BODY_PREVIEW_MAX_BYTES,
    PREVIEW_MAX_CHARS
  );

  return {
    ok: true as const,
    status: response.status,
    contentType: response.headers.get("content-type"),
    preview,
    truncated: truncatedByBytes || truncatedByChars,
    bytesReceived: bytesRead,
    looksLikeICalendar: preview.includes("BEGIN:VCALENDAR"),
    redirectLocation: null,
  };
};

export default previewExternalCalendarFeedHandler;
