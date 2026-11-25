import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

// Email + password only. No self sign-up: admins create accounts
// (users.addMember / users.createAdmin), so only the signIn flow is allowed here.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        if (params.flow !== "signIn") throw new ConvexError("Accounts are created by an admin");
        return { email: String(params.email ?? "").trim().toLowerCase() };
      },
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) return args.existingUserId;
      // Only reached from createAccount() in users.ts, which passes a full profile.
      const p = args.profile as Record<string, unknown>;
      if (!p.role || !p.name || !p.email) throw new ConvexError("Accounts are created by an admin");
      return await ctx.db.insert("users", {
        name: String(p.name),
        email: String(p.email),
        role: p.role === "admin" ? "admin" : "member",
        active: true,
        themePreference: "system",
        mustChangePassword: p.mustChangePassword === true,
      });
    },
  },
});
