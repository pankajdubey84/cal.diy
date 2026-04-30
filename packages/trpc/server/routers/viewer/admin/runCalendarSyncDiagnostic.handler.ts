import type { TrpcSessionUser } from "../../../types";

import type { TRunCalendarSyncDiagnosticSchema } from "./runCalendarSyncDiagnostic.schema";

type RunOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TRunCalendarSyncDiagnosticSchema;
};

const runCalendarSyncDiagnosticHandler = async ({ input }: RunOptions) => {
  const { executeCalendarSyncDiagnostic } = await import("./runCalendarSyncDiagnostic.executor");

  return executeCalendarSyncDiagnostic(input);
};

export default runCalendarSyncDiagnosticHandler;
