import { bookingWithUserAndEventDetailsSelect } from "@calcom/platform-libraries/bookings";
import type { Prisma } from "@calcom/prisma/client";
import type { BookingStatus } from "@calcom/prisma/client";
import { Injectable } from "@nestjs/common";
import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { PrismaWriteService } from "@/modules/prisma/prisma-write.service";

type SupportBookingsSearchFilters = {
  attendeeEmail?: string;
  eventTitle?: string;
  status?: BookingStatus;
  startDateFrom?: Date;
  startDateTo?: Date;
  skip: number;
  take: number;
  userId: number;
  orgId?: number;
};

@Injectable()
export class BookingsRepository_2024_08_13 {
  constructor(
    private readonly dbRead: PrismaReadService,
    private readonly dbWrite: PrismaWriteService
  ) {}

  async getById(id: number) {
    return this.dbRead.prisma.booking.findUnique({
      where: {
        id,
      },
    });
  }

  async getByIdsWithAttendeesAndUserAndEvent(ids: number[]) {
    return this.dbRead.prisma.booking.findMany({
      where: {
        id: {
          in: ids,
        },
      },
      include: {
        attendees: true,
        user: true,
        eventType: true,
      },
    });
  }

  async getByIdsWithAttendeesWithBookingSeatAndUserAndEvent(ids: number[]) {
    return this.dbRead.prisma.booking.findMany({
      where: {
        id: {
          in: ids,
        },
      },
      include: {
        attendees: {
          include: {
            bookingSeat: true,
          },
        },
        user: true,
        eventType: true,
      },
    });
  }

  async getByUidWithUserIdAndSeatsReferencesCount(bookingUid: string) {
    return this.dbRead.prisma.booking.findUnique({
      where: {
        uid: bookingUid,
      },
      select: {
        userId: true,
        seatsReferences: {
          take: 1,
        },
      },
    });
  }

  async getByUid(bookingUid: string) {
    return this.dbRead.prisma.booking.findUnique({
      where: {
        uid: bookingUid,
      },
    });
  }

  async getByUidWithAttendees(uid: string) {
    return this.dbRead.prisma.booking.findUnique({
      where: {
        uid,
      },
      select: {
        id: true,
        attendees: {
          select: {
            id: true,
            name: true,
            email: true,
            timeZone: true,
          },
        },
      },
    });
  }

  async getByUidWithEventType(bookingUid: string) {
    return this.dbRead.prisma.booking.findUnique({
      where: {
        uid: bookingUid,
      },
      include: {
        eventType: true,
      },
    });
  }

  async getByUidWithUser(bookingUid: string) {
    return this.dbRead.prisma.booking.findUnique({
      where: {
        uid: bookingUid,
      },
      include: {
        user: true,
      },
    });
  }

  async getByIdWithAttendeesAndUserAndEvent(id: number) {
    return this.dbRead.prisma.booking.findUnique({
      where: {
        id,
      },
      include: {
        attendees: true,
        user: true,
        eventType: true,
      },
    });
  }

  async getByIdWithAttendeesWithBookingSeatAndUserAndEvent(id: number) {
    return this.dbRead.prisma.booking.findUnique({
      where: {
        id,
      },
      include: {
        attendees: {
          include: {
            bookingSeat: true,
          },
        },
        user: true,
        eventType: true,
      },
    });
  }

  async getByUidWithAttendeesAndUserAndEvent(uid: string) {
    const booking = await this.dbRead.prisma.booking.findUnique({
      where: {
        uid,
      },
      include: {
        attendees: true,
        user: true,
        eventType: true,
      },
    });
    if (!booking) {
      return null;
    }

    return {
      ...booking,
      responses: booking.responses as Prisma.JsonObject,
      metadata: booking.metadata as Prisma.JsonObject | null,
    };
  }

  async getByUidWithAttendeesWithBookingSeatAndUserAndEvent(uid: string) {
    return this.dbRead.prisma.booking.findUnique({
      where: {
        uid,
      },
      include: {
        attendees: {
          include: {
            bookingSeat: true,
          },
        },
        user: true,
        eventType: true,
      },
    });
  }

