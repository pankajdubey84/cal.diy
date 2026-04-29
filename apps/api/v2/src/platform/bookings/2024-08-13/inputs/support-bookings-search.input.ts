import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export const SupportBookingStatuses = [
  "cancelled",
  "accepted",
  "rejected",
  "pending",
  "awaiting_host",
] as const;

export class SupportBookingsSearchInput_2024_08_13 {
  @ApiPropertyOptional({
    description: "Filter by attendee email (partial match).",
    example: "customer@example.com",
  })
  @IsOptional()
  @IsString()
  attendeeEmail?: string;

  @ApiPropertyOptional({
    description: "Filter by event title (partial match).",
    example: "Discovery Call",
  })
  @IsOptional()
  @IsString()
  eventTitle?: string;

  @ApiPropertyOptional({
    description: "Filter by booking status.",
    enum: SupportBookingStatuses,
    example: "accepted",
  })
  @IsOptional()
  @IsIn(SupportBookingStatuses)
  status?: (typeof SupportBookingStatuses)[number];

  @ApiPropertyOptional({
    description: "Filter bookings with start time on or after this ISO datetime.",
    example: "2026-04-01T00:00:00.000Z",
  })
  @IsOptional()
  @IsString()
  startDateFrom?: string;

  @ApiPropertyOptional({
    description: "Filter bookings with start time on or before this ISO datetime.",
    example: "2026-04-30T23:59:59.999Z",
  })
  @IsOptional()
  @IsString()
  startDateTo?: string;

  @ApiPropertyOptional({
    description: "Number of records to skip.",
    example: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({
    description: "Number of records to return.",
    example: 50,
    default: 50,
    maximum: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
