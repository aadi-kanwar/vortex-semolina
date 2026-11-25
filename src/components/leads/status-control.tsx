"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@convex/_generated/dataModel";
import { useApp } from "@/components/app-data";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Pill, Swatch } from "@/components/ui/misc";
import { errorMessage } from "@/lib/utils";
import { z } from "zod";
import { useLeadMutations, type LeadListArgs } from "./use-lead-mutations";

type Pending =
  | { kind: "won"; leadId: Id<"leads">; statusId: Id<"statuses"> }
  | { kind: "lost"; leadId: Id<"leads">; statusId: Id<"statuses"> }
  | { kind: "void"; leadId: Id<"leads">; statusId: Id<"statuses">; extra?: { lostReason?: string } };

const saleSchema = z.coerce.number({ invalid_type_error: "Enter a number" }).positive("Sale amount must be more than 0").max(1e12);

/** Status change with the Won (sale amount) / Lost (reason) / reopen (void) dialogs. */
export function useStatusChanger(listArgs?: LeadListArgs) {
  const { statusById, settings } = useApp();
  const { setStatus } = useLeadMutations(listArgs);
  const [pending, setPending] = useState<Pending | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (leadId: Id<"leads">, statusId: Id<"statuses">, extra: { saleAmount?: number; lostReason?: string; confirmVoid?: boolean } = {}) => {
    setBusy(true);
    try {
      await setStatus({ id: leadId, statusId, ...extra });
      toast.success(`Status set to ${statusById.get(statusId)?.name}`);
      setPending(null);
    } catch (e) {
      const msg = errorMessage(e);
      if (msg === "CONFIRM_VOID") setPending({ kind: "void", leadId, statusId, extra });
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const change = (leadId: Id<"leads">, statusId: Id<"statuses">) => {
    const s = statusById.get(statusId);
    if (!s) return;
    setAmount("");
    setReason("");
    if (s.kind === "won") setPending({ kind: "won", leadId, statusId });
    else if (s.kind === "lost") setPending({ kind: "lost", leadId, statusId });
    else run(leadId, statusId);
  };

  const dialogs = (
    <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
      {pending?.kind === "won" ? (
        <DialogContent title="Mark as Won" description="Enter the sale amount. Commission is calculated from it.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const r = saleSchema.safeParse(amount);
              if (!r.success) return toast.error(r.error.issues[0].message);
              run(pending.leadId, pending.statusId, { saleAmount: r.data });
            }}
          >
            <Label htmlFor="sale">Sale amount ({settings.currency})</Label>
            <Input id="sale" type="number" min="1" step="1" inputMode="numeric" autoFocus required value={amount} onChange={(e) => setAmount(e.target.value)} />
            <DialogFooter>
              <Button type="button" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={busy}>
                Mark Won
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : pending?.kind === "lost" ? (
        <DialogContent title="Mark as Lost" description="Optional: why was it lost?">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(pending.leadId, pending.statusId, { lostReason: reason });
            }}
          >
            <Label htmlFor="reason">Loss reason</Label>
            <Textarea id="reason" autoFocus maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Went with a competitor" />
            <DialogFooter>
              <Button type="button" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={busy}>
                Mark Lost
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : pending?.kind === "void" ? (
        <DialogContent title="Void pending commission?" description="This lead was Won. Moving it out of Won voids its pending commission. Paid commissions are not affected.">
          <DialogFooter>
            <Button onClick={() => setPending(null)}>Keep as Won</Button>
            <Button variant="primary" disabled={busy} onClick={() => run(pending.leadId, pending.statusId, { ...pending.extra, confirmVoid: true })}>
              Void and change status
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
  return { change, dialogs };
}

export function StatusPill({ statusId }: { statusId: Id<"statuses"> }) {
  const { statusById } = useApp();
  const s = statusById.get(statusId);
  return s ? <Pill color={s.color}>{s.name}</Pill> : <span className="text-fg-muted">—</span>;
}

export function StatusMenu({ statusId, onChange, disabled }: { statusId: Id<"statuses">; onChange: (id: Id<"statuses">) => void; disabled?: boolean }) {
  const { statuses } = useApp();
  if (disabled) return <StatusPill statusId={statusId} />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group inline-flex max-w-full items-center gap-0.5 rounded-full outline-none focus-visible:outline-2 focus-visible:outline-primary" aria-label="Change status" onClick={(e) => e.stopPropagation()}>
        <StatusPill statusId={statusId} />
        <ChevronDown className="size-3 text-fg-muted opacity-0 group-hover:opacity-100" />
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        {statuses.map((s) => (
          <DropdownMenuItem key={s._id} onSelect={() => s._id !== statusId && onChange(s._id)}>
            <Swatch color={s.color} /> {s.name}
            {s._id === statusId ? <span className="ml-auto text-primary">✓</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
