import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

const BOOKING_STATUSES = ["accepted", "cancelled", "rejected", "pending", "awaiting_host"] as const;

export class SupportBookingSearchInput_2024_08_13 {
  @IsOptional()
  @IsString()
  @ApiProperty({
    required: false,
    description: "Partial attendee email match (case-insensitive).",
    example: "jane@",
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  attendeeEmail?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    required: false,
    description: "Partial booking title match (case-insensitive).",
    example: "onboarding",
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  eventTitle?: string;

  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  @ApiProperty({
    required: false,
    enum: BOOKING_STATUSES,
    description: "Booking status filter.",
    example: "accepted",
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  status?: (typeof BOOKING_STATUSES)[number];

  @IsOptional()
  @IsISO8601({ strict: true }, { message: "dateFrom must be a valid ISO 8601 date." })
  @ApiProperty({
    required: false,
    description: "Return bookings with startTime >= dateFrom.",
    example: "2026-04-01T00:00:00.000Z",
  })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: "dateTo must be a valid ISO 8601 date." })
  @ApiProperty({
    required: false,
    description: "Return bookings with startTime <= dateTo.",
    example: "2026-04-30T23:59:59.999Z",
  })
  dateTo?: string;

  @ApiProperty({ required: false, description: "The number of items to return", example: 25, default: 25 })
  @Transform(({ value }: { value: string }) => (value ? parseInt(value, 10) : undefined))
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  take?: number;

  @ApiProperty({ required: false, description: "The number of items to skip", example: 0, default: 0 })
  @Transform(({ value }: { value: string }) => (value ? parseInt(value, 10) : undefined))
  @IsOptional()
  @IsNumber()
  @Min(0)
  skip?: number;
}
