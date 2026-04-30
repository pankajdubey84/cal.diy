import { randomUUID } from "crypto";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import dayjs from "@calcom/dayjs";
import { objectsToCsv } from "@calcom/lib/csvUtils";
import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { TRPCError } from "@trpc/server";

import type { TrpcSessionUser } from "../../../types";
import { EXPORT_BOOKINGS_CSV_MAX_ROWS, type TExportBookingsCsvSchema } from "./exportBookingsCsv.schema";

type HandlerOpts = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TExportBookingsCsvSchema;
};

const log = logger.getSubLogger({ prefix: ["admin.exportBookingsCsv"] });

const PAGE_SIZE = 200;

function assertPathInsideParent(parentResolved: string, childResolved: string) {
  const relative = path.relative(parentResolved, childResolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid export path" });
  }
}

/** Client-visible filename only — never used as a filesystem path segment beyond sanitization. */
function sanitizeDownloadFilename(raw: string): string {
  const base = raw.replace(/\\/g, "/").split("/").pop() ?? raw;
  const withoutExt = base.replace(/\.csv$/i, "");
  const cleaned = withoutExt.replace(/[^a-zA-Z0-9._\- ]+/g, "_").trim();
  const truncated = cleaned.slice(0, 180) || "bookings-export";
  return `${truncated}.csv`;
}

function buildWhere(filters: TExportBookingsCsvSchema["filters"]): Prisma.BookingWhereInput {
  const clauses: Prisma.BookingWhereInput[] = [];

  if (filters.bookingUid) {
    clauses.push({ uid: filters.bookingUid });
  }

  if (filters.attendeeEmail) {
    clauses.push({
      attendees: {
        some: {
          email: { contains: filters.attendeeEmail, mode: "insensitive" },
        },
      },
    });
  }

  if (filters.hostUserEmail) {
    clauses.push({
      user: {
        email: filters.hostUserEmail.trim().toLowerCase(),
      },
    });
  }

  if (filters.afterStartDate && filters.beforeEndDate) {
    clauses.push({
      startTime: {
        gte: new Date(filters.afterStartDate),
        lte: new Date(filters.beforeEndDate),
      },
    });
  }

  if (filters.bookingStatuses?.length) {
    clauses.push({ status: { in: filters.bookingStatuses } });
  }

  return clauses.length === 1 ? clauses[0]! : { AND: clauses };
}

export default async function exportBookingsCsvHandler({ ctx, input }: HandlerOpts) {
  const downloadFilename = sanitizeDownloadFilename(input.downloadFilename);
  const where = buildWhere(input.filters);

  const tmpRoot = path.resolve(tmpdir());
  const exportDir = await mkdtemp(path.join(tmpRoot, "cal-booking-export-"));
  const resolvedExportDir = path.resolve(exportDir);
  if (!resolvedExportDir.startsWith(tmpRoot + path.sep)) {
    await rm(exportDir, { recursive: true, force: true }).catch(() => undefined);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Temporary export directory is invalid" });
  }

  const internalName = `${randomUUID()}.csv`;
  const absoluteFilePath = path.join(resolvedExportDir, internalName);
  assertPathInsideParent(resolvedExportDir, path.resolve(absoluteFilePath));

  const rowsForCsv: Record<string, string>[] = [];
  let lastProcessedId: number | undefined;

  try {
    while (rowsForCsv.length < EXPORT_BOOKINGS_CSV_MAX_ROWS) {
      const take = Math.min(PAGE_SIZE, EXPORT_BOOKINGS_CSV_MAX_ROWS - rowsForCsv.length);
      const batch = await prisma.booking.findMany({
        where,
        orderBy: { id: "asc" },
        take,
        ...(lastProcessedId !== undefined ? { cursor: { id: lastProcessedId }, skip: 1 } : {}),
        select: {
          id: true,
          uid: true,
          title: true,
          status: true,
          startTime: true,
          endTime: true,
          location: true,
          createdAt: true,
          userPrimaryEmail: true,
          user: { select: { email: true, name: true } },
          attendees: {
            select: { email: true, name: true },
            orderBy: { id: "asc" },
          },
          eventType: { select: { title: true } },
        },
      });

      if (batch.length === 0) break;

      for (const b of batch) {
        rowsForCsv.push({
          booking_uid: b.uid,
          title: b.title,
          status: b.status,
          start_time: dayjs(b.startTime).utc().format("YYYY-MM-DD HH:mm:ss UTC"),
          end_time: dayjs(b.endTime).utc().format("YYYY-MM-DD HH:mm:ss UTC"),
          created_at: dayjs(b.createdAt).utc().format("YYYY-MM-DD HH:mm:ss UTC"),
          host_email: b.user?.email ?? b.userPrimaryEmail ?? "",
          host_name: b.user?.name ?? "",
          attendee_emails: b.attendees.map((a) => a.email).join("; "),
          attendee_names: b.attendees.map((a) => a.name).join("; "),
          event_type: b.eventType?.title ?? "",
          location: b.location ?? "",
        });
      }

      lastProcessedId = batch[batch.length - 1]!.id;
      if (batch.length < take) break;
    }

    if (rowsForCsv.length === EXPORT_BOOKINGS_CSV_MAX_ROWS && lastProcessedId !== undefined) {
      const nextRow = await prisma.booking.findMany({
        where,
        orderBy: { id: "asc" },
        take: 1,
        cursor: { id: lastProcessedId },
        skip: 1,
        select: { id: true },
      });

      if (nextRow.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Export exceeds ${EXPORT_BOOKINGS_CSV_MAX_ROWS} rows. Narrow filters and try again.`,
        });
      }
    }

    const csvBody =
      rowsForCsv.length === 0
        ? [
            "booking_uid,title,status,start_time,end_time,created_at,host_email,host_name,attendee_emails,attendee_names,event_type,location",
          ].join("\n")
        : objectsToCsv(rowsForCsv);
    await writeFile(absoluteFilePath, csvBody, "utf8");

    const fileBuffer = await readFile(absoluteFilePath);
    const csvBase64 = fileBuffer.toString("base64");

    log.info("Admin booking CSV export completed", {
      action: "admin_booking_export",
      adminUserId: ctx.user.id,
      rowCount: rowsForCsv.length,
      hasBookingUidFilter: Boolean(input.filters.bookingUid),
      hasAttendeeEmailFilter: Boolean(input.filters.attendeeEmail),
      hasHostEmailFilter: Boolean(input.filters.hostUserEmail),
      hasDateRangeFilter: Boolean(input.filters.afterStartDate && input.filters.beforeEndDate),
    });

    return {
      csvBase64,
      downloadFilename,
      rowCount: rowsForCsv.length,
    };
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    log.error("Admin booking CSV export failed", err);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not generate booking export",
      cause: err,
    });
  } finally {
    await rm(resolvedExportDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
