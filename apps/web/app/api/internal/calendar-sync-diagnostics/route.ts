import process from "node:process";

import { executeCalendarSyncDiagnostic } from "@calcom/trpc/server/routers/viewer/admin/runCalendarSyncDiagnostic.executor";
import { ZRunCalendarSyncDiagnosticSchema } from "@calcom/trpc/server/routers/viewer/admin/runCalendarSyncDiagnostic.schema";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";

/**
 * Internal HTTP entry for calendar sync diagnostics (support / curl).
 * POST JSON body: { "command": "database_ping", "userId"?: number }
 * Auth: Authorization header must match CRON-style keys or Bearer secret.
 * Configure CALENDAR_SYNC_DIAGNOSTICS_SECRET to enable.
 */
async function postHandler(request: NextRequest) {
  const secret = process.env.CALENDAR_SYNC_DIAGNOSTICS_SECRET;
  if (!secret) {
    return NextResponse.json(
      { message: "Calendar sync diagnostics HTTP route is disabled. Set CALENDAR_SYNC_DIAGNOSTICS_SECRET." },
      { status: 503 }
    );
  }

  const apiKey = request.headers.get("authorization") || request.nextUrl.searchParams.get("apiKey");
  if (![secret, `Bearer ${secret}`].includes(`${apiKey}`)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ZRunCalendarSyncDiagnosticSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await executeCalendarSyncDiagnostic(parsed.data);
  return NextResponse.json(result);
}

export const POST = defaultResponderForAppDir(postHandler);
