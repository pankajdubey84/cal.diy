"use client";

import { useState } from "react";

import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { TextArea } from "@calcom/ui/components/form";

type PreviewResult = RouterOutputs["viewer"]["admin"]["previewExternalCalendarFeed"];

export default function CalendarFeedPreviewPlayground() {
  const [url, setUrl] = useState("");
  const [lastResult, setLastResult] = useState<PreviewResult | null>(null);

  const mutation = trpc.viewer.admin.previewExternalCalendarFeed.useMutation({
    onSuccess: (data) => setLastResult(data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-emphasis text-2xl font-bold">External calendar feed preview</h1>
        <p className="text-default mt-2 max-w-2xl text-sm">
          Fetches the URL from the application server (not the browser). Redirects are not followed. Only
          public HTTP(S) endpoints are allowed—private networks and metadata hosts are blocked. Response
          bodies are truncated for safety.
        </p>
      </div>

      <div className="border-subtle max-w-3xl space-y-3 rounded-lg border p-4">
        <label className="text-emphasis text-sm font-medium" htmlFor="feed-url">
          Feed URL
        </label>
        <TextArea
          id="feed-url"
          name="feedUrl"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          rows={3}
          placeholder="https://example.com/public.ics or webcal://..."
          className="font-mono text-sm"
        />
        <Button
          type="button"
          loading={mutation.isPending}
          onClick={() => {
            setLastResult(null);
            mutation.mutate({ url });
          }}
          disabled={!url.trim()}>
          Fetch preview
        </Button>
        {mutation.error && (
          <p className="text-error text-sm" role="alert">
            {mutation.error.message}
          </p>
        )}
      </div>

      {lastResult && (
        <div className="border-subtle max-w-4xl space-y-2 rounded-lg border p-4">
          {lastResult.ok ? (
            <>
              <p className="text-default text-sm">
                <span className="text-emphasis font-medium">Status:</span> {lastResult.status}
                {lastResult.contentType ? (
                  <>
                    {" "}
                    <span className="text-emphasis font-medium">Content-Type:</span> {lastResult.contentType}
                  </>
                ) : null}
                <>
                  {" "}
                  <span className="text-emphasis font-medium">Bytes read:</span> {lastResult.bytesReceived}
                </>
              </p>
              {lastResult.redirectLocation ? (
                <p className="text-attention text-sm">
                  Redirect not followed. <span className="font-medium">Location:</span>{" "}
                  <span className="break-all font-mono">{lastResult.redirectLocation}</span>
                </p>
              ) : null}
              {lastResult.looksLikeICalendar ? (
                <p className="text-success text-sm">Detected iCalendar data (BEGIN:VCALENDAR).</p>
              ) : null}
              {lastResult.truncated ? (
                <p className="text-subtle text-xs">Preview truncated at size or character limit.</p>
              ) : null}
              <pre className="bg-muted border-subtle max-h-[480px] overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
                {lastResult.preview || "(empty body)"}
              </pre>
            </>
          ) : (
            <p className="text-error text-sm" role="status">
              {lastResult.error}
              {"status" in lastResult && typeof lastResult.status === "number"
                ? ` (HTTP ${lastResult.status})`
                : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
