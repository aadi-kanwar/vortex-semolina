"use client";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useApp } from "@/components/app-data";
import { Avatar, Skeleton } from "@/components/ui/misc";
import { money, relative, timeIn, browserTz } from "@/lib/format";

export const ACTIVITY_DOT: Record<Doc<"activities">["type"], string> = {
  status: "#8B5CF6",
  assign: "#3B82F6",
  note: "#F59E0B",
  meeting: "#0891B2",
  field: "#A1A1AA",
  sale: "#16A34A",
};

export function useDescribeActivity() {
  const { userById, statusById, settings } = useApp();
  return (a: Pick<Doc<"activities">, "type" | "payload">): string => {
    const p = a.payload ?? {};
    const name = (id: unknown) => (id ? userById.get(String(id))?.name ?? "someone" : "Unassigned");
    switch (a.type) {
      case "status":
        return `changed status ${p.fromName ?? statusById.get(p.from)?.name ?? ""} → ${p.toName ?? statusById.get(p.to)?.name ?? ""}${p.lostReason ? ` (${p.lostReason})` : ""}`;
      case "assign":
        return p.claimed ? "claimed this lead" : p.to ? `assigned to ${name(p.to)}${p.from ? ` (was ${name(p.from)})` : ""}` : `unassigned (was ${name(p.from)})`;
      case "note":
        return "added a note";
      case "meeting": {
        const when = p.startUtc ? timeIn(p.startUtc, browserTz(), "EEE d MMM, h:mm a") : "";
        if (p.action === "requested") return `requested a meeting for ${when}`;
        if (p.action === "scheduled") return "added the Meet link — meeting scheduled";
        if (p.action === "rescheduled") return `rescheduled the meeting to ${when}`;
        if (p.action === "no_show") return "marked the meeting as no-show";
        return `marked the meeting ${p.action}`;
      }
      case "sale":
        if (p.paid) return `marked commission ${money(p.amount, p.currency)} paid`;
        if (p.edited) return `edited commission: ${money(p.from?.saleAmount, p.currency)} @ ${p.from?.rate}% → ${money(p.to?.saleAmount, p.currency)} @ ${p.to?.rate}%`;
        return `won the deal — ${money(p.saleAmount, p.currency ?? settings.currency)}, commission ${money(p.amount, p.currency)} (${p.rate}%)`;
      case "field":
        if (p.created) return p.imported ? "imported this lead" : "created this lead";
        if (p.key === "nextFollowUpAt") return p.to ? `set follow-up for ${new Date(p.to).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "cleared the follow-up";
        return `updated ${p.label ?? p.key}`;
    }
  };
}

export function Timeline({ leadId }: { leadId: Doc<"leads">["_id"] }) {
  const acts = useQuery(api.leads.activities, { leadId });
  const { userById } = useApp();
  const describe = useDescribeActivity();
  if (!acts) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }
  if (!acts.length) return <p className="caption">No activity yet.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-1 before:left-[10px] before:top-1 before:w-px before:bg-border">
      {acts.map((a) => {
        const u = userById.get(a.actorId);
        return (
          <li key={a._id} className="relative flex gap-3 pl-0">
            <span className="relative z-10 mt-0.5">
              <Avatar id={a.actorId} name={u?.name} url={u?.avatarUrl} size={21} />
              <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-[var(--surface)]" style={{ background: ACTIVITY_DOT[a.type] }} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px]">
                <span className="font-medium">{u?.name ?? "Someone"}</span> <span className="text-fg-secondary">{describe(a)}</span>
              </div>
              {a.type === "note" ? <p className="mt-1 whitespace-pre-wrap rounded-[8px] bg-surface-muted px-2.5 py-2 text-[14px]">{a.payload.text}</p> : null}
              <time className="caption" dateTime={new Date(a.createdAt).toISOString()} title={new Date(a.createdAt).toLocaleString()}>
                {relative(a.createdAt)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
