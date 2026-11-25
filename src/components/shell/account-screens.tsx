"use client";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction } from "convex/react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { errorMessage } from "@/lib/utils";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="card-title">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function NoAccess() {
  const { signOut } = useAuthActions();
  return (
    <Card title="No access">
      <p className="caption mt-2">This account isn’t on the team. Ask an admin to add you.</p>
      <Button className="mt-4" onClick={() => signOut()}>
        Sign out
      </Button>
    </Card>
  );
}

const schema = z
  .object({ current: z.string().min(1, "Enter your current password"), next: z.string().min(8, "New password must be at least 8 characters").max(72), confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "Passwords don’t match", path: ["confirm"] })
  .refine((v) => v.next !== v.current, { message: "Choose a different password", path: ["next"] });

function PasswordForm({ currentLabel, onDone, secondary }: { currentLabel: string; onDone?: () => void; secondary: React.ReactNode }) {
  const change = useAction(api.users.changePassword);
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const p = schema.safeParse(form);
        if (!p.success) return toast.error(p.error.issues[0].message);
        setBusy(true);
        try {
          await change({ current: p.data.current, next: p.data.next });
          toast.success("Password updated. Other devices were signed out.");
          setForm({ current: "", next: "", confirm: "" });
          onDone?.();
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <Label htmlFor="pw-cur">{currentLabel}</Label>
        <Input id="pw-cur" type="password" autoComplete="current-password" value={form.current} onChange={set("current")} autoFocus />
      </div>
      <div>
        <Label htmlFor="pw-new">New password</Label>
        <Input id="pw-new" type="password" autoComplete="new-password" value={form.next} onChange={set("next")} />
      </div>
      <div>
        <Label htmlFor="pw-conf">Confirm new password</Label>
        <Input id="pw-conf" type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />
      </div>
      <div className="flex justify-between pt-2">
        {secondary}
        <Button variant="primary" type="submit" disabled={busy}>
          Save password
        </Button>
      </div>
    </form>
  );
}

/** Blocks the app until a temporary password is replaced. */
export function ChangePassword() {
  const { signOut } = useAuthActions();
  return (
    <Card title="Set your password">
      <p className="caption mb-4 mt-1 flex items-center gap-1.5">
        <KeyRound className="size-3.5" /> You signed in with a temporary password. Choose your own to continue.
      </p>
      <PasswordForm
        currentLabel="Temporary password"
        secondary={
          <Button type="button" variant="ghost" onClick={() => signOut()}>
            Sign out
          </Button>
        }
      />
    </Card>
  );
}

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Change password" description="Your other devices will be signed out." className="max-w-sm">
        <PasswordForm
          currentLabel="Current password"
          onDone={() => onOpenChange(false)}
          secondary={
            <Button type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
