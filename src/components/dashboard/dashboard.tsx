"use client";
import { useApp } from "@/components/app-data";
import { AdminDashboard } from "./admin-dashboard";
import { MemberDashboard } from "./member-dashboard";

// DECISION: admins land on the team overview (filter by member there); members see their own numbers.
export function Dashboard() {
  const { isAdmin } = useApp();
  return isAdmin ? <AdminDashboard /> : <MemberDashboard />;
}
