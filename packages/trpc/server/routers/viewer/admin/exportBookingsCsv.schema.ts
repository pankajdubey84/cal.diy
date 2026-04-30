import { BookingStatus } from "@calcom/prisma/enums";
import { z } from "zod";

const MS_PER_DAY = 86_400_000;
const MAX_DATE_RANGE_DAYS = 366;
const MAX_EXPORT_ROWS = 5_000;

export const ZExportBookingsCsvSchema = z
  .object({
    downloadFilename: z.string().min(1).max(200),
    filters: z.object({
      bookingUid: z.string().trim().min(1).max(128).optional(),
      attendeeEmail: z.string().trim().min(1).max(320).optional(),
      hostUserEmail: z.string().trim().email().max(320).optional(),
      afterStartDate: z.string().datetime({ offset: true }).optional(),
      beforeEndDate: z.string().datetime({ offset: true }).optional(),
      bookingStatuses: z.array(z.nativeEnum(BookingStatus)).max(10).optional(),
    }),
  })
  .superRefine((val, ctx) => {
    const { bookingUid, attendeeEmail, hostUserEmail, afterStartDate, beforeEndDate } = val.filters;
    const hasScopedFilter =
      !!bookingUid?.length ||
      !!attendeeEmail?.length ||
      !!hostUserEmail?.length ||
      (!!afterStartDate && !!beforeEndDate);

    if (!hasScopedFilter) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide at least one filter: booking UID, attendee email, host user email, or both start dates (after/before).",
        path: ["filters"],
      });
    }

    if ((afterStartDate && !beforeEndDate) || (!afterStartDate && beforeEndDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "When filtering by start time, both afterStartDate and beforeEndDate are required.",
        path: ["filters", "afterStartDate"],
      });
    }

    if (afterStartDate && beforeEndDate) {
      const start = new Date(afterStartDate).getTime();
      const end = new Date(beforeEndDate).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "beforeEndDate must be on or after afterStartDate.",
          path: ["filters", "beforeEndDate"],
        });
      } else if (end - start > MAX_DATE_RANGE_DAYS * MS_PER_DAY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days.`,
          path: ["filters", "beforeEndDate"],
        });
      }
    }
  });

export type TExportBookingsCsvSchema = z.infer<typeof ZExportBookingsCsvSchema>;

export const EXPORT_BOOKINGS_CSV_MAX_ROWS = MAX_EXPORT_ROWS;
