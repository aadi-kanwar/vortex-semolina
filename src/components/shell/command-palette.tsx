"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Command } from "cmdk";
import * as D from "@radix-ui/react-dialog";
import { CalendarDays, LayoutDashboard, Search, Settings, Users, Wallet, Contact } from "lucide-react";
import { api } from "@convex/_generated/api";
import { useApp } from "@/components/app-data";
import { Pill } from "@/components/ui/misc";
import { useLeadPanel } from "@/hooks/use-lead-panel";

const Ctx = createContext<{ open: () => void }>({ open: () => {} });
export const useCommandPalette = () => useContext(Ctx);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const router = useRouter();
  const { open: openLead } = useLeadPanel();
  const { isAdmin, statusById } = useApp();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 150);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const results = useQuery(api.leads.quickSearch, open && debounced.trim() ? { q: debounced } : "skip");

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const nav = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Leads", href: "/leads", icon: Contact },
    { label: "Calendar", href: "/calendar", icon: CalendarDays },
    { label: "Commissions", href: "/commissions", icon: Wallet },
    ...(isAdmin
      ? [
          { label: "Team", href: "/team", icon: Users },
          { label: "Settings", href: "/settings", icon: Settings },
        ]
      : []),
  ];
  const item = "flex cursor-default items-center gap-2 rounded-[6px] px-2 py-2 text-[13px] text-fg-secondary data-[selected=true]:bg-surface-muted data-[selected=true]:text-fg [&_svg]:size-4";

  return (
    <Ctx.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
          <D.Content className="card fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden p-0">
            <D.Title className="sr-only">Search</D.Title>
            <D.Description className="sr-only">Search leads or jump to a page</D.Description>
            <Command shouldFilter={false} label="Search">
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-4 text-fg-muted" />
                <Command.Input value={q} onValueChange={setQ} placeholder="Search leads, or jump to…" className="h-11 w-full bg-transparent text-[14px] outline-none placeholder:text-fg-muted" />
              </div>
              <Command.List className="max-h-[360px] overflow-y-auto p-2">
                {results && results.length > 0 && (
                  <Command.Group heading="Leads" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-fg-muted">
                    {results.map((r) => {
                      const s = statusById.get(r.statusId);
                      return (
                        <Command.Item key={r._id} value={r._id} className={item} onSelect={() => { setOpen(false); openLead(r._id); }}>
                          <span className="truncate font-medium text-fg">{r.title}</span>
                          {r.company ? <span className="caption truncate">{r.company}</span> : null}
                          <span className="ml-auto">{s ? <Pill color={s.color}>{s.name}</Pill> : null}</span>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}
                {debounced && results && results.length === 0 ? <div className="caption px-2 py-3">No leads match “{debounced}”.</div> : null}
                {nav.some((n) => !q || n.label.toLowerCase().includes(q.toLowerCase())) ? (
                <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-fg-muted">
                  {nav
                    .filter((n) => !q || n.label.toLowerCase().includes(q.toLowerCase()))
                    .map((n) => (
                      <Command.Item key={n.href} value={n.href} className={item} onSelect={() => go(n.href)}>
                        <n.icon /> {n.label}
                      </Command.Item>
                    ))}
                </Command.Group>
                ) : null}
              </Command.List>
            </Command>
          </D.Content>
        </D.Portal>
      </D.Root>
    </Ctx.Provider>
  );
}
