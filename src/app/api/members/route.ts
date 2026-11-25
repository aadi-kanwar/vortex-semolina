import { auth, clerkClient } from "@clerk/nextjs/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

// Admins add members with a temporary password. Clerk holds the password;
// Convex holds the role and the "must change password" flag.

async function adminToken() {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const token = await getToken({ template: "convex" });
  if (!token) return null;
  const me = await fetchQuery(api.users.me, {}, { token });
  return me && me.active && me.role === "admin" ? token : null;
}

function clerkMessage(e: unknown, fallback: string) {
  const errs = (e as { errors?: { longMessage?: string; message: string }[] }).errors;
  return errs?.[0]?.longMessage ?? errs?.[0]?.message ?? (e instanceof Error ? e.message.replace(/^.*ConvexError: /, "") : fallback);
}

const password = z.string().min(8, "Temporary password must be at least 8 characters").max(72);

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["admin", "member"]),
  password,
});

export async function POST(req: Request) {
  const token = await adminToken();
  if (!token) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { name, email, role, password: pw } = parsed.data;

  let userId: Id<"users">;
  try {
    userId = await fetchMutation(api.users.reserveMember, { name, email, role }, { token });
  } catch (e) {
    return NextResponse.json({ error: clerkMessage(e, "Could not add member") }, { status: 400 });
  }
  try {
    const client = await clerkClient();
    const [firstName, ...rest] = name.split(/\s+/);
    await client.users.createUser({ emailAddress: [email], password: pw, firstName, lastName: rest.join(" ") || undefined });
  } catch (e) {
    await fetchMutation(api.users.cancelReservation, { userId }, { token }).catch(() => {});
    return NextResponse.json({ error: clerkMessage(e, "Clerk could not create the account") }, { status: 400 });
  }
  return NextResponse.json({ ok: true, email });
}

const resetSchema = z.object({ userId: z.string().min(1), password });

/** Set a new temporary password; the member must change it on next sign-in. */
export async function PATCH(req: Request) {
  const token = await adminToken();
  if (!token) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const parsed = resetSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const userId = parsed.data.userId as Id<"users">;
  try {
    const target = await fetchQuery(api.users.clerkIdOf, { userId }, { token });
    if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    const client = await clerkClient();
    let clerkId = target.clerkId;
    if (!clerkId) {
      // Never signed in yet: find their Clerk account by email.
      const found = await client.users.getUserList({ emailAddress: [target.email] });
      clerkId = found.data[0]?.id ?? null;
    }
    if (!clerkId) return NextResponse.json({ error: "No Clerk account for this member" }, { status: 404 });
    await client.users.updateUser(clerkId, { password: parsed.data.password, signOutOfOtherSessions: true });
    await fetchMutation(api.users.flagPasswordReset, { userId }, { token });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: clerkMessage(e, "Could not reset the password") }, { status: 400 });
  }
}
