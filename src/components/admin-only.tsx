"use client";
import { ShieldAlert } from "lucide-react";
import { useApp } from "./app-data";
import { EmptyState } from "./ui/misc";

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useApp();
  if (!isAdmin) return <EmptyState icon={<ShieldAlert />} title="Admins only" hint="Ask an admin if you need access to this page." />;
  return <>{children}</>;
}
