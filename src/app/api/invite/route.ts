import { auth, clerkClient } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@convex/_generated/api";

/** Only Convex admins may manage Clerk invitations. */
async function requireAdmin() {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const token = await getToken({ template: "convex" });
  if (!token) return null;
  const me = await fetchQuery(api.users.me, {}, { token });
  return me && me.active && me.role === "admin" ? me : null;
}

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  try {
    const client = await clerkClient();
    const origin = new URL(req.url).origin;
    const inv = await client.invitations.createInvitation({ emailAddress: parsed.data.email, redirectUrl: `${origin}/sign-up`, ignoreExisting: true });
    return NextResponse.json({ id: inv.id, email: inv.emailAddress });
  } catch (e) {
    const msg = (e as { errors?: { message: string }[] }).errors?.[0]?.message ?? "Could not send the invitation";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const client = await clerkClient();
  const list = await client.invitations.getInvitationList({ status: "pending" });
  return NextResponse.json(list.data.map((i) => ({ id: i.id, email: i.emailAddress, createdAt: i.createdAt })));
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^inv_[A-Za-z0-9]+$/.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const client = await clerkClient();
  await client.invitations.revokeInvitation(id);
  return NextResponse.json({ ok: true });
}
