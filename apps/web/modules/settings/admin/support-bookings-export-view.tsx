"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { useMemo, useState } from "react";

const DEFAULT_LIMIT = "5000";

export default function SupportBookingsExportView() {
  const { t } = useLocale();
  const [filename, setFilename] = useState("");
  const [bookingUid, setBookingUid] = useState("");
  const [hostUserIdRaw, setHostUserIdRaw] = useState("");
  const [hostUserEmail, setHostUserEmail] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [afterStartDate, setAfterStartDate] = useState("");
  const [beforeEndDate, setBeforeEndDate] = useState("");
  const [limitRaw, setLimitRaw] = useState(DEFAULT_LIMIT);

  const mutation = trpc.viewer.admin.createSupportBookingsCsvExport.useMutation({
    onSuccess: (data) => {
      showToast(`${t("admin_booking_export_ready")}: ${data.rowCount} rows`, "success");
      window.location.assign(
        `/api/admin/support-bookings-export?token=${encodeURIComponent(data.downloadToken)}`
      );
    },
    onError: (error) => {
      showToast(error.message ?? t("unexpected_error_try_again"), "error");
    },
  });

  const hostUserId = useMemo(() => {
    const n = parseInt(hostUserIdRaw.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [hostUserIdRaw]);

  const limit = useMemo(() => {
    const n = parseInt(limitRaw.trim(), 10);
    return Number.isFinite(n) && n >= 1 && n <= 10_000 ? n : undefined;
  }, [limitRaw]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!filename.trim()) {
      showToast(t("admin_booking_export_filename_required"), "error");
      return;
    }
    if (limit === undefined) {
      showToast(t("admin_booking_export_limit_invalid"), "error");
      return;
    }

    const toIsoOrSkip = (v: string) => {
      const trimmed = v.trim();
      if (!trimmed) return undefined;
      const d = new Date(trimmed);
      if (Number.isNaN(d.getTime())) {
        showToast(t("admin_booking_export_invalid_date_filter"), "error");
        return null;
      }
      return d.toISOString();
    };

    const parsedAfter = toIsoOrSkip(afterStartDate);
    const parsedBefore = toIsoOrSkip(beforeEndDate);
    if (parsedAfter === null || parsedBefore === null) return;

    mutation.mutate({
      filename: filename.trim(),
      bookingUid: bookingUid.trim() || undefined,
      hostUserEmail: hostUserEmail.trim() || undefined,
      attendeeEmail: attendeeEmail.trim() || undefined,
      hostUserId,
      afterStartDate: parsedAfter,
      beforeEndDate: parsedBefore,
      limit,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-default border-subtle max-w-3xl rounded-md border p-6">
      <p className="text-subtle mb-6 text-sm">{t("admin_booking_export_description")}</p>

      <div className="space-y-4">
        <TextField
          label={t("admin_booking_export_filename_label")}
          name="downloadFilename"
          required
          value={filename}
          placeholder={t("admin_booking_export_filename_placeholder")}
          onChange={(e) => setFilename(e.target.value)}
        />

        <TextField
          label={t("booking_uid")}
          name="bookingUid"
          value={bookingUid}
          placeholder="abc123"
          onChange={(e) => setBookingUid(e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("admin_booking_export_host_email")}
            name="hostUserEmail"
            type="email"
            value={hostUserEmail}
            placeholder={t("email_placeholder")}
            onChange={(e) => setHostUserEmail(e.target.value)}
          />
          <TextField
            label={t("admin_booking_export_host_user_id")}
            name="hostUserId"
            value={hostUserIdRaw}
            placeholder="12345"
            onChange={(e) => setHostUserIdRaw(e.target.value)}
          />
        </div>

        <TextField
          label={t("admin_booking_export_attendee_email")}
          name="attendeeEmail"
          type="email"
          value={attendeeEmail}
          placeholder={t("email_placeholder")}
          onChange={(e) => setAttendeeEmail(e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("admin_booking_export_after_start")}
            name="afterStartDate"
            type="datetime-local"
            value={afterStartDate}
            onChange={(e) => setAfterStartDate(e.target.value)}
          />
          <TextField
            label={t("admin_booking_export_before_end")}
            name="beforeEndDate"
            type="datetime-local"
            value={beforeEndDate}
            onChange={(e) => setBeforeEndDate(e.target.value)}
          />
        </div>

        <TextField
          label={t("admin_booking_export_row_limit")}
          name="limit"
          value={limitRaw}
          onChange={(e) => setLimitRaw(e.target.value)}
        />
      </div>

      <div className="mt-6">
        <Button type="submit" color="primary" loading={mutation.isPending} StartIcon="download">
          {t("admin_booking_export_generate")}
        </Button>
      </div>
    </form>
  );
}
