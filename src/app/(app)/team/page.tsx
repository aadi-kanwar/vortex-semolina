import { AdminOnly } from "@/components/admin-only";
import { TeamPage } from "@/components/team/team-page";

export default function Page() {
  return (
    <AdminOnly>
      <TeamPage />
    </AdminOnly>
  );
}
