"use client";
import { useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { Copy, KeyRound, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useApp, type PublicUser } from "@/components/app-data";
import { Page, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Avatar, Pill } from "@/components/ui/misc";
import { errorMessage } from "@/lib/utils";

const addSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["admin", "member"]),
  password: z.string().min(8, "Temporary password must be at least 8 characters").max(72),
});

/** Readable temporary password, e.g. "Kite-7342-Amber". */
function tempPassword() {
  const words = ["Amber", "Cedar", "Delta", "Ember", "Flint", "Harbor", "Indigo", "Juniper", "Kite", "Lumen", "Maple", "Nova", "Onyx", "Pixel", "Quartz", "River", "Sable", "Tango", "Violet", "Willow"];
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${words[r[0] % words.length]}-${String(1000 + (r[1] % 9000))}-${words[r[2] % words.length]}`;
}

function PasswordField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" autoComplete="off" />
      <Button type="button" size="icon" aria-label="Generate password" title="Generate" onClick={() => onChange(tempPassword())}>
        <RefreshCw />
      </Button>
      <Button
        type="button"
        size="icon"
        aria-label="Copy password"
        title="Copy"
        onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copied"), () => toast.error("Couldn’t copy"))}
      >
        <Copy />
      </Button>
    </div>
  );
}

const rateSchema = z.coerce.number().min(0, "0–100").max(100, "0–100");

function RateInput({ user }: { user: PublicUser }) {
  const setOverride = useMutation(api.users.setCommissionOverride);
  const { settings } = useApp();
  const [v, setV] = useState(user.commissionRateOverride?.toString() ?? "");
  useEffect(() => setV(user.commissionRateOverride?.toString() ?? ""), [user.commissionRateOverride]);
  const save = async () => {
    const trimmed = v.trim();
    if ((trimmed || undefined) === (user.commissionRateOverride?.toString() || undefined)) return;
    let rate: number | undefined;
    if (trimmed) {
      const r = rateSchema.safeParse(trimmed);
      if (!r.success) return toast.error(r.error.issues[0].message);
      rate = r.data;
    }
    try {
      await setOverride({ userId: user._id as Id<"users">, rate });
      toast.success(rate === undefined ? `${user.name} now uses the default rate` : `${user.name}’s rate set to ${rate}%`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="flex items-center gap-1">
      <Input
        aria-label={`Commission override for ${user.name}`}
        type="number"
        step="0.1"
        min="0"
        max="100"
        placeholder={`${settings.defaultCommissionRate} (default)`}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-32"
      />
      <span className="caption">%</span>
    </div>
  );
}

export function TeamPage() {
  const { users, me } = useApp();
  const setRole = useMutation(api.users.setRole);
  const setActive = useMutation(api.users.setActive);
  const addMember = useAction(api.users.addMember);
  const resetPassword = useAction(api.users.resetPassword);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "member" as "admin" | "member", password: "" });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [resetFor, setResetFor] = useState<PublicUser | null>(null);
  const [resetPw, setResetPw] = useState("");

  useEffect(() => {
    if (addOpen) {
      setForm({ name: "", email: "", role: "member", password: tempPassword() });
      setCreated(null);
    }
  }, [addOpen]);
  useEffect(() => {
    if (resetFor) setResetPw(tempPassword());
  }, [resetFor]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = addSchema.safeParse(form);
    if (!p.success) return toast.error(p.error.issues[0].message);
    setBusy(true);
    try {
      await addMember(p.data);
      toast.success(`${p.data.name} added`);
      setCreated({ email: p.data.email.toLowerCase(), password: p.data.password });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetFor) return;
    if (resetPw.length < 8) return toast.error("Temporary password must be at least 8 characters");
    setBusy(true);
    try {
      await resetPassword({ userId: resetFor._id as Id<"users">, password: resetPw });
      toast.success(`New temporary password set for ${resetFor.name}. Share it with them.`);
      setResetFor(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const run = async (p: Promise<unknown>, msg: string) => {
    try {
      await p;
      toast.success(msg);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Page>
      <PageHeader title="Team" subtitle={`${users.filter((u) => u.active).length} active members · deactivated members’ leads stay visible to admins`}>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <UserPlus /> Add member
        </Button>
      </PageHeader>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-[14px]">
          <thead className="text-[13px] text-fg-muted">
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left font-medium">Member</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Commission override</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id} className="border-b border-[var(--surface-muted)] last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar id={u._id} name={u.name} url={u.avatarUrl} size={28} />
                    <div className="min-w-0">
                      <div className="font-medium">
                        {u.name} {u._id === me._id ? <span className="caption">(you)</span> : null}
                      </div>
                      <div className="caption truncate">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <NativeSelect
                    aria-label={`Role for ${u.name}`}
                    value={u.role}
                    disabled={u._id === me._id}
                    className="w-32"
                    onChange={(e) => run(setRole({ userId: u._id as Id<"users">, role: e.target.value as "admin" | "member" }), `${u.name} is now ${e.target.value}`)}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </NativeSelect>
                </td>
                <td className="px-4 py-2.5">
                  <RateInput user={u} />
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {u.active ? <Pill color="#16A34A">Active</Pill> : <Pill color="#A1A1AA">Deactivated</Pill>}
                    {u.mustChangePassword ? <Pill color="#F59E0B">Temporary password</Pill> : null}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-1.5">
                  {u._id !== me._id ? (
                    <Button size="sm" onClick={() => setResetFor(u)}>
                      <KeyRound /> Reset password
                    </Button>
                  ) : null}
                  {u._id !== me._id ? (
                    <Button size="sm" variant={u.active ? "danger" : "outline"} onClick={() => run(setActive({ userId: u._id as Id<"users">, active: !u.active }), u.active ? `${u.name} deactivated` : `${u.name} reactivated`)}>
                      {u.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="caption mt-3">Members sign in at /sign-in with the email and temporary password you give them, then choose their own password. You can change your own password from the key icon in the sidebar.</p>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        {created ? (
          <DialogContent title="Member added" description="Share these sign-in details privately. They’ll be asked to set their own password on first sign-in.">
            <div className="space-y-2 rounded-[8px] bg-surface-muted p-3 text-[14px]">
              <div>
                <span className="text-fg-muted">Email:</span> {created.email}
              </div>
              <div>
                <span className="text-fg-muted">Temporary password:</span> <span className="font-mono">{created.password}</span>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => navigator.clipboard.writeText(`Email: ${created.email}\nTemporary password: ${created.password}\nSign in: ${window.location.origin}/sign-in`).then(() => toast.success("Copied"))}>
                <Copy /> Copy details
              </Button>
              <Button variant="primary" onClick={() => setAddOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : (
          <DialogContent title="Add member" description="Creates their sign-in with a temporary password. They must change it the first time they sign in.">
            <form onSubmit={add} className="space-y-3">
              <div>
                <Label htmlFor="am-name">Name</Label>
                <Input id="am-name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="am-email">Email</Label>
                <Input id="am-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" />
              </div>
              <div>
                <Label htmlFor="am-role">Role</Label>
                <NativeSelect id="am-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "member" })} className="w-36">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </NativeSelect>
              </div>
              <div>
                <Label htmlFor="am-pw">Temporary password</Label>
                <PasswordField id="am-pw" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setAddOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={busy}>
                  Add member
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        {resetFor ? (
          <DialogContent title={`Reset password · ${resetFor.name}`} description="Signs them out everywhere. They must choose a new password after signing in with this one.">
            <form onSubmit={reset}>
              <Label htmlFor="rp-pw">New temporary password</Label>
              <PasswordField id="rp-pw" value={resetPw} onChange={setResetPw} />
              <DialogFooter>
                <Button type="button" onClick={() => setResetFor(null)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={busy}>
                  Set password
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </Page>
  );
}
