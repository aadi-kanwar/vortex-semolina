import { AdminOnly } from "@/components/admin-only";
import { SettingsPage } from "@/components/settings/settings-page";

export default function Page() {
  return (
    <AdminOnly>
      <SettingsPage />
    </AdminOnly>
  );
}
