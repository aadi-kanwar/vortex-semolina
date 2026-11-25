"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const schema = z.object({ email: z.string().trim().email("Enter a valid email"), password: z.string().min(1, "Enter your password") });

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-[7px] bg-primary text-[13px] font-bold text-primary-fg">L</span>
          <span className="text-[15px] font-semibold">Lead Tracker</span>
        </div>
        <h1 className="page-title">Sign in</h1>
        <p className="caption mb-4 mt-1">Use the email and password your admin gave you.</p>
        <form
          className="space-y-3"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const p = schema.safeParse({ email, password });
            if (!p.success) return setError(p.error.issues[0].message);
            setBusy(true);
            setError(null);
            try {
              await signIn("password", { email: p.data.email.toLowerCase(), password: p.data.password, flow: "signIn" });
              router.replace("/dashboard");
            } catch {
              // DECISION: one generic message so the form doesn't reveal which emails exist.
              setError("Wrong email or password, or too many attempts. Try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <Label htmlFor="si-email">Email</Label>
            <Input id="si-email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="si-pw">Password</Label>
            <Input id="si-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="text-[12px] text-danger">
              {error}
            </p>
          ) : null}
          <Button variant="primary" size="lg" type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="caption mt-4">Forgot your password? Ask an admin to reset it.</p>
      </div>
    </main>
  );
}
