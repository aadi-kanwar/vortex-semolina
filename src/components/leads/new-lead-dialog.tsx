"use client";
import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useApp } from "@/components/app-data";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { useLeadPanel } from "@/hooks/use-lead-panel";
import { errorMessage } from "@/lib/utils";
import { validateClient } from "./field-value";

export function NewLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { fields, isAdmin } = useApp();
  const create = useMutation(api.leads.create);
  const { open: openLead } = useLeadPanel();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [assignToMe, setAssignToMe] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const shown = fields.filter((f) => f.required || f.showInTable);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const r = validateClient(f, values[f.key]);
      if (!r.ok) errs[f.key] = r.error;
      else if (r.value !== undefined) out[f.key] = r.value;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const id = await create({ fields: out, assignToMe: isAdmin ? assignToMe : undefined });
      toast.success("Lead created");
      setValues({});
      onOpenChange(false);
      openLead(id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New lead" description="Other fields can be filled in from the lead panel.">
        <form onSubmit={submit} className="space-y-3" noValidate>
          {shown.map((f) => {
            const id = `nl-${f.key}`;
            const v = values[f.key];
            const set = (x: unknown) => setValues((p) => ({ ...p, [f.key]: x }));
            return (
              <div key={f._id}>
                <Label htmlFor={id}>
                  {f.label}
                  {f.required ? <span className="text-danger"> *</span> : null}
                </Label>
                {f.type === "single_select" ? (
                  <NativeSelect id={id} value={String(v ?? "")} onChange={(e) => set(e.target.value)}>
                    <option value="">—</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                ) : f.type === "checkbox" ? (
                  <Checkbox id={id} checked={!!v} onCheckedChange={(c) => set(!!c)} />
                ) : f.type === "long_text" ? (
                  <Textarea id={id} value={String(v ?? "")} onChange={(e) => set(e.target.value)} />
                ) : f.type === "multi_select" ? (
                  <Input id={id} placeholder={`Comma separated: ${f.options?.map((o) => o.label).join(", ")}`} value={String(v ?? "")} onChange={(e) => set(e.target.value)} />
                ) : (
                  <Input
                    id={id}
                    autoFocus={f.key === "name"}
                    type={f.type === "number" || f.type === "currency" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : "text"}
                    value={String(v ?? "")}
                    onChange={(e) => set(e.target.value)}
                    aria-invalid={!!errors[f.key]}
                  />
                )}
                {errors[f.key] ? <p className="mt-1 text-[12px] text-danger">{errors[f.key]}</p> : null}
              </div>
            );
          })}
          {isAdmin ? (
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={assignToMe} onCheckedChange={(c) => setAssignToMe(!!c)} /> Assign to me
            </label>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={busy}>
              Create lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
