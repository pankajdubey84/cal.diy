import { randomUUID } from "node:crypto";

import { getRedisService } from "@calcom/features/di/containers/Redis";
import { prisma } from "@calcom/prisma";

import type { CalendarSyncDiagnosticCommand } from "./runCalendarSyncDiagnostic.schema";
import { CALENDAR_SYNC_DIAGNOSTIC_COMMAND_HELP } from "./runCalendarSyncDiagnostic.schema";
import type { TRunCalendarSyncDiagnosticSchema } from "./runCalendarSyncDiagnostic.schema";

export type CalendarSyncDiagnosticResult = {
  command: CalendarSyncDiagnosticCommand;
  exitCode: 0 | 1;
  stdout: string;
  data?: Record<string, unknown>;
};

const FEATURE_SLUGS = ["calendar-subscription-cache", "calendar-subscription-sync"] as const;

const OUTBOUND_TARGETS: { name: string; url: string }[] = [
  {
    name: "google_openid_discovery",
    url: "https://accounts.google.com/.well-known/openid-configuration",
  },
  {
    name: "microsoft_openid_discovery",
    url: "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration",
  },
  {
    name: "google_calendar_api_discovery",
    url: "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest",
  },
];

async function fetchWithTimeout(url: string, method: "HEAD" | "GET") {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
      headers:
        method === "GET"
          ? {
              accept: "application/json,*/*",
            }
          : undefined,
    });
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e: unknown) {
    return {
      ok: false,
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : "unknown_error",
    };
  }
}

async function checkOutboundConnectivity() {
  const results = [];
  for (const t of OUTBOUND_TARGETS) {
    let r = await fetchWithTimeout(t.url, "HEAD");
    if (!r.ok && (r.status === undefined || r.status === 405)) {
      r = await fetchWithTimeout(t.url, "GET");
    }
    results.push({ name: t.name, url: t.url, ...r });
  }
  return results;
}

function formatLines(lines: string[]) {
  return lines.join("\n");
}

