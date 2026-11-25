import { AdminOnly } from "@/components/admin-only";
import { DesignSystemPage } from "@/components/design-system/design-system-page";

export default function Page() {
  return (
    <AdminOnly>
      <DesignSystemPage />
    </AdminOnly>
  );
}
