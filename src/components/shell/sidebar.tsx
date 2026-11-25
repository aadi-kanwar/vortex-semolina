"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { Bell, CalendarDays, Contact, KeyRound, LayoutDashboard, LogOut, Menu, Settings, Users, Wallet, X } from "lucide-react";
import { api } from "@convex/_generated/api";
import { useApp } from "@/components/app-data";
import { Avatar } from "@/components/ui/misc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLeadPanel } from "@/hooks/use-lead-panel";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "./theme";

function Logo() {
  return (
    <div className="flex items-center gap-2 px-2">
      <span className="grid size-6 place-items-center rounded-[7px] bg-primary text-[12px] font-bold text-primary-fg">L</span>
      <span className="text-[14px] font-semibold">Lead Tracker</span>
    </div>
  );
}

function NavItem({ href, icon: Icon, label, badge, badgeTone = "muted", onNavigate }: { href: string; icon: typeof Contact; label: string; badge?: number; badgeTone?: "muted" | "warning"; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-[7px] px-2 text-[13px] font-medium text-fg-secondary hover:bg-surface-muted hover:text-fg",
        active && "bg-accent-soft text-accent-soft-fg hover:bg-accent-soft hover:text-accent-soft-fg",
      )}
    >
      <Icon className="size-4" strokeWidth={2} />
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className={cn("num rounded-full px-1.5 text-[11px] font-semibold", badgeTone === "warning" ? "border border-warning-border bg-warning-bg text-warning-fg" : "text-fg-muted")}>
          {badge.toLocaleString("en-IN")}
        </span>
      ) : null}
    </Link>
  );
}

function Notifications() {
  const items = useQuery(api.notifications.mine) ?? [];
  const markRead = useMutation(api.notifications.markRead);
  const { open } = useLeadPanel();
  return (
    <Popover>
      <PopoverTrigger className="relative grid size-7 place-items-center rounded-[6px] text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label={`Notifications (${items.length} unread)`}>
        <Bell className="size-4" />
        {items.length ? <span className="absolute right-1 top-1 size-1.5 rounded-full bg-danger" /> : null}
      </PopoverTrigger>
      <PopoverContent side="top" className="w-72 p-1">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[13px] font-semibold">Notifications</span>
          {items.length ? (
            <button className="caption hover:text-fg" onClick={() => markRead({ ids: items.map((i) => i._id) })}>
              Mark all read
            </button>
          ) : null}
        </div>
        {items.length === 0 ? <p className="caption px-2 pb-3">You’re all caught up.</p> : null}
        {items.map((n) => (
          <button
            key={n._id}
            className="block w-full rounded-[6px] px-2 py-2 text-left hover:bg-surface-muted"
            onClick={() => {
              markRead({ ids: [n._id] });
              if (n.leadId) open(n.leadId);
            }}
          >
            <div className="text-[13px]">{n.message}</div>
            <div className="caption">{relative(n.createdAt)}</div>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { me, isAdmin } = useApp();
  const leadCount = useQuery(api.leads.count);
  const pending = useQuery(api.commissions.pendingCount);
  const { signOut, openUserProfile } = useClerk();
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="pt-1">
        <Logo />
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" onNavigate={onNavigate} />
        <NavItem href="/leads" icon={Contact} label="Leads" badge={leadCount} onNavigate={onNavigate} />
        <NavItem href="/calendar" icon={CalendarDays} label="Calendar" onNavigate={onNavigate} />
        <NavItem href="/commissions" icon={Wallet} label="Commissions" badge={pending} badgeTone="warning" onNavigate={onNavigate} />
        {isAdmin ? (
          <>
            <div className="mt-4 px-2 pb-1 text-[11px] font-semibold tracking-wider text-fg-muted">ADMIN</div>
            <NavItem href="/team" icon={Users} label="Team" onNavigate={onNavigate} />
            <NavItem href="/settings" icon={Settings} label="Settings" onNavigate={onNavigate} />
          </>
        ) : null}
      </nav>
      <div className="mt-auto flex flex-col gap-2 rounded-[10px] border border-border p-2">
        <div className="flex items-center gap-2">
          <Avatar id={me._id} name={me.name} url={me.avatarUrl} size={28} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{me.name}</div>
            <div className="caption capitalize">{me.role}</div>
          </div>
          <Notifications />
          <button onClick={() => openUserProfile()} className="grid size-7 place-items-center rounded-[6px] text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Account and password" title="Account & password">
            <KeyRound className="size-4" />
          </button>
          <button onClick={() => signOut({ redirectUrl: "/sign-in" })} className="grid size-7 place-items-center rounded-[6px] text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Sign out" title="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
        <ThemeSwitch />
      </div>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="hidden w-[220px] shrink-0 border-r border-border bg-surface md:block">
        <div className="sticky top-0 h-dvh">
          <SidebarBody />
        </div>
      </aside>
      {/* Mobile top bar (< 768px) */}
      <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-surface px-4 md:hidden">
        <button onClick={() => setOpen(true)} className="grid size-8 place-items-center rounded-[8px] hover:bg-surface-muted" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <Logo />
      </header>
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal aria-label="Menu">
          <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[260px] border-r border-border bg-surface">
            <button onClick={() => setOpen(false)} className="absolute right-2 top-3 grid size-8 place-items-center rounded-[8px] hover:bg-surface-muted" aria-label="Close menu">
              <X className="size-4" />
            </button>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