/** Allowlisted diagnostics only — no shell or arbitrary URLs. */
export async function executeCalendarSyncDiagnostic(
  input: TRunCalendarSyncDiagnosticSchema
): Promise<CalendarSyncDiagnosticResult> {
  const { command, userId } = input;

  try {
    switch (command) {
      case "list_commands": {
        const stdout = formatLines(
          (Object.entries(CALENDAR_SYNC_DIAGNOSTIC_COMMAND_HELP) as [CalendarSyncDiagnosticCommand, string][]).map(
            ([cmd, desc]) => `${cmd}: ${desc}`
          )
        );
        return { command, exitCode: 0, stdout, data: { commands: CALENDAR_SYNC_DIAGNOSTIC_COMMAND_HELP } };
      }

      case "database_ping": {
        const started = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        const ms = Date.now() - started;
        const stdout = `database_ping: OK (${ms}ms)`;
        return { command, exitCode: 0, stdout, data: { ms } };
      }

      case "redis_ping": {
        const hasUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
        if (!hasUpstash) {
          const stdout =
            "redis_ping: skipped (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not both configured)";
          return { command, exitCode: 0, stdout, data: { configured: false, skipped: true } };
        }
        const key = `calendar_sync_diag:${randomUUID()}`;
        const redis = getRedisService();
        const payload = JSON.stringify({ t: Date.now() });
        await redis.set(key, payload, { ttl: 5_000 });
        const readBack = await redis.get<string>(key);
        await redis.del(key);
        const roundTripOk = readBack === payload;
        const stdout = roundTripOk ? "redis_ping: OK (set/get/del)" : "redis_ping: FAILED (payload mismatch)";
        return {
          command,
          exitCode: roundTripOk ? 0 : 1,
          stdout,
          data: { configured: true, roundTripOk },
        };
      }

      case "outbound_connectivity": {
        const connectivity = await checkOutboundConnectivity();
        const allOk = connectivity.every((c) => c.ok);
        const stdout = formatLines(
          connectivity.map((c) => `${c.name}: ${c.ok ? "OK" : "FAIL"}${c.ms != null ? ` (${c.ms}ms)` : ""}${c.error ? ` — ${c.error}` : ""}`)
        );
        return {
          command,
          exitCode: allOk ? 0 : 1,
          stdout,
          data: { endpoints: connectivity },
        };
      }

      case "env_calendar_signals": {
        const signals = {
          DATABASE_URL: Boolean(process.env.DATABASE_URL),
          DATABASE_DIRECT_URL: Boolean(process.env.DATABASE_DIRECT_URL),
          UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
          UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
          GOOGLE_API_CREDENTIALS: Boolean(process.env.GOOGLE_API_CREDENTIALS),
          NEXT_PUBLIC_WEBAPP_URL: Boolean(process.env.NEXT_PUBLIC_WEBAPP_URL),
          CALENDSO_ENCRYPTION_KEY: Boolean(process.env.CALENDSO_ENCRYPTION_KEY),
          CRON_SECRET: Boolean(process.env.CRON_SECRET),
        };
        const stdout = formatLines(Object.entries(signals).map(([k, v]) => `${k}: ${v ? "set" : "unset"}`));
        return { command, exitCode: 0, stdout, data: { signals } };
      }

      case "deployment_calendar_feature_flags": {
        const features = await prisma.feature.findMany({
          where: { slug: { in: [...FEATURE_SLUGS] } },
          select: { slug: true, enabled: true, stale: true, description: true },
          orderBy: { slug: "asc" },
        });
        let userFeatures: { featureId: string; enabled: boolean }[] | undefined;
        if (userId !== undefined) {
          userFeatures = await prisma.userFeatures.findMany({
            where: { userId, featureId: { in: [...FEATURE_SLUGS] } },
            select: { featureId: true, enabled: true },
          });
        }
        const stdout = formatLines([
          ...features.map((f) => `deployment ${f.slug}: enabled=${f.enabled} stale=${f.stale ?? "null"}`),
          ...(userId !== undefined && userFeatures
            ? [
                "--- user overrides ---",
                ...userFeatures.map((u) => `user ${userId} ${u.featureId}: ${u.enabled}`),
              ]
            : []),
        ]);
        return {
          command,
          exitCode: 0,
          stdout,
          data: { deployment: features, userId: userId ?? null, userFeatures: userFeatures ?? null },
        };
      }

      case "user_selected_calendars_snapshot": {
        if (userId === undefined) {
          return {
            command,
            exitCode: 1,
            stdout: "user_selected_calendars_snapshot: missing userId",
          };
        }
        const [userExists, calendarsRaw, credentialCounts] = await Promise.all([
          prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, username: true },
          }),
          prisma.selectedCalendar.findMany({
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
              syncToken: true,
              syncedAt: true,
              syncErrorAt: true,
              syncErrorCount: true,
              error: true,
              lastErrorAt: true,
              channelId: true,
              channelExpiration: true,
              watchAttempts: true,
              eventTypeId: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { integration: "asc" },
          }),
          prisma.credential.groupBy({
            by: ["type"],
            where: { userId },
            _count: { id: true },
          }),
        ]);

        const calendars = calendarsRaw.map(({ syncToken, ...row }) => ({
          ...row,
          syncTokenPresent: Boolean(syncToken),
        }));

        const stdout = formatLines(
          [
            userExists ? `user ${userId} exists (${userExists.email ?? "no email"})` : `user ${userId} NOT FOUND`,
            `selected_calendar_rows: ${calendars.length}`,
            ...calendars.slice(0, 50).map(
              (c) =>
                `${c.integration} ext=${truncate(c.externalId, 48)} cred=${c.credentialId ?? "—"} syncErr=${c.syncErrorCount ?? "—"} subErr=${c.syncSubscribedErrorCount} ch.exp=${c.channelExpiration?.toISOString() ?? "—"}`
            ),
            ...(calendars.length > 50 ? [`... ${calendars.length - 50} more rows not shown ...`] : []),
            "credential_counts_by_type:",
            ...credentialCounts.map((g) => `  ${g.type}: ${g._count.id}`),
          ].filter(Boolean)
        );

        return {
          command,
          exitCode: userExists ? 0 : 1,
          stdout,
          data: {
            user: userExists,
            selectedCalendars: calendars,
            credentialCountsByType: credentialCounts,
          },
        };
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return {
      command,
      exitCode: 1,
      stdout: `${command}: ERROR — ${msg}`,
      data: { error: msg },
    };
  }
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}