  async getBookingByUidWithUserAndEventDetails(uid: string) {
    return this.dbRead.prisma.booking.findUnique({
      where: { uid },
      select: bookingWithUserAndEventDetailsSelect,
    });
  }

  async getBookingByIdWithUserAndEventDetails(id: number) {
    return this.dbRead.prisma.booking.findUnique({
      where: { id },
      select: bookingWithUserAndEventDetailsSelect,
    });
  }

  async getRecurringByUid(uid: string) {
    return this.dbRead.prisma.booking.findMany({
      where: {
        recurringEventId: uid,
      },
    });
  }

  async getRecurringByUidWithAttendeesAndUserAndEvent(uid: string) {
    return this.dbRead.prisma.booking.findMany({
      where: {
        recurringEventId: uid,
      },
      include: {
        attendees: true,
        user: true,
        eventType: true,
      },
    });
  }

  async getByFromReschedule(fromReschedule: string) {
    return this.dbRead.prisma.booking.findFirst({
      where: {
        fromReschedule,
      },
      include: {
        attendees: true,
        user: true,
      },
    });
  }

  async getByUidWithBookingReference(uid: string) {
    return this.dbRead.prisma.booking.findUnique({
      where: {
        uid,
      },
      select: {
        references: true,
      },
    });
  }

  async updateBooking(bookingUid: string, body: Prisma.BookingUpdateInput) {
    return this.dbWrite.prisma.booking.update({
      where: {
        uid: bookingUid,
      },
      data: body,
      select: { uid: true },
    });
  }

  async supportSearchBookingIds(filters: SupportBookingsSearchFilters) {
    const whereClauses: string[] = [];
    const params: unknown[] = [];

    const pushParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (filters.orgId) {
      const userIdParam = pushParam(filters.userId);
      const orgIdParam = pushParam(filters.orgId);
      whereClauses.push(
        `(b."userId" = ${userIdParam} OR b."userId" IN (SELECT p."userId" FROM "Profile" p WHERE p."organizationId" = ${orgIdParam}))`
      );
    } else {
      const userIdParam = pushParam(filters.userId);
      whereClauses.push(`b."userId" = ${userIdParam}`);
    }

    if (filters.attendeeEmail) {
      const attendeeEmailParam = pushParam(`%${filters.attendeeEmail}%`);
      whereClauses.push(`a."email" ILIKE ${attendeeEmailParam}`);
    }

    if (filters.eventTitle) {
      const eventTitleParam = pushParam(`%${filters.eventTitle}%`);
      whereClauses.push(`b."title" ILIKE ${eventTitleParam}`);
    }

    if (filters.status) {
      const statusParam = pushParam(filters.status);
      whereClauses.push(`b."status" = ${statusParam}::"BookingStatus"`);
    }

    if (filters.startDateFrom) {
      const startDateFromParam = pushParam(filters.startDateFrom);
      whereClauses.push(`b."startTime" >= ${startDateFromParam}::timestamptz`);
    }

    if (filters.startDateTo) {
      const startDateToParam = pushParam(filters.startDateTo);
      whereClauses.push(`b."startTime" <= ${startDateToParam}::timestamptz`);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const fromSql = `
      FROM "Booking" b
      LEFT JOIN "Attendee" a ON a."bookingId" = b."id"
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT b."id")::int AS "totalCount"
      ${fromSql}
      ${whereSql}
    `;

    const countResult = await this.dbRead.prisma.$queryRawUnsafe<{ totalCount: number }[]>(
      countQuery,
      ...params
    );

    const skipParam = pushParam(filters.skip);
    const takeParam = pushParam(filters.take);

    const idsQuery = `
      SELECT DISTINCT b."id" AS "id", b."startTime"
      ${fromSql}
      ${whereSql}
      ORDER BY b."startTime" DESC
      OFFSET ${skipParam}
      LIMIT ${takeParam}
    `;

    const bookingIds = await this.dbRead.prisma.$queryRawUnsafe<{ id: number }[]>(idsQuery, ...params);

    return {
      bookingIds: bookingIds.map((booking) => booking.id),
      totalCount: countResult[0]?.totalCount ?? 0,
    };
  }
}
