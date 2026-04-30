import { BookingStatus } from "@calcom/prisma/enums";
import { z } from "zod";

export const ZExportSupportBookingsCsvSchema = z
  .object({
    /** Filename for the support agent / ticket reference (`.csv` added if missing). */
    filename: z.string().min(1).max(200),
    bookingUid: z.string().trim().min(1).optional(),
    hostUserId: z.number().int().positive().optional(),
    hostUserEmail: z.string().trim().email().optional(),
    attendeeEmail: z.string().trim().email().optional(),
    afterStartDate: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Invalid start date filter" }),
    beforeEndDate: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Invalid end date filter" }),
    statuses: z.array(z.nativeEnum(BookingStatus)).optional(),
    limit: z.number().int().min(1).max(10_000).default(5000),
  })
  .refine(
    (data) =>
      Boolean(
        data.bookingUid ||
          data.hostUserId !== undefined ||
          data.hostUserEmail ||
          data.attendeeEmail
      ),
    { message: "Provide at least one of booking UID, host user id, host email, or attendee email." }
  );

export type TExportSupportBookingsCsvSchema = z.infer<typeof ZExportSupportBookingsCsvSchema>;
