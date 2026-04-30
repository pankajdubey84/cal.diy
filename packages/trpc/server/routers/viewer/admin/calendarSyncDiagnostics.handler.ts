import { promises as dns } from "node:dns";

import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";
import { TRPCError } from "@trpc/server";

import type { TrpcSessionUser } from "../../../types";
import {
  calendarSyncDiagnosticCommands,
  type CalendarSyncDiagnosticCommand,
  type TCalendarSyncDiagnosticsInput,
} from "./calendarSyncDiagnostics.schema";

type HandlerCtx = {
  user: NonNullable<TrpcSessionUser>;
};

type DiagnosticResult = {
  command: CalendarSyncDiagnosticCommand;
  ok: boolean;
  summary: string;
  details: Record<string, unknown>;
  durationMs: number;
};

const COMMAND_HELP: Record<CalendarSyncDiagnosticCommand, string> = {
  list_commands:
    "Returns this catalog. Use other commands for HTTP/DNS checks, DB sync health, or per-user calendar rows.",
  google_api_reachability:
    "GET request to Google Calendar API discovery document (public). Validates outbound HTTPS to Google APIs.",
  microsoft_identity_reachability:
    "GET request to Microsoft OIDC metadata (public). Validates outbound HTTPS to login.microsoftonline.com.",
  dns_calendar_hosts:
    "DNS lookup for common calendar provider hostnames from this server (no shell).",
  sync_error_summary:
    "Aggregates SelectedCalendar rows with sync/watch errors (counts and breakdown by integration).",
  user_selected_calendar_sync:
    "Lists SelectedCalendar sync metadata for one user (tokens and sensitive channel fields omitted). Requires userId.",
  calendar_related_env_presence:
    "Reports whether selected calendar-related env vars are set — never returns secret values.",
};

/** Env keys relevant to calendar integrations; values are never exposed. */
const CALENDAR_ENV_KEYS = [
  "GOOGLE_API_CREDENTIALS",
  "MS_GRAPH_CLIENT_ID",
  "MS_GRAPH_CLIENT_SECRET",
  "MICROSOFT_WEBHOOK_TOKEN",
  "MICROSOFT_WEBHOOK_URL",
  "OUTLOOK_LOGIN_ENABLED",
] as const;

const DNS_CALENDAR_HOSTS = [
  "www.googleapis.com",
  "graph.microsoft.com",
  "login.microsoftonline.com",
  "outlook.office365.com",
] as const;

function maskExternalId(externalId: string): string {
  if (externalId.length <= 8) {
    return `[len:${externalId.length}]`;
  }
  return `${externalId.slice(0, 4)}…${externalId.slice(-4)}[len:${externalId.length}]`;
}

async function fetchReachability(
  label: string,
  url: string
): Promise<{ label: string; url: string; ok: boolean; status?: number; error?: string }> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    return { label, url, ok: response.ok, status: response.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { label, url, ok: false, error: message };
  }
}

async function runDnsCalendarHosts(): Promise<
  { host: string; ok: boolean; addresses?: string[]; error?: string }[]
