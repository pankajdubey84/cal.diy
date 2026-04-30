import { readFile, unlink } from "node:fs/promises";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { consumeSupportBookingExport } from "@calcom/lib/supportBookingExportRegistry";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";

function isPlatformAdminSession(user: { role?: string | null; impersonatedBy?: { role?: string | null } }) {
  return (
    user.role === UserPermissionRole.ADMIN || user.impersonatedBy?.role === UserPermissionRole.ADMIN
  );
}

async function getHandler(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) {
    return NextResponse.json({ message: "Missing token" }, { status: 400 });
  }

  const legacyReq = buildLegacyRequest(await headers(), await cookies());
  const session = await getServerSession({ req: legacyReq });
  if (!session?.user || !isPlatformAdminSession(session.user)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const consumed = await consumeSupportBookingExport(token);
  if (!consumed) {
    return NextResponse.json({ message: "Export not found or expired" }, { status: 404 });
  }

  const { filePath, downloadFilename } = consumed;

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${downloadFilename.replace(/"/g, "")}"`,
      },
    });
  } finally {
    await unlink(filePath).catch(() => {});
  }
}

export const GET = defaultResponderForAppDir(
  async (req: NextRequest) => getHandler(req) as Promise<NextResponse>,
  "/api/admin/support-bookings-export"
);
