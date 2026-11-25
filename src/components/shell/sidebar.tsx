"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { Bell, CalendarDays, Contact, KeyRound, LayoutDashboard, LogOut, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Palette, Settings, Sun, Users, Wallet, X } from "lucide-react";
import { api } from "@convex/_generated/api";
import { useApp } from "@/components/app-data";
import { VortexLogo } from "@/components/brand";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Avatar, Kbd } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { useLocalState } from "@/hooks/use-local-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLeadPanel } from "@/hooks/use-lead-panel";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "./theme";
import { ChangePasswordDialog } from "./account-screens";

function NavItem({
  href,
  icon: Icon,
  label,
  badge,
  badgeTone = "muted",
  onNavigate,
  collapsed,
}: {
  href: string;
  icon: typeof Contact;
  label: string;
  badge?: number;
  badgeTone?: "muted" | "warning";
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? (badge ? `${label} (${badge})` : label) : undefined}
      className={cn(
        "relative flex h-9 items-center gap-2.5 rounded-[7px] px-2.5 text-[14px] font-medium text-fg-secondary hover:bg-surface-muted hover:text-fg",
        collapsed && "w-9 justify-center px-0",
        active && "bg-accent-soft text-accent-soft-fg hover:bg-accent-soft hover:text-accent-soft-fg",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={2} />
      {collapsed ? (
        badge ? <span className={cn("absolute right-1 top-1 size-2 rounded-full", badgeTone === "warning" ? "bg-warning-border" : "bg-fg-muted")} aria-hidden /> : null
      ) : (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge ? (
            <span className={cn("num rounded-full px-1.5 text-[12px] font-semibold", badgeTone === "warning" ? "border border-warning-border bg-warning-bg text-warning-fg" : "text-fg-muted")}>
              {badge.toLocaleString("en-IN")}
            </span>
          ) : null}
        </>
      )}
    </Link>
  );
  return collapsed ? <Tooltip content={badge ? `${label} · ${badge.toLocaleString("en-IN")}` : label}>{link}</Tooltip> : link;
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
      <PopoverContent side="top" align="start" className="w-72 p-1">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[14px] font-semibold">Notifications</span>
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
            <div className="text-[14px]">{n.message}</div>
            <div className="caption">{relative(n.createdAt)}</div>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const iconBtn = "grid size-8 place-items-center rounded-[7px] text-fg-muted hover:bg-surface-muted hover:text-fg";

function CollapsedAccount({ onPassword }: { onPassword: () => void }) {
  const { me } = useApp();
  const { signOut } = useAuthActions();
  const { setTheme } = useTheme();
  const saveTheme = useMutation(api.users.setTheme);
  const pick = (t: "light" | "dark" | "system") => {
    setTheme(t);
    saveTheme({ theme: t }).catch(() => {});
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:outline-2 focus-visible:outline-primary" aria-label="Account menu">
        <Avatar id={me._id} name={me.name} url={me.avatarUrl} size={32} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end">
        <DropdownMenuLabel>{me.name}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => pick("light")}>
          <Sun /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => pick("dark")}>
          <Moon /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => pick("system")}>
          <Monitor /> System
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onPassword}>
          <KeyRound /> Change password
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({ onNavigate, collapsed, onToggle }: { onNavigate?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  const { me, isAdmin } = useApp();
  const leadCount = useQuery(api.leads.count);
  const pending = useQuery(api.commissions.pendingCount);
  const { signOut } = useAuthActions();
  const [pwOpen, setPwOpen] = useState(false);
  const nav = { onNavigate, collapsed };
  return (
    <div className={cn("flex h-full flex-col gap-4 p-3", collapsed && "items-center px-2")}>
      <div className={cn("flex h-9 items-center justify-between pl-1.5 pt-1", collapsed && "flex-col gap-3 pl-0 h-auto")}>
        <VortexLogo collapsed={collapsed} />
        {onToggle ? (
          <Tooltip content={<span className="flex items-center gap-1.5">{collapsed ? "Expand" : "Collapse"} sidebar <Kbd>[</Kbd></span>}>
            <button onClick={onToggle} className={iconBtn} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
              {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
            </button>
          </Tooltip>
        ) : null}
      </div>
      <nav className={cn("flex flex-col gap-0.5", collapsed && "items-center")} aria-label="Main">
        <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" {...nav} />
        <NavItem href="/leads" icon={Contact} label="Leads" badge={leadCount} {...nav} />
        <NavItem href="/calendar" icon={CalendarDays} label="Calendar" {...nav} />
        <NavItem href="/commissions" icon={Wallet} label="Commissions" badge={pending} badgeTone="warning" {...nav} />
        {isAdmin ? (
          <>
            {collapsed ? <div className="my-3 h-px w-6 bg-border" role="separator" /> : <div className="mt-4 px-2.5 pb-1 text-[12px] font-semibold tracking-wider text-fg-muted">ADMIN</div>}
            <NavItem href="/team" icon={Users} label="Team" {...nav} />
            <NavItem href="/settings" icon={Settings} label="Settings" {...nav} />
            <NavItem href="/design-system" icon={Palette} label="Design system" {...nav} />
          </>
        ) : null}
      </nav>
      {collapsed ? (
        <div className="mt-auto flex flex-col items-center gap-2">
          <Notifications />
          <CollapsedAccount onPassword={() => setPwOpen(true)} />
        </div>
      ) : (
        <div className="mt-auto flex flex-col gap-2 rounded-[10px] border border-border p-2">
          <div className="flex items-center gap-2">
            <Avatar id={me._id} name={me.name} url={me.avatarUrl} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium">{me.name}</div>
              <div className="caption capitalize">{me.role}</div>
            </div>
            <Notifications />
            <button onClick={() => setPwOpen(true)} className="grid size-7 place-items-center rounded-[6px] text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Change password" title="Change password">
              <KeyRound className="size-4" />
            </button>
            <button onClick={() => signOut()} className="grid size-7 place-items-center rounded-[6px] text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
          <ThemeSwitch />
        </div>
      )}
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useLocalState("sidebar.collapsed", false);
  // "[" toggles the sidebar (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      setCollapsed((c) => !c);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCollapsed]);
  return (
    <>
      <aside className={cn("hidden shrink-0 border-r border-border bg-surface transition-[width] duration-200 md:block", collapsed ? "w-[60px]" : "w-[232px]")}>
        <div className="sticky top-0 h-dvh">
          <SidebarBody collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        </div>
      </aside>
      {/* Mobile top bar (< 768px) */}
      <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-surface px-4 md:hidden">
        <button onClick={() => setOpen(true)} className="grid size-8 place-items-center rounded-[8px] hover:bg-surface-muted" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <VortexLogo />
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