> {
  const results: { host: string; ok: boolean; addresses?: string[]; error?: string }[] = [];
  for (const host of DNS_CALENDAR_HOSTS) {
    try {
      const addresses = await dns.lookup(host, { all: true });
      results.push({
        host,
        ok: true,
        addresses: addresses.map((a) => a.address),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "lookup failed";
      results.push({ host, ok: false, error: message });
    }
  }
  return results;
}

async function runSyncErrorSummary(): Promise<Record<string, unknown>> {
  const issueWhere = {
    OR: [
      { syncErrorCount: { gt: 0 } },
      { syncErrorAt: { not: null } },
      { syncSubscribedErrorCount: { gt: 0 } },
      { syncSubscribedErrorAt: { not: null } },
      { error: { not: null } },
    ],
  };

  const [selectedCalendarsWithIssues, byIntegration, totalSelected] = await Promise.all([
    prisma.selectedCalendar.count({ where: issueWhere }),
    prisma.selectedCalendar.groupBy({
      by: ["integration"],
      where: issueWhere,
      _count: { id: true },
    }),
    prisma.selectedCalendar.count(),
  ]);

  return {
    totalSelectedCalendars: totalSelected,
    selectedCalendarsWithIssues,
    errorsByIntegration: byIntegration.map((row) => ({
      integration: row.integration,
      rowsWithIssues: row._count.id,
    })),
  };
}

async function runUserSelectedCalendarSync(userId: number): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }

  const rows = await prisma.selectedCalendar.findMany({
    where: { userId },
    select: {
      id: true,
      integration: true,
      externalId: true,
      credentialId: true,
      delegationCredentialId: true,
      syncSubscribedAt: true,
      syncSubscribedErrorAt: true,
      syncSubscribedErrorCount: true,
      syncedAt: true,
      syncErrorAt: true,
      syncErrorCount: true,
      error: true,
      lastErrorAt: true,
      watchAttempts: true,
      unwatchAttempts: true,
      maxAttempts: true,
      channelExpiration: true,
      eventTypeId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return {
    userId: user.id,
    selectedCalendarCount: rows.length,
    calendars: rows.map((row) => ({
      ...row,
      externalId: maskExternalId(row.externalId),
    })),
  };
}

function runCalendarRelatedEnvPresence(): Record<string, unknown> {
  const presence = CALENDAR_ENV_KEYS.map((key) => ({
    key,
    set: Boolean(process.env[key]),
  }));
  return {
    keysChecked: [...CALENDAR_ENV_KEYS],
    presence,
  };
}

async function executeDiagnostic(
  input: TCalendarSyncDiagnosticsInput
): Promise<{ ok: boolean; summary: string; details: Record<string, unknown> }> {
  switch (input.command) {
    case "list_commands": {
      const catalog = calendarSyncDiagnosticCommands.map((cmd) => ({
        command: cmd,
        description: COMMAND_HELP[cmd],
      }));
      return {
        ok: true,
        summary: `${catalog.length} diagnostic commands available.`,
        details: { commands: catalog },
      };
    }
    case "google_api_reachability": {
      const result = await fetchReachability(
        "Google Calendar API discovery",
        "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"
      );
      return {
        ok: result.ok,
        summary: result.ok
          ? `Reachable (HTTP ${result.status}).`
          : `Unreachable or error: ${result.error ?? `HTTP ${result.status}`}`,
        details: { http: result },
      };
    }
    case "microsoft_identity_reachability": {
      const result = await fetchReachability(
        "Microsoft OIDC metadata",
        "https://login.microsoftonline.com/common/.well-known/openid-configuration"
      );
      return {
        ok: result.ok,
        summary: result.ok
          ? `Reachable (HTTP ${result.status}).`
          : `Unreachable or error: ${result.error ?? `HTTP ${result.status}`}`,
        details: { http: result },
      };
    }
    case "dns_calendar_hosts": {
      const lookups = await runDnsCalendarHosts();
      const failed = lookups.filter((l) => !l.ok);
      return {
        ok: failed.length === 0,
        summary:
          failed.length === 0
            ? "All hostnames resolved."
            : `${failed.length} hostname(s) failed DNS lookup.`,
        details: { lookups },
      };
    }
    case "sync_error_summary": {
      const details = await runSyncErrorSummary();
      return {
        ok: true,
        summary: "Aggregation complete.",
        details,
      };
    }
    case "user_selected_calendar_sync": {
      if (input.userId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "userId is required for user_selected_calendar_sync",
        });
      }
      const details = await runUserSelectedCalendarSync(input.userId);
      return {
        ok: true,
        summary: `Loaded ${details.selectedCalendarCount as number} selected calendar row(s).`,
        details,
      };
    }
    case "calendar_related_env_presence": {
      const details = runCalendarRelatedEnvPresence();
      return {
        ok: true,
        summary: "Env presence map generated (values never included).",
        details,
      };
    }
    default: {
      const _exhaustive: never = input.command;
      return _exhaustive;
    }
  }
}

export default async function calendarSyncDiagnosticsHandler({
  ctx,
  input,
}: {
  ctx: HandlerCtx;
  input: TCalendarSyncDiagnosticsInput;
}): Promise<DiagnosticResult> {
  const started = Date.now();
  let result: DiagnosticResult;

  try {
    const executed = await executeDiagnostic(input);
    result = {
      command: input.command,
      ok: executed.ok,
      summary: executed.summary,
      details: executed.details,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    if (err instanceof TRPCError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "Diagnostic failed";
    logger.error("calendarSyncDiagnostics failed", {
      command: input.command,
      adminUserId: ctx.user.id,
      error: message,
    });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Diagnostic failed",
    });
  }

  logger.info("calendarSyncDiagnostics executed", {
    command: input.command,
    adminUserId: ctx.user.id,
    ok: result.ok,
    durationMs: result.durationMs,
  });

  return result;
}
