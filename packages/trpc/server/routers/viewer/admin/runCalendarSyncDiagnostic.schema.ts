import { z } from "zod";

export const CALENDAR_SYNC_DIAGNOSTIC_COMMANDS = [
  "list_commands",
  "database_ping",
  "redis_ping",
  "outbound_connectivity",
  "env_calendar_signals",
  "deployment_calendar_feature_flags",
  "user_selected_calendars_snapshot",
] as const;

export type CalendarSyncDiagnosticCommand = (typeof CALENDAR_SYNC_DIAGNOSTIC_COMMANDS)[number];

export const ZRunCalendarSyncDiagnosticSchema = z
  .object({
    command: z.enum(CALENDAR_SYNC_DIAGNOSTIC_COMMANDS),
    userId: z.number().int().positive().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.command === "user_selected_calendars_snapshot" && val.userId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "userId is required for user_selected_calendars_snapshot",
        path: ["userId"],
      });
    }
  });

export type TRunCalendarSyncDiagnosticSchema = z.infer<typeof ZRunCalendarSyncDiagnosticSchema>;

export const CALENDAR_SYNC_DIAGNOSTIC_COMMAND_HELP: Record<CalendarSyncDiagnosticCommand, string> = {
  list_commands: "List diagnostic commands with short descriptions (no server checks).",
  database_ping:
    "Run a lightweight DB round-trip (SELECT 1) via Prisma. Use when sync jobs fail silently or Prisma errors appear in logs.",
  redis_ping:
    "Exercise Upstash REST Redis with a short-lived diagnostic key when configured. Use when slot cache / rate limits behave oddly.",
  outbound_connectivity:
    "Fetch allowlisted HTTPS endpoints used by OAuth and Google Calendar APIs. Use when token refresh or API calls timeout.",
  env_calendar_signals:
    "Reports whether core env vars relevant to calendars are set (booleans only, no secrets).",
  deployment_calendar_feature_flags:
    "Reads deployment feature rows for calendar-subscription-cache and calendar-subscription-sync; optional userId includes per-user overrides.",
  user_selected_calendars_snapshot:
    "Returns SelectedCalendar sync/subscription metadata for userId (no credential payloads). Requires userId.",
};
