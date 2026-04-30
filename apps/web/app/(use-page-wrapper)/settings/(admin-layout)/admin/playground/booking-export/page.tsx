"use client";

import { BookingStatus } from "@calcom/prisma/enums";
import dayjs from "@calcom/dayjs";
import { trpc } from "@calcom/trpc/react";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { Input, Label } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { useMemo, useState } from "react";

function downloadCsvFromBase64(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toIsoOffset(dateTimeLocal: string) {
  const parsed = dayjs(dateTimeLocal);
  return parsed.isValid() ? parsed.toISOString() : "";
}

const BOOKING_STATUSES = Object.values(BookingStatus);

export default function BookingExportPlaygroundPage() {
  const [downloadFilename, setDownloadFilename] = useState("ticket-TICKET-ID-bookings");
  const [bookingUid, setBookingUid] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [hostUserEmail, setHostUserEmail] = useState("");
  const [afterStart, setAfterStart] = useState("");
  const [beforeEnd, setBeforeEnd] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<BookingStatus[]>([]);

  const mutation = trpc.viewer.admin.exportBookingsCsv.useMutation({
    onSuccess: (data) => {
      downloadCsvFromBase64(data.csvBase64, data.downloadFilename);
      showToast(`Download started (${data.rowCount} row${data.rowCount === 1 ? "" : "s"})`, "success");
    },
    onError: (err) => {
      showToast(err.message ?? "Export failed", "error");
    },
  });

  const filtersPayload = useMemo(() => {
    const afterIso = afterStart ? toIsoOffset(afterStart) : undefined;
    const beforeIso = beforeEnd ? toIsoOffset(beforeEnd) : undefined;
    return {
      bookingUid: bookingUid.trim() || undefined,
      attendeeEmail: attendeeEmail.trim() || undefined,
      hostUserEmail: hostUserEmail.trim() || undefined,
      afterStartDate: afterIso || undefined,
      beforeEndDate: beforeIso || undefined,
      bookingStatuses: selectedStatuses.length ? selectedStatuses : undefined,
    };
  }, [
    afterStart,
    attendeeEmail,
    beforeEnd,
    bookingUid,
    hostUserEmail,
    selectedStatuses,
  ]);

  const toggleStatus = (s: BookingStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const handleExport = () => {
    mutation.mutate({
      downloadFilename,
      filters: filtersPayload,
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-emphasis text-2xl font-bold">Booking CSV export</h1>
        <p className="text-default mt-2 text-sm">
          Admin-only export for support. Files are written to a temporary directory on the server, read back,
          then removed before the CSV is sent to your browser. Use the filename field to match a customer
          ticket or Zendesk ID.
        </p>
      </div>

      <Alert severity="warning" title="Sensitive data" message="Exports contain PII. Handle like production customer data." />

      <div className="space-y-4">
        <div>
          <Label htmlFor="export-filename">Download filename</Label>
          <Input
            id="export-filename"
            value={downloadFilename}
            onChange={(e) => setDownloadFilename(e.target.value)}
            placeholder="ticket-12345-bookings"
          />
          <p className="text-subtle mt-1 text-xs">“.csv” is applied automatically if omitted.</p>
        </div>

        <div>
          <Label htmlFor="booking-uid">Booking UID</Label>
          <Input
            id="booking-uid"
            value={bookingUid}
            onChange={(e) => setBookingUid(e.target.value)}
            placeholder="Exact booking uid"
          />
        </div>

        <div>
          <Label htmlFor="attendee-email">Attendee email (contains)</Label>
          <Input
            id="attendee-email"
            type="email"
            value={attendeeEmail}
            onChange={(e) => setAttendeeEmail(e.target.value)}
            placeholder="booker@example.com"
          />
        </div>

        <div>
          <Label htmlFor="host-email">Host user email</Label>
          <Input
            id="host-email"
            type="email"
            value={hostUserEmail}
            onChange={(e) => setHostUserEmail(e.target.value)}
            placeholder="organizer@example.com"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="after-start">Start time from</Label>
            <Input
              id="after-start"
              type="datetime-local"
              value={afterStart}
              onChange={(e) => setAfterStart(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="before-end">Start time to</Label>
            <Input
              id="before-end"
              type="datetime-local"
              value={beforeEnd}
              onChange={(e) => setBeforeEnd(e.target.value)}
            />
          </div>
        </div>

        <div>
          <span className="text-emphasis mb-2 block text-sm font-medium">Booking statuses (optional)</span>
          <div className="flex flex-wrap gap-3">
            {BOOKING_STATUSES.map((s) => (
              <label key={s} className="text-default flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(s)}
                  onChange={() => toggleStatus(s)}
                />
                {s}
              </label>
            ))}
          </div>
        </div>

        <Button loading={mutation.isPending} onClick={handleExport}>
          Export CSV
        </Button>
      </div>
    </div>
  );
}
