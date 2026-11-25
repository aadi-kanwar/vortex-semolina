import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { activeFieldDefs, derivedFields, insertLeads, logActivity, type NewLead } from "./lib/leads";
import { coerceFieldValue } from "./lib/shared";

// DECISION: import is admin-only (it's a team-setup task); everyone can export.

/**
 * Import one batch (≤ 200 rows). The client sends rows already mapped to
 * field keys. Each batch is its own transaction, so later batches see the
 * leads inserted by earlier ones (duplicates inside a file are caught too).
 */
export const importBatch = mutation({
  args: {
    rows: v.array(v.object({ rowNumber: v.number(), fields: v.record(v.string(), v.any()) })),
    statusId: v.id("statuses"),
    assignTo: v.optional(v.id("users")),
    skipDuplicates: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (args.rows.length > 200) throw new ConvexError("Batch too large");
    const status = await ctx.db.get(args.statusId);
    if (!status) throw new ConvexError("Status not found");
    if (status.kind === "won") throw new ConvexError("Imported leads can't start as Won");
    if (args.assignTo) {
      const u = await ctx.db.get(args.assignTo);
      if (!u || !u.active) throw new ConvexError("Pick an active member");
    }
    const defs = await activeFieldDefs(ctx);
    const errors: { rowNumber: number; message: string }[] = [];
    let skipped = 0;
    const toInsert: NewLead[] = [];
    const seenEmail = new Set<string>();
    const seenPhone = new Set<string>();
    const now = Date.now();

    for (const row of args.rows) {
      const values: Record<string, unknown> = {};
      try {
        for (const d of defs) {
          const val = coerceFieldValue(d, row.fields[d.key]);
          if (val !== undefined) values[d.key] = val;
        }
      } catch (e) {
        errors.push({ rowNumber: row.rowNumber, message: (e as Error).message });
        continue;
      }
      if (args.skipDuplicates) {
        const { emailKey, phoneKey } = derivedFields(defs, values);
        let dup = (emailKey && seenEmail.has(emailKey)) || (phoneKey && seenPhone.has(phoneKey));
        if (!dup && emailKey) dup = !!(await ctx.db.query("leads").withIndex("by_emailKey", (q) => q.eq("emailKey", emailKey)).first());
        if (!dup && phoneKey) dup = !!(await ctx.db.query("leads").withIndex("by_phoneKey", (q) => q.eq("phoneKey", phoneKey)).first());
        if (dup) {
          skipped++;
          continue;
        }
        if (emailKey) seenEmail.add(emailKey);
        if (phoneKey) seenPhone.add(phoneKey);
      }
      toInsert.push({ fields: values, statusId: args.statusId, assignedTo: args.assignTo, lastActivityAt: now, createdBy: admin._id, createdAt: now });
    }
    const ids = await insertLeads(ctx, defs, toInsert);
    for (const id of ids) {
      await logActivity(ctx, id, admin._id, "field", { created: true, imported: true });
      if (args.assignTo) await logActivity(ctx, id, admin._id, "assign", { from: null, to: args.assignTo });
    }
    return { imported: ids.length, skipped, errors };
  },
});
