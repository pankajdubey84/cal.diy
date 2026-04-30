import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import dayjs from "@calcom/dayjs";
import { objectsToCsv } from "@calcom/lib/csvUtils";
import {
  generateSupportBookingExportToken,
  registerSupportBookingExport,
} from "@calcom/lib/supportBookingExportRegistry";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { TRPCError } from "@trpc/server";

import type { TExportSupportBookingsCsvSchema } from "./exportSupportBookingsCsv.schema";

type Options = {
  input: TExportSupportBookingsCsvSchema;
};

function sanitizeDownloadFilenameBase(raw: string) {
  const trimmed = raw.trim().slice(0, 180);
  const withoutExt = trimmed.replace(/\.csv$/i, "");
  const safe = withoutExt.replace(/[/\\<>:"|?*\x00-\x1f]/g, "_").replace(/\.\./g, "_");
  return safe.length ? safe : "bookings-export";
}

const exportSupportBookingsCsvHandler = async ({ input }: Options) => {
  const and: Prisma.BookingWhereInput[] = [];

  if (input.bookingUid) {
    and.push({ uid: input.bookingUid });
  }

  if (input.hostUserId !== undefined) {
    and.push({ userId: input.hostUserId });
  }

  if (input.hostUserEmail) {
    const host = await prisma.user.findFirst({
      where: { email: { equals: input.hostUserEmail, mode: "insensitive" } },
      select: { id: true },
    });
    if (!host) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No user found with that host email." });
    }
    and.push({ userId: host.id });
  }

  if (input.attendeeEmail) {
    and.push({
      attendees: {
        some: {
          email: { equals: input.attendeeEmail, mode: "insensitive" },
        },
      },
    });
  }

  if (input.afterStartDate) {
    and.push({ startTime: { gte: new Date(input.afterStartDate) } });
  }

  if (input.beforeEndDate) {
    and.push({ endTime: { lte: new Date(input.beforeEndDate) } });
  }

  if (input.statuses?.length) {
    and.push({ status: { in: input.statuses } });
  }

  const where: Prisma.BookingWhereInput = { AND: and };

  const bookings = await prisma.booking.findMany({
    where,
    take: input.limit,
    orderBy: { startTime: "desc" },
    select: {
      uid: true,
      title: true,
      status: true,
      startTime: true,
      endTime: true,
      location: true,
      cancellationReason: true,
      rejectionReason: true,
      userPrimaryEmail: true,
      user: {
        select: {
          email: true,
          name: true,
          id: true,
        },
      },
      attendees: {
        select: {
          email: true,
          name: true,
        },
      },
      eventType: {
        select: {
          title: true,
        },
      },
    },
  });

  const rows = bookings.map((b) => ({
    booking_uid: b.uid,
    title: b.title,
    status: b.status,
    start_time: dayjs(b.startTime).utc().format("YYYY-MM-DD HH:mm:ss UTC"),
    end_time: dayjs(b.endTime).utc().format("YYYY-MM-DD HH:mm:ss UTC"),
    host_user_id: b.user?.id ?? "",
    host_email: b.user?.email ?? b.userPrimaryEmail ?? "",
    host_name: b.user?.name ?? "",
    attendee_emails: b.attendees.map((a) => a.email).join("; "),
    attendee_names: b.attendees.map((a) => a.name).join("; "),
    event_type: b.eventType?.title ?? "",
    location: b.location ?? "",
    cancellation_reason: b.cancellationReason ?? "",
    rejection_reason: b.rejectionReason ?? "",
  }));

  const headerLine =
    "booking_uid,title,status,start_time,end_time,host_user_id,host_email,host_name,attendee_emails,attendee_names,event_type,location,cancellation_reason,rejection_reason";

  const csvCore = rows.length ? objectsToCsv(rows) : `${headerLine}\n`;
  const csv = `\ufeff${csvCore}`;

  const downloadFilename = `${sanitizeDownloadFilenameBase(input.filename)}.csv`;
  const downloadToken = generateSupportBookingExportToken();
  const filePath = join(tmpdir(), `cal-support-bookings-${downloadToken}.csv`);

  await writeFile(filePath, csv, "utf8");
  registerSupportBookingExport(downloadToken, { filePath, downloadFilename });

  return {
    downloadToken,
    downloadFilename,
    rowCount: rows.length,
  };
};

export default exportSupportBookingsCsvHandler;
