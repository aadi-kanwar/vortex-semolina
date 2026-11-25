"use client";
import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Mail, UserPlus, X } from "lucide-react";
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

type Invite = { id: string; email: string; createdAt: number };
const emailSchema = z.string().trim().email("Enter a valid email");
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<Invite[] | null>(null);

  const loadInvites = useCallback(async () => {
    try {
      const r = await fetch("/api/invite");
      setInvites(r.ok ? await r.json() : []);
    } catch {
      setInvites([]);
    }
  }, []);
  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = emailSchema.safeParse(email);
    if (!p.success) return toast.error(p.error.issues[0].message);
    setBusy(true);
    try {
      const r = await fetch("/api/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: p.data }) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      toast.success(`Invitation sent to ${body.email}`);
      setEmail("");
      setInviteOpen(false);
      loadInvites();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (id: string) => {
    const r = await fetch(`/api/invite?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (r.ok) {
      toast.success("Invitation revoked");
      loadInvites();
    } else toast.error("Could not revoke");
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
        <Button variant="primary" onClick={() => setInviteOpen(true)}>
          <UserPlus /> Invite member
        </Button>
      </PageHeader>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead className="text-[12px] text-fg-muted">
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
                    className="w-28"
                    onChange={(e) => run(setRole({ userId: u._id as Id<"users">, role: e.target.value as "admin" | "member" }), `${u.name} is now ${e.target.value}`)}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </NativeSelect>
                </td>
                <td className="px-4 py-2.5">
                  <RateInput user={u} />
                </td>
                <td className="px-4 py-2.5">{u.active ? <Pill color="#16A34A">Active</Pill> : <Pill color="#A1A1AA">Deactivated</Pill>}</td>
                <td className="px-4 py-2.5 text-right">
                  {u._id !== me._id ? (
                    <Button size="sm" variant={u.active ? "danger" : "outline"} onClick={() => run(setActive({ userId: u._id as Id<"users">, active: !u.active }), u.active ? `${u.name} deactivated` : `${u.name} reactivated`)}>
                      {u.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="card-title mb-2 mt-6">Pending invitations</h2>
      <div className="card">
        {invites === null ? (
          <p className="caption p-4">Loading…</p>
        ) : invites.length === 0 ? (
          <p className="caption p-4">No pending invitations.</p>
        ) : (
          <ul>
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-2 border-b border-[var(--surface-muted)] px-4 py-2.5 last:border-0">
                <Mail className="size-4 text-fg-muted" />
                <span className="flex-1 text-[13px]">{i.email}</span>
                <span className="caption">{new Date(i.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                <Button size="icon-sm" variant="ghost" aria-label={`Revoke invite for ${i.email}`} onClick={() => revoke(i.id)}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent title="Invite a member" description="They get an email from Clerk and join as a member. You can make them admin afterwards.">
          <form onSubmit={invite}>
            <Label htmlFor="inv-email">Email</Label>
            <Input id="inv-email" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            <DialogFooter>
              <Button type="button" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={busy}>
                Send invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
