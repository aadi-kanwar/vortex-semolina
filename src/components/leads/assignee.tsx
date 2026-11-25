"use client";
import { useState } from "react";
import { toast } from "sonner";
import type { Id } from "@convex/_generated/dataModel";
import { useApp } from "@/components/app-data";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Avatar } from "@/components/ui/misc";
import { errorMessage } from "@/lib/utils";
import { useLeadMutations } from "./use-lead-mutations";

export function AssigneeChip({ userId }: { userId?: Id<"users"> }) {
  const { userById } = useApp();
  if (!userId) return <span className="inline-flex h-[22px] items-center rounded-full border border-warning-border bg-warning-bg px-2 text-[13px] font-medium text-warning-fg">Unassigned</span>;
  const u = userById.get(userId);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-muted py-0.5 pl-0.5 pr-2 text-[13px] font-medium text-fg-secondary">
      <Avatar id={userId} name={u?.name} url={u?.avatarUrl} size={18} />
      <span className="truncate">{u?.name ?? "Unknown"}</span>
      {u && !u.active ? <span className="text-fg-muted">(inactive)</span> : null}
    </span>
  );
}

export function AssigneeControl({ leadId, assignedTo }: { leadId: Id<"leads">; assignedTo?: Id<"users"> }) {
  const { isAdmin, activeUsers, me } = useApp();
  const { claim, assign } = useLeadMutations();
  const [busy, setBusy] = useState(false);

  if (!isAdmin) {
    if (assignedTo) return <AssigneeChip userId={assignedTo} />;
    return (
      <Button
        size="sm"
        variant="soft"
        disabled={busy}
        onClick={async (e) => {
          e.stopPropagation();
          setBusy(true);
          try {
            await claim({ id: leadId });
            toast.success("Lead claimed");
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        Claim
      </Button>
    );
  }
  const doAssign = async (userId?: Id<"users">) => {
    try {
      await assign({ ids: [leadId], userId });
      toast.success(userId ? "Lead assigned" : "Lead unassigned");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="max-w-full rounded-full outline-none focus-visible:outline-2 focus-visible:outline-primary" aria-label="Change assignee" onClick={(e) => e.stopPropagation()}>
        <AssigneeChip userId={assignedTo} />
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        {[me, ...activeUsers.filter((u) => u._id !== me._id)].map((u) => (
          <DropdownMenuItem key={u._id} onSelect={() => doAssign(u._id)}>
            <Avatar id={u._id} name={u.name} url={u.avatarUrl} size={18} /> {u.name}
            {u._id === me._id ? <span className="caption">(you)</span> : null}
            {u._id === assignedTo ? <span className="ml-auto text-primary">✓</span> : null}
          </DropdownMenuItem>
        ))}
        {assignedTo ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => doAssign(undefined)}>Unassign</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
