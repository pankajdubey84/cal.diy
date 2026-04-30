import { logBlockedSSRFAttempt, validateUrlForSSRF } from "@calcom/lib/ssrfProtection";

import type { TrpcSessionUser } from "../../../types";
import type { TPreviewCalendarFeedSchema } from "./previewCalendarFeed.schema";

type HandlerOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TPreviewCalendarFeedSchema;
};

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_PREVIEW_CHARS = 24_000;
const MAX_REDIRECTS = 5;

function sanitizeUrlForDisplay(urlString: string): string {
  try {
    const u = new URL(urlString);
    return `${u.protocol}//${u.host}${u.pathname}${u.search}`;
  } catch {
    return urlString;
  }
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function readBodyWithLimit(response: Response, limit: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) {
    const ab = await response.arrayBuffer();
    const u8 = new Uint8Array(ab);
    return u8.length > limit ? { bytes: u8.slice(0, limit), truncated: true } : { bytes: u8, truncated: false };
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    const space = limit - received;
    if (value.length <= space) {
      chunks.push(value);
      received += value.length;
    } else {
      chunks.push(value.slice(0, space));
      await reader.cancel();
      return { bytes: concatUint8Arrays(chunks), truncated: true };
    }
  }
  return { bytes: concatUint8Arrays(chunks), truncated: false };
}

async function fetchWithSsrfSafeRedirects(initialUrl: string): Promise<
  | { ok: true; response: Response; finalUrl: string }
  | { ok: false; kind: "ssrf"; message: string }
  | { ok: false; kind: "fetch"; message: string }
  | { ok: false; kind: "redirect_loop"; message: string }
> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validation = await validateUrlForSSRF(currentUrl);
    if (!validation.isValid) {
      logBlockedSSRFAttempt(currentUrl, validation.error ?? "unknown", { context: "previewCalendarFeed" });
      return { ok: false, kind: "ssrf", message: validation.error ?? "URL not allowed" };
    }

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "text/calendar, application/ics, text/plain, */*",
          "User-Agent": "Cal.diy-CalendarFeedPreview/1.0 (support-tool)",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (e) {
      return {
        ok: false,
        kind: "fetch",
        message: e instanceof Error ? e.message : "Request failed",
      };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      void response.body?.cancel();
      if (!location) {
        return { ok: false, kind: "redirect_loop", message: "Redirect response missing Location header" };
      }
      if (hop === MAX_REDIRECTS) {
        return { ok: false, kind: "redirect_loop", message: "Too many redirects" };
      }
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    return { ok: true, response, finalUrl: currentUrl };
  }

  return { ok: false, kind: "redirect_loop", message: "Too many redirects" };
}

const previewCalendarFeedHandler = async ({ input }: HandlerOptions) => {
  const fetched = await fetchWithSsrfSafeRedirects(input.url.trim());

  if (!fetched.ok) {
    if (fetched.kind === "ssrf") {
      return {
        success: false as const,
        ssrfError: fetched.message,
      };
    }
    if (fetched.kind === "redirect_loop") {
      return {
        success: false as const,
        fetchError: fetched.message,
      };
    }
    return {
      success: false as const,
      fetchError: fetched.message,
    };
  }

  const { response, finalUrl } = fetched;

  if (!response.ok) {
    return {
      success: false as const,
      httpStatus: response.status,
      fetchError: `HTTP ${response.status}`,
      fetchedUrl: sanitizeUrlForDisplay(finalUrl),
    };
  }

  const { bytes, truncated: bytesTruncated } = await readBodyWithLimit(response, MAX_BODY_BYTES);
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let preview = decoder.decode(bytes);
  let truncated = bytesTruncated;
  if (preview.length > MAX_PREVIEW_CHARS) {
    preview = preview.slice(0, MAX_PREVIEW_CHARS);
    truncated = true;
  }

  const hasVcalendar = /BEGIN:VCALENDAR/i.test(preview);
  const veventMatches = preview.match(/BEGIN:VEVENT/gi);
  const veventCount = veventMatches?.length ?? 0;

  return {
    success: true as const,
    httpStatus: response.status,
    contentType: response.headers.get("content-type"),
    preview,
    truncated,
    fetchedUrl: sanitizeUrlForDisplay(finalUrl),
    calendarHints: {
      hasVcalendar,
      veventCount,
    },
  };
};

export default previewCalendarFeedHandler;
