import { z } from "zod";

/** Whitelisted diagnostic identifiers — implemented server-side only (no shell). */
export const calendarSyncDiagnosticCommands = [
  "list_commands",
  "google_api_reachability",
  "microsoft_identity_reachability",
  "dns_calendar_hosts",
  "sync_error_summary",
  "user_selected_calendar_sync",
  "calendar_related_env_presence",
] as const;

export type CalendarSyncDiagnosticCommand = (typeof calendarSyncDiagnosticCommands)[number];

export const ZCalendarSyncDiagnosticsInput = z.object({
  command: z.enum([
    calendarSyncDiagnosticCommands[0],
    ...calendarSyncDiagnosticCommands.slice(1),
  ]),
  /** Required when command is `user_selected_calendar_sync`. */
  userId: z.number().int().positive().optional(),
});

export type TCalendarSyncDiagnosticsInput = z.infer<typeof ZCalendarSyncDiagnosticsInput>;
