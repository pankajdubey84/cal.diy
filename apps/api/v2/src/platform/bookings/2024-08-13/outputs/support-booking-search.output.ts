import { ERROR_STATUS, SUCCESS_STATUS } from "@calcom/platform-constants";
import { PaginationMetaDto } from "@calcom/platform-types";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsString, ValidateNested } from "class-validator";

export class SupportBookingSearchResult_2024_08_13 {
  @ApiProperty({ example: "Bkx8QnY2YJfWJx5k1pT7cR" })
  @IsString()
  uid!: string;

  @ApiProperty({ example: "Intro Call" })
  @IsString()
  title!: string;

  @ApiProperty({ example: "accepted" })
  @IsString()
  status!: string;

  @ApiProperty({ example: "2026-04-18T10:00:00.000Z" })
  @IsDateString()
  startTime!: string;

  @ApiProperty({ example: "2026-04-18T10:30:00.000Z" })
  @IsDateString()
  endTime!: string;

  @ApiProperty({ required: false, example: "attendee@example.com", nullable: true })
  attendeeEmail!: string | null;
}

export class SupportBookingSearchOutput_2024_08_13 {
  @ApiProperty({ example: SUCCESS_STATUS, enum: [SUCCESS_STATUS, ERROR_STATUS] })
  @IsEnum([SUCCESS_STATUS, ERROR_STATUS])
  status!: typeof SUCCESS_STATUS | typeof ERROR_STATUS;

  @ApiProperty({
    type: [SupportBookingSearchResult_2024_08_13],
    description: "Paginated list of bookings matching support search filters.",
  })
  @Type(() => SupportBookingSearchResult_2024_08_13)
  @ValidateNested({ each: true })
  data!: SupportBookingSearchResult_2024_08_13[];

  @ApiProperty({ type: () => PaginationMetaDto })
  @Type(() => PaginationMetaDto)
  @ValidateNested()
  pagination!: PaginationMetaDto;
}
