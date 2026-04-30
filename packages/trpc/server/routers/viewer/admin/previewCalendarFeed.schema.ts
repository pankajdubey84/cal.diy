import { z } from "zod";

export const ZPreviewCalendarFeedSchema = z.object({
  url: z
    .string()
    .min(1)
    .max(8192)
    .refine((s) => {
      try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }, "Must be a valid http(s) URL"),
});

export type TPreviewCalendarFeedSchema = z.infer<typeof ZPreviewCalendarFeedSchema>;
