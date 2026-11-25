"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { errorMessage } from "@/lib/utils";

type PublicUser = Omit<Doc<"users">, "clerkId">;
type Settings = FunctionReturnType<typeof api.settings.get>;

export interface AppData {
  me: Doc<"users">;
  isAdmin: boolean;
  users: PublicUser[];
  activeUsers: PublicUser[];
  statuses: Doc<"statuses">[];
  fields: Doc<"fieldDefinitions">[];
  settings: Settings;
  userById: Map<string, PublicUser>;
  statusById: Map<string, Doc<"statuses">>;
}

const Ctx = createContext<AppData | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppDataProvider");
  return v;
}

/** Syncs the Clerk user into Convex, then loads the lookups every screen needs. */
export function AppDataProvider({ children, fallback, deactivated }: { children: React.ReactNode; fallback: React.ReactNode; deactivated: React.ReactNode }) {
  const store = useMutation(api.users.store);
  const [synced, setSynced] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  useEffect(() => {
    store()
      .then(() => setSynced(true))
      .catch((e) => setSyncError(errorMessage(e)));
  }, [store]);

  const me = useQuery(api.users.me, synced ? {} : "skip");
  const ready = synced && !!me && me.active;
  const users = useQuery(api.users.list, ready ? {} : "skip");
  const statuses = useQuery(api.statuses.list, ready ? {} : "skip");
  const fields = useQuery(api.fields.list, ready ? {} : "skip");
  const settings = useQuery(api.settings.get, ready ? {} : "skip");

  const value = useMemo<AppData | null>(() => {
    if (!me || !users || !statuses || !fields || !settings) return null;
    return {
      me,
      isAdmin: me.role === "admin",
      users,
      activeUsers: users.filter((u) => u.active),
      statuses,
      fields,
      settings,
      userById: new Map(users.map((u) => [u._id, u])),
      statusById: new Map(statuses.map((s) => [s._id, s])),
    };
  }, [me, users, statuses, fields, settings]);

  if (syncError) return <div className="grid min-h-dvh place-items-center p-6 text-center text-[13px] text-danger">{syncError}</div>;
  if (me && !me.active) return <>{deactivated}</>;
  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export type { PublicUser };
export type UserId = Id<"users">;
