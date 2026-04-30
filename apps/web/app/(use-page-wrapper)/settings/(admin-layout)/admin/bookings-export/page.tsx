import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { _generateMetadata, getTranslate } from "app/_utils";

import SupportBookingsExportView from "~/settings/admin/support-bookings-export-view";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("booking_export_support"),
    (t) => t("admin_booking_export_description"),
    undefined,
    undefined,
    "/settings/admin/bookings-export"
  );

const Page = async () => {
  const t = await getTranslate();

  return (
    <SettingsHeader title={t("booking_export_support")} description={t("admin_booking_export_description")}>
      <SupportBookingsExportView />
    </SettingsHeader>
  );
};

export default Page;
