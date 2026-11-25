import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/auth";
import { KEY_RE, slugify } from "./lib/shared";
import { fieldOption, fieldType } from "./lib/validators";

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, { includeArchived }) => {
    await requireUser(ctx);
    const defs = await ctx.db.query("fieldDefinitions").withIndex("by_order").collect();
    return includeArchived ? defs : defs.filter((d) => !d.archived);
  },
});

const hexRe = /^#[0-9a-fA-F]{6}$/;
function checkOptions(type: string, options?: { value: string; label: string; color: string }[]) {
  if (type !== "single_select" && type !== "multi_select") return undefined;
  const opts = (options ?? []).map((o) => ({
    label: o.label.trim(),
    value: o.value || slugify(o.label),
    color: hexRe.test(o.color) ? o.color : "#A1A1AA",
  }));
  if (opts.some((o) => !o.label)) throw new ConvexError("Options need a label");
  if (new Set(opts.map((o) => o.value)).size !== opts.length) throw new ConvexError("Option names must be unique");
  return opts;
}

export const create = mutation({
  args: {
    label: v.string(),
    type: fieldType,
    options: v.optional(v.array(fieldOption)),
    required: v.optional(v.boolean()),
    showInTable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const label = args.label.trim();
    if (!label || label.length > 60) throw new ConvexError("Label must be 1–60 characters");
    let key = slugify(label);
    const all = await ctx.db.query("fieldDefinitions").collect();
    const reserved = ["status", "assignedto", "createdat", "lastactivityat", "nextfollowupat", "saleamount"];
    let i = 2;
    const base = key;
    while (all.some((d) => d.key === key) || reserved.includes(key.replace(/_/g, ""))) key = `${base}_${i++}`;
    if (!KEY_RE.test(key)) throw new ConvexError("Could not build a key for that label");
    const order = all.reduce((m, d) => Math.max(m, d.order), -1) + 1;
    const id = await ctx.db.insert("fieldDefinitions", {
      key,
      label,
      type: args.type,
      options: checkOptions(args.type, args.options),
      required: args.required ?? false,
      showInTable: args.showInTable ?? true,
      order,
      archived: false,
    });
    return { id, key };
  },
});

export const update = mutation({
  args: {
    id: v.id("fieldDefinitions"),
    label: v.optional(v.string()),
    options: v.optional(v.array(fieldOption)),
    required: v.optional(v.boolean()),
    showInTable: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...args }) => {
    await requireAdmin(ctx);
    const def = await ctx.db.get(id);
    if (!def) throw new ConvexError("Field not found");
    // Key and type are immutable after creation.
    const patch: Record<string, unknown> = {};
    if (args.label !== undefined) {
      const label = args.label.trim();
      if (!label || label.length > 60) throw new ConvexError("Label must be 1–60 characters");
      patch.label = label;
    }
    if (args.options !== undefined) patch.options = checkOptions(def.type, args.options);
    if (args.required !== undefined) {
      if (def.key === "name" && !args.required) throw new ConvexError("Name is always required");
      patch.required = args.required;
    }
    if (args.showInTable !== undefined) patch.showInTable = args.showInTable;
    await ctx.db.patch(id, patch);
  },
});

export const setArchived = mutation({
  args: { id: v.id("fieldDefinitions"), archived: v.boolean() },
  handler: async (ctx, { id, archived }) => {
    await requireAdmin(ctx);
    const def = await ctx.db.get(id);
    if (!def) throw new ConvexError("Field not found");
    if (def.key === "name") throw new ConvexError("The Name field can't be archived");
    // Soft delete: values stay on leads, the field is just hidden.
    await ctx.db.patch(id, { archived });
  },
});

export const reorder = mutation({
  args: { ids: v.array(v.id("fieldDefinitions")) },
  handler: async (ctx, { ids }) => {
    await requireAdmin(ctx);
    for (let i = 0; i < ids.length; i++) await ctx.db.patch(ids[i], { order: i });
  },
});
