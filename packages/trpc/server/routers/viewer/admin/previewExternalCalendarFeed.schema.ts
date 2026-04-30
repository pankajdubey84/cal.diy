import { z } from "zod";

export const ZPreviewExternalCalendarFeedSchema = z.object({
  url: z.string().trim().min(1, "URL required").max(2048),
});

export type TPreviewExternalCalendarFeedSchema = z.infer<typeof ZPreviewExternalCalendarFeedSchema>;
