"use client";
import { Suspense } from "react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { RedirectToSignIn, SignOutButton } from "@clerk/nextjs";
import { AppDataProvider } from "@/components/app-data";
import { Sidebar } from "@/components/shell/sidebar";
import { ThemeSync } from "@/components/shell/theme";
import { CommandPaletteProvider } from "@/components/shell/command-palette";
import { LeadPanel } from "@/components/leads/lead-panel";
import { Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-[220px] border-r border-border bg-surface p-4 md:block">
        <Skeleton className="mb-6 h-6 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="mb-3 h-6" />
        ))}
      </div>
      <div className="flex-1 p-8">
        <Skeleton className="mb-2 h-7 w-56" />
        <Skeleton className="mb-6 h-4 w-80" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[12px]" />
          ))}
        </div>
      </div>
    </div>
  );
}

function Deactivated() {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="card max-w-sm p-6 text-center">
        <div className="card-title">Your account is deactivated</div>
        <p className="caption mt-2">Ask an admin to reactivate you.</p>
        <SignOutButton>
          <Button className="mt-4">Sign out</Button>
        </SignOutButton>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading>
        <ShellSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <RedirectToSignIn />
      </Unauthenticated>
      <Authenticated>
        <AppDataProvider fallback={<ShellSkeleton />} deactivated={<Deactivated />}>
          <Suspense fallback={<ShellSkeleton />}>
            <CommandPaletteProvider>
              <ThemeSync />
              <div className="flex min-h-dvh flex-col md:flex-row">
                <Sidebar />
                <main className="min-w-0 flex-1">{children}</main>
              </div>
              <LeadPanel />
            </CommandPaletteProvider>
          </Suspense>
        </AppDataProvider>
      </Authenticated>
    </>
  );
}
