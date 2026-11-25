"use client";
import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import * as XLSX from "xlsx";
import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { FIELD_TYPES, slugify, type FieldType } from "@convex/lib/shared";
import { useApp } from "@/components/app-data";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Label, NativeSelect } from "@/components/ui/input";
import { cn, errorMessage } from "@/lib/utils";

type Mapping = { mode: "existing"; key: string } | { mode: "new"; type: FieldType } | { mode: "skip" };
type Step = "file" | "map" | "options" | "run";

const ALIASES: Record<string, string> = {
  fullname: "name", contactname: "name", contact: "name", leadname: "name", firstname: "name",
  organisation: "company", organization: "company", companyname: "company", business: "company",
  emailaddress: "email", mail: "email",
  mobile: "phone", phonenumber: "phone", tel: "phone", telephone: "phone", contactnumber: "phone",
  url: "website", site: "website", web: "website",
  leadsource: "source", channel: "source",
  comments: "notes", note: "notes", remarks: "notes",
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const BATCH = 100;

export function ImportWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { fields, statuses, activeUsers } = useApp();
  const createField = useMutation(api.fields.create);
  const importBatch = useMutation(api.imports.importBatch);

  const [step, setStep] = useState<Step>("file");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<Mapping[]>([]);
  const defaultStatus = statuses.find((s) => s.key === "new") ?? statuses[0];
  const [statusId, setStatusId] = useState<Id<"statuses">>(defaultStatus?._id);
  const [assignTo, setAssignTo] = useState<string>("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: { rowNumber: number; message: string }[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setStep("file");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping([]);
    setProgress(0);
    setResult(null);
  };

  const parse = async (file: File) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return toast.error("Choose a .xlsx, .xls or .csv file");
    if (file.size > 20 * 1024 * 1024) return toast.error("File is larger than 20 MB");
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
      const [head, ...body] = data;
      const hs = (head ?? []).map((h, i) => String(h || `Column ${i + 1}`).trim());
      const nonEmpty = body.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
      if (!hs.length || !nonEmpty.length) return toast.error("That sheet looks empty");
      setFileName(file.name);
      setHeaders(hs);
      setRows(nonEmpty);
      // Auto-match headers to existing fields by label, key or common alias.
      const used = new Set<string>();
      setMapping(
        hs.map((h) => {
          const n = norm(h);
          const match = fields.find((f) => !used.has(f.key) && (norm(f.label) === n || norm(f.key) === n || ALIASES[n] === f.key));
          if (match) {
            used.add(match.key);
            return { mode: "existing", key: match.key };
          }
          return { mode: "skip" };
        }),
      );
      setStep("file");
    } catch (e) {
      toast.error(`Couldn’t read that file: ${errorMessage(e)}`);
    }
  };

  const mappedKeys = mapping.filter((m) => m.mode === "existing").map((m) => (m as { key: string }).key);
  const dupKeys = mappedKeys.filter((k, i) => mappedKeys.indexOf(k) !== i);
  const missingRequired = fields.filter((f) => f.required && !mappedKeys.includes(f.key));
  const canContinueMap = dupKeys.length === 0 && missingRequired.length === 0;

  const run = async () => {
    setStep("run");
    setRunning(true);
    const errors: { rowNumber: number; message: string }[] = [];
    let imported = 0;
    let skipped = 0;
    try {
      // 1. Create any new fields first.
      const keys: (string | null)[] = [];
      for (let i = 0; i < headers.length; i++) {
        const m = mapping[i];
        if (m.mode === "existing") keys.push(m.key);
        else if (m.mode === "new") {
          const { key } = await createField({ label: headers[i], type: m.type, showInTable: true });
          keys.push(key);
          toast.success(`Created field “${headers[i]}”`);
        } else keys.push(null);
      }
      // 2. Batches, sequentially, so later batches see earlier inserts (dedupe).
      for (let start = 0; start < rows.length; start += BATCH) {
        const batch = rows.slice(start, start + BATCH).map((r, j) => {
          const f: Record<string, unknown> = {};
          keys.forEach((k, ci) => {
            if (!k) return;
            const v = r[ci];
            if (v !== "" && v !== null && v !== undefined) f[k] = typeof v === "string" ? v.trim() : v;
          });
          return { rowNumber: start + j + 2, fields: f }; // +2: 1-based + header row
        });
        try {
          const res = await importBatch({ rows: batch, statusId, assignTo: (assignTo || undefined) as Id<"users"> | undefined, skipDuplicates });
          imported += res.imported;
          skipped += res.skipped;
          errors.push(...res.errors);
        } catch (e) {
          const msg = errorMessage(e);
          batch.forEach((b) => errors.push({ rowNumber: b.rowNumber, message: msg }));
        }
        setProgress(Math.min(1, (start + BATCH) / rows.length));
      }
      setResult({ imported, skipped, errors });
      toast.success(`Imported ${imported.toLocaleString("en-IN")} leads`);
    } catch (e) {
      toast.error(errorMessage(e));
      setResult({ imported, skipped, errors });
    } finally {
      setRunning(false);
    }
  };

  const downloadErrors = () => {
    if (!result) return;
    const data = result.errors.map((e) => {
      const r = rows[e.rowNumber - 2] ?? [];
      return { Row: e.rowNumber, Error: e.message, ...Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])) };
    });
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(data));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-errors-${fileName.replace(/\.[^.]+$/, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const preview = useMemo(() => rows.slice(0, 10), [rows]);
  const stepIdx = { file: 0, map: 1, options: 2, run: 3 }[step];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (running) return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent title="Import leads" description="From .xlsx, .xls or .csv. The first row must be the column headers." className="max-w-4xl">
        <ol className="mb-4 flex gap-2 text-[12px]" aria-label="Steps">
          {["Preview", "Map columns", "Options", "Import"].map((s, i) => (
            <li key={s} className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1", i === stepIdx ? "bg-accent-soft text-accent-soft-fg font-medium" : i < stepIdx ? "text-fg-secondary" : "text-fg-muted")}>
              <span className="num">{i + 1}.</span> {s}
            </li>
          ))}
        </ol>

        {step === "file" ? (
          <>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) parse(f);
              }}
              className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-[10px] border border-dashed border-border p-6 text-center hover:bg-surface-muted", dragging && "border-primary bg-accent-soft")}
            >
              <FileSpreadsheet className="size-6 text-fg-muted" />
              <span className="text-[13px] font-medium">{fileName || "Drop a file here or click to choose"}</span>
              <span className="caption">{fileName ? `${rows.length.toLocaleString("en-IN")} rows · ${headers.length} columns` : ".xlsx · .xls · .csv"}</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => e.target.files?.[0] && parse(e.target.files[0])} />
            </label>
            {preview.length ? (
              <div className="mt-4">
                <div className="caption mb-1.5">First {preview.length} rows</div>
                <div className="max-h-72 overflow-auto rounded-[8px] border border-border">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-surface-muted">
                      <tr>
                        {headers.map((h, i) => (
                          <th key={i} className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-fg-muted">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, ri) => (
                        <tr key={ri} className="border-t border-border">
                          {headers.map((_, ci) => (
                            <td key={ci} className="max-w-[200px] truncate whitespace-nowrap px-2 py-1.5">
                              {String(r[ci] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button variant="primary" disabled={!rows.length} onClick={() => setStep("map")}>
                Next: map columns
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "map" ? (
          <>
            <div className="max-h-[50vh] overflow-auto rounded-[8px] border border-border">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-surface-muted text-[12px] text-fg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Spreadsheet column</th>
                    <th className="px-3 py-2 text-left font-medium">Sample</th>
                    <th className="px-3 py-2 text-left font-medium">Import as</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, i) => {
                    const m = mapping[i];
                    const value = m.mode === "existing" ? `existing:${m.key}` : m.mode === "new" ? "new" : "skip";
                    return (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{h}</td>
                        <td className="max-w-[180px] truncate px-3 py-2 text-fg-muted">{String(rows[0]?.[i] ?? "")}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <NativeSelect
                              aria-label={`Map ${h}`}
                              value={value}
                              onChange={(e) => {
                                const v = e.target.value;
                                const next = [...mapping];
                                next[i] = v === "skip" ? { mode: "skip" } : v === "new" ? { mode: "new", type: "text" } : { mode: "existing", key: v.slice(9) };
                                setMapping(next);
                              }}
                              className={cn("w-56", m.mode === "existing" && dupKeys.includes(m.key) && "border-danger")}
                            >
                              <option value="skip">Skip</option>
                              <option value="new">Create new field…</option>
                              <optgroup label="Map to existing field">
                                {fields.map((f) => (
                                  <option key={f.key} value={`existing:${f.key}`}>
                                    {f.label}
                                    {f.required ? " *" : ""}
                                  </option>
                                ))}
                              </optgroup>
                            </NativeSelect>
                            {m.mode === "new" ? (
                              <NativeSelect
                                aria-label={`Type for new field ${h}`}
                                value={m.type}
                                className="w-36"
                                onChange={(e) => {
                                  const next = [...mapping];
                                  next[i] = { mode: "new", type: e.target.value as FieldType };
                                  setMapping(next);
                                }}
                              >
                                {FIELD_TYPES.filter((t) => t.value !== "single_select" && t.value !== "multi_select").map((t) => (
                                  <option key={t.value} value={t.value}>
                                    {t.label}
                                  </option>
                                ))}
                              </NativeSelect>
                            ) : null}
                          </div>
                          {m.mode === "new" ? <div className="caption mt-1">New field key: {slugify(h)}</div> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* DECISION: new fields from import can't be selects (their options are unknown up front); add options later in Settings. */}
            {missingRequired.length ? <p className="mt-2 text-[12px] text-danger">Map a column to: {missingRequired.map((f) => f.label).join(", ")}</p> : null}
            {dupKeys.length ? <p className="mt-2 text-[12px] text-danger">Each field can only be mapped once.</p> : null}
            <DialogFooter>
              <Button onClick={() => setStep("file")}>Back</Button>
              <Button variant="primary" disabled={!canContinueMap} onClick={() => setStep("options")}>
                Next: options
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "options" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="imp-status">Default status</Label>
                <NativeSelect id="imp-status" value={statusId} onChange={(e) => setStatusId(e.target.value as Id<"statuses">)}>
                  {statuses
                    .filter((s) => s.kind !== "won")
                    .map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                </NativeSelect>
              </div>
              <div>
                <Label htmlFor="imp-assign">Assign to</Label>
                <NativeSelect id="imp-assign" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                  <option value="">Unassigned</option>
                  {activeUsers.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label htmlFor="imp-dup">Duplicates (same email or phone)</Label>
                <NativeSelect id="imp-dup" value={skipDuplicates ? "skip" : "import"} onChange={(e) => setSkipDuplicates(e.target.value === "skip")}>
                  <option value="skip">Skip duplicates</option>
                  <option value="import">Import anyway</option>
                </NativeSelect>
              </div>
            </div>
            <p className="caption mt-3">
              {rows.length.toLocaleString("en-IN")} rows from {fileName} · {mapping.filter((m) => m.mode !== "skip").length} columns mapped
              {mapping.some((m) => m.mode === "new") ? ` · ${mapping.filter((m) => m.mode === "new").length} new fields` : ""}
            </p>
            <DialogFooter>
              <Button onClick={() => setStep("map")}>Back</Button>
              <Button variant="primary" onClick={run}>
                <Upload /> Import {rows.length.toLocaleString("en-IN")} rows
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "run" ? (
          <div>
            <div className="mb-2 flex justify-between text-[13px]">
              <span>{running ? "Importing…" : "Done"}</span>
              <span className="num">{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress * 100}%` }} />
            </div>
            {result ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="card p-4">
                  <div className="caption">Imported</div>
                  <div className="kpi-number flex items-center gap-1.5">
                    <CheckCircle2 className="size-5 text-success" /> {result.imported.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="card p-4">
                  <div className="caption">Skipped duplicates</div>
                  <div className="kpi-number">{result.skipped.toLocaleString("en-IN")}</div>
                </div>
                <div className="card p-4">
                  <div className="caption">Errors</div>
                  <div className={cn("kpi-number", result.errors.length && "text-danger")}>{result.errors.length.toLocaleString("en-IN")}</div>
                  {result.errors.length ? (
                    <button className="link mt-1 text-[12px]" onClick={downloadErrors}>
                      Download error CSV
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button
                variant="primary"
                disabled={running}
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
