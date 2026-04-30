import { randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";

const TTL_MS = 15 * 60 * 1000;

type ExportEntry = {
  filePath: string;
  downloadFilename: string;
  createdAt: number;
};

const exportsByToken = new Map<string, ExportEntry>();

function pruneExpired() {
  const now = Date.now();
  for (const [token, entry] of exportsByToken.entries()) {
    if (now - entry.createdAt > TTL_MS) {
      exportsByToken.delete(token);
      unlink(entry.filePath).catch(() => {});
    }
  }
}

export function generateSupportBookingExportToken() {
  return randomBytes(32).toString("hex");
}

export function registerSupportBookingExport(
  token: string,
  payload: Pick<ExportEntry, "filePath" | "downloadFilename">
) {
  pruneExpired();
  exportsByToken.set(token, {
    ...payload,
    createdAt: Date.now(),
  });
}

export async function consumeSupportBookingExport(
  token: string
): Promise<{ filePath: string; downloadFilename: string } | null> {
  pruneExpired();
  const entry = exportsByToken.get(token);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.createdAt > TTL_MS) {
    exportsByToken.delete(token);
    await unlink(entry.filePath).catch(() => {});
    return null;
  }
  exportsByToken.delete(token);
  return { filePath: entry.filePath, downloadFilename: entry.downloadFilename };
}
