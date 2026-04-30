"use client";

import { trpc } from "@calcom/trpc/react";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { TextField } from "@calcom/ui/components/form";
import { useState } from "react";

export default function CalendarFeedPreviewPlayground() {
  const [url, setUrl] = useState("");
  const previewMutation = trpc.viewer.admin.previewCalendarFeed.useMutation();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    previewMutation.mutate({ url: url.trim() });
  };

  const result = previewMutation.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-emphasis text-2xl font-bold">Calendar feed preview</h1>
        <p className="text-default mt-2 max-w-2xl text-sm">
          Loads the given URL from the server (with SSRF checks), follows redirects safely, and returns HTTP
          metadata plus a truncated body preview. Use this to confirm that a customer&apos;s external calendar
          feed is reachable and looks like valid iCalendar data.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <TextField
          label="Feed URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/calendar.ics"
          required
        />
        <Button type="submit" loading={previewMutation.isPending}>
          Fetch preview
        </Button>
      </form>

      {previewMutation.isError && (
        <Alert severity="error" title="Request failed" message={previewMutation.error.message} />
      )}

      {result && !result.success && result.ssrfError && (
        <Alert severity="warning" title="URL not allowed" message={result.ssrfError} />
      )}

      {result && !result.success && result.fetchError && (
        <Alert
          severity="error"
          title="Fetch error"
          message={
            result.fetchedUrl ? `${result.fetchError} · ${result.fetchedUrl}` : result.fetchError
          }
        />
      )}

      {result?.success && (
        <div className="space-y-4">
          <div className="text-default text-sm">
            <span className="text-emphasis font-medium">HTTP {result.httpStatus}</span>
            {result.contentType ? (
              <>
                {" "}
                · <span className="break-all">{result.contentType}</span>
              </>
            ) : null}
            {result.fetchedUrl ? (
              <>
                {" "}
                · <span className="break-all">{result.fetchedUrl}</span>
              </>
            ) : null}
            {result.truncated ? (
              <span className="text-subtle"> · Preview truncated (size limit)</span>
            ) : null}
          </div>

          <div className="border-subtle bg-muted rounded-md border p-3 text-sm">
            <p className="text-emphasis font-medium">Calendar hints</p>
            <ul className="text-default mt-2 list-inside list-disc space-y-1">
              <li>
                Contains <code className="text-xs">BEGIN:VCALENDAR</code>:{" "}
                {result.calendarHints.hasVcalendar ? "yes" : "no"}
              </li>
              <li>
                <code className="text-xs">BEGIN:VEVENT</code> count (in preview):{" "}
                {result.calendarHints.veventCount}
              </li>
            </ul>
          </div>

          <div>
            <p className="text-emphasis mb-2 text-sm font-medium">Body preview</p>
            <pre className="border-subtle bg-default max-h-[480px] overflow-auto rounded-md border p-4 text-xs whitespace-pre-wrap break-all">
              {result.preview}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
