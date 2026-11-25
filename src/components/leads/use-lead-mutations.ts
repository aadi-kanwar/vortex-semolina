"use client";
import { useMutation } from "convex/react";
import { optimisticallyUpdateValueInPaginatedQuery } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";

export type LeadListArgs = Omit<FunctionArgs<typeof api.leads.list>, "paginationOpts">;
type Lead = Omit<Doc<"leads">, "searchText" | "emailKey" | "phoneKey">;

function patchEverywhere(store: OptimisticLocalStore, listArgs: LeadListArgs | undefined, id: Id<"leads">, fn: (l: Lead) => Lead) {
  if (listArgs) {
    optimisticallyUpdateValueInPaginatedQuery(store, api.leads.list, listArgs, (l) => (l._id === id ? fn(l) : l));
  }
  const one = store.getQuery(api.leads.get, { id });
  if (one) store.setQuery(api.leads.get, { id }, fn(one) as Doc<"leads">);
}

/** Inline edits + status changes with optimistic updates. */
export function useLeadMutations(listArgs?: LeadListArgs) {
  const updateField = useMutation(api.leads.updateField).withOptimisticUpdate((store, { id, key, value }) => {
    patchEverywhere(store, listArgs, id, (l) => {
      const fields = { ...l.fields };
      if (value === undefined || value === "") delete fields[key];
      else fields[key] = value;
      return { ...l, fields };
    });
  });
  const setStatus = useMutation(api.leads.setStatus).withOptimisticUpdate((store, { id, statusId }) => {
    patchEverywhere(store, listArgs, id, (l) => ({ ...l, statusId }));
  });
  const claim = useMutation(api.leads.claim);
  const assign = useMutation(api.leads.assign);
  return { updateField, setStatus, claim, assign };
}
