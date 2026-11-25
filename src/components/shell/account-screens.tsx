"use client";
import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

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
  const { signOut } = useClerk();
  return (
    <Card title="No access yet">
      <p className="caption mt-2">This account isn’t on the team. Ask an admin to add you, then sign in with the email and temporary password they give you.</p>
      <Button className="mt-4" onClick={() => signOut({ redirectUrl: "/sign-in" })}>
        Sign out
      </Button>
    </Card>
  );
}

const schema = z
  .object({ current: z.string().min(1, "Enter your temporary password"), next: z.string().min(8, "New password must be at least 8 characters"), confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "Passwords don’t match", path: ["confirm"] })
  .refine((v) => v.next !== v.current, { message: "Choose a different password", path: ["next"] });

/** Shown until a member replaces the temporary password an admin set. */
export function ChangePassword() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const done = useMutation(api.users.passwordChanged);
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Card title="Set your password">
      <p className="caption mb-4 mt-1 flex items-center gap-1.5">
        <KeyRound className="size-3.5" /> You signed in with a temporary password. Choose your own to continue.
      </p>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const p = schema.safeParse(form);
          if (!p.success) return toast.error(p.error.issues[0].message);
          if (!user) return;
          setBusy(true);
          try {
            await user.updatePassword({ currentPassword: p.data.current, newPassword: p.data.next, signOutOfOtherSessions: true });
            await done();
            toast.success("Password updated");
          } catch (err) {
            const errs = (err as { errors?: { longMessage?: string; message: string }[] }).errors;
            toast.error(errs?.[0]?.longMessage ?? errs?.[0]?.message ?? "Could not update the password");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <Label htmlFor="pw-cur">Temporary password</Label>
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
          <Button type="button" variant="ghost" onClick={() => signOut({ redirectUrl: "/sign-in" })}>
            Sign out
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            Save password
          </Button>
        </div>
      </form>
    </Card>
  );
}
