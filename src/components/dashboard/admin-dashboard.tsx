"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { endOfDay, format } from "date-fns";
import { CartesianGrid, Dot, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BellRing, CalendarCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useApp } from "@/components/app-data";
import { MEETING_STATUS } from "@/components/calendar/meeting-section";
import { ImportWizard } from "@/components/leads/import-wizard";
import { Page, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Avatar, EmptyState, Pill } from "@/components/ui/misc";
import { useLeadPanel } from "@/hooks/use-lead-panel";
import { browserTz, cityFromTz, lakh, money, pct, timeIn, tzLabel } from "@/lib/format";
import { thisWeek } from "@/lib/ranges";
import { errorMessage } from "@/lib/utils";
import { BarList, DashSkeleton, DateRangeControl, Delta, Kpi, Panel, PanelLink, useDateRange } from "./parts";

function RevenueChart({ data, currency }: { data: { month: string; revenue: number }[]; currency: string }) {
  const rows = data.map((d) => ({ ...d, label: format(new Date(d.month + "-01T00:00:00"), "MMM") }));
  const last = rows.length - 1;
  const unit = currency === "INR" ? 100000 : 1000;
  return (
    <div className="h-[220px]" role="img" aria-label={`Won revenue, last 6 months: ${rows.map((r) => `${r.label} ${money(r.revenue, currency)}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            tickFormatter={(v: number) => (v === 0 ? "0" : currency === "INR" ? `${(v / unit).toLocaleString("en-IN", { maximumFractionDigits: 1 })}L` : `${(v / unit).toFixed(0)}k`)}
          />
          <Tooltip
            cursor={{ stroke: "var(--text-muted)", strokeDasharray: "3 3" }}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text)" }}
            labelStyle={{ color: "var(--text-muted)" }}
            formatter={(v: number) => [money(v, currency), "Won revenue"]}
          />
          <Line
            type="linear"
            dataKey="revenue"
            stroke="var(--primary)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              p.index === last ? <Dot key="last" cx={p.cx} cy={p.cy} r={5} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} /> : <g key={p.index} />
            }
            activeDot={{ r: 5, fill: "var(--primary)", stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AdminDashboard() {
  const { activeUsers, userById } = useApp();
  const { range, key, setKey, custom, setCustom } = useDateRange();
  const [member, setMember] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const week = thisWeek();
  const data = useQuery(api.dashboard.admin, {
    start: range.start,
    end: range.end,
    prevStart: range.prevStart,
    prevEnd: range.prevEnd,
    todayEnd: +endOfDay(new Date()),
    ...week,
    memberId: (member || undefined) as Id<"users"> | undefined,
  });
  const remind = useMutation(api.meetings.remind);
  const { open } = useLeadPanel();
  const viewer = browserTz();
  const cur = data?.currency ?? "INR";

  return (
    <Page>
      <PageHeader
        title="Team overview"
        subtitle={data ? `${format(new Date(), "MMMM yyyy")} · ${data.memberCount} members · default commission ${data.defaultRate}%` : format(new Date(), "MMMM yyyy")}
      >
        <NativeSelect aria-label="Member" value={member} onChange={(e) => setMember(e.target.value)} className="w-40">
          <option value="">Everyone</option>
          {activeUsers.map((u) => (
            <option key={u._id} value={u._id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
        <DateRangeControl value={key} onChange={setKey} custom={custom} setCustom={setCustom} />
        <Button variant="primary" onClick={() => setImportOpen(true)}>
          <Upload /> Import Excel
        </Button>
      </PageHeader>

      {!data ? (
        <DashSkeleton />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            <Kpi label="Total leads" value={data.kpis.total.toLocaleString("en-IN")} foot={<span className="caption num">{data.kpis.assigned.toLocaleString("en-IN")} assigned</span>} />
            <Kpi label="Unassigned" tone="warning" value={data.kpis.unassigned.toLocaleString("en-IN")} href="/leads" hrefLabel="Assign in bulk →" />
            <Kpi
              label="Meetings this week"
              value={data.kpis.meetingsWeek}
              foot={data.kpis.missingLinkWeek ? <span className="num text-[12px] font-medium text-danger">{data.kpis.missingLinkWeek} missing a Meet link</span> : <span className="caption">All have Meet links</span>}
            />
            <Kpi label={`Won revenue · ${range.label}`} value={money(data.kpis.revenue, cur)} foot={<Delta now={data.kpis.revenue} prev={data.kpis.revenuePrev} label="" format={(n) => money(n, cur)} />} />
            <Kpi label="Commission payable" tone="hero" value={money(data.kpis.payable, cur)} href="/commissions" hrefLabel="Review & mark paid →" />
          </div>

          <Panel title="Team leaderboard" meta={`ranked by won revenue · ${range.label}`}>
            <div className="-mx-[18px] overflow-x-auto">
              <table className="w-full min-w-[820px] text-[13px]">
                <thead className="text-[12px] text-fg-muted">
                  <tr className="border-b border-border">
                    {["#", "Member", "Leads", "Contacted", "Meetings", "Won", "Revenue", "Rate", "Commission", "Pending"].map((h, i) => (
                      <th key={h} className={`px-[18px] py-2 font-medium ${i > 1 ? "text-right" : "text-left"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.map((r, i) => (
                    <tr key={r.userId} className="border-b border-[var(--surface-muted)] last:border-0">
                      <td className="num px-[18px] py-2.5 text-fg-muted">{i + 1}</td>
                      <td className="px-[18px] py-2.5">
                        <span className="flex items-center gap-2 font-medium">
                          <Avatar id={r.userId} name={r.name} url={r.avatarUrl} size={24} /> {r.name}
                          {!r.active ? <span className="caption">(inactive)</span> : null}
                        </span>
                      </td>
                      <td className="num px-[18px] py-2.5 text-right">{r.leads.toLocaleString("en-IN")}</td>
                      <td className="num px-[18px] py-2.5 text-right">{r.contacted}</td>
                      <td className="num px-[18px] py-2.5 text-right">{r.meetings}</td>
                      <td className="num px-[18px] py-2.5 text-right">{r.won}</td>
                      <td className="num px-[18px] py-2.5 text-right font-semibold">{money(r.revenue, cur)}</td>
                      <td className="num px-[18px] py-2.5 text-right">{r.isOverride ? `${r.rate}% (override)` : `${r.rate}%`}</td>
                      <td className="num px-[18px] py-2.5 text-right">{money(r.commission, cur)}</td>
                      <td className={`num px-[18px] py-2.5 text-right font-medium ${r.pending ? "text-warning-fg" : "text-fg-muted"}`}>{r.pending ? money(r.pending, cur) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Pipeline funnel" meta="conversion to the next stage" action={<PanelLink href="/leads">Open leads →</PanelLink>}>
              <BarList
                rows={data.funnel.map((f) => ({ id: f.statusId, name: f.name, color: f.color, count: f.reached }))}
                right={(r, i) => (
                  <span className="inline-flex items-baseline gap-2">
                    <span>{r.count.toLocaleString("en-IN")}</span>
                    <span className="w-10 text-[12px] font-normal text-fg-muted">{i === 0 ? "" : pct(data.funnel[i].conversion)}</span>
                  </span>
                )}
              />
              <p className="caption mt-3">Bars count leads that reached each stage (now at it or later). Lost leads are excluded.</p>
            </Panel>
            <Panel title="Won revenue" meta={`last 6 months · ${cur === "INR" ? "₹ lakh" : cur}`}>
              <RevenueChart data={data.revenueByMonth} currency={cur} />
              <p className="caption num mt-2">
                This month: {lakh(data.revenueByMonth[data.revenueByMonth.length - 1]?.revenue ?? 0, cur)}
              </p>
            </Panel>
          </div>

          <Panel title="Meetings missing a Meet link" meta={data.missing.length || undefined} action={<PanelLink href="/calendar">Calendar →</PanelLink>}>
            {data.missing.length === 0 ? (
              <EmptyState icon={<CalendarCheck />} title="Every meeting has a link" hint="Requested meetings without a Meet link show up here." />
            ) : (
              <div className="-mx-[18px] overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead className="text-[12px] text-fg-muted">
                    <tr className="border-b border-border">
                      {["When", "Client", "Owner", "Status", ""].map((h) => (
                        <th key={h} className="px-[18px] py-2 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.missing.map((m) => {
                      const owner = userById.get(m.ownerId);
                      return (
                        <tr key={m._id} className="border-b border-[var(--surface-muted)] last:border-0">
                          <td className="num px-[18px] py-2.5">
                            {timeIn(m.startUtc, viewer, "EEE d MMM · h:mm a")} <span className="caption">{tzLabel(viewer)}</span>
                          </td>
                          <td className="px-[18px] py-2.5">
                            <button className="font-medium hover:underline" onClick={() => open(m.leadId)}>
                              {m.leadName}
                            </button>
                            <span className="caption"> · {m.city ?? cityFromTz(m.clientTimeZone)}</span>
                          </td>
                          <td className="px-[18px] py-2.5">
                            <span className="flex items-center gap-1.5">
                              <Avatar id={m.ownerId} name={owner?.name} url={owner?.avatarUrl} size={20} /> {owner?.name}
                            </span>
                          </td>
                          <td className="px-[18px] py-2.5">
                            <Pill color={MEETING_STATUS.requested.color}>Requested</Pill>
                          </td>
                          <td className="px-[18px] py-2.5 text-right">
                            <Button
                              size="sm"
                              onClick={() =>
                                remind({ id: m._id })
                                  .then(() => toast.success(`Reminder sent to ${owner?.name ?? "owner"}`))
                                  .catch((e) => toast.error(errorMessage(e)))
                              }
                            >
                              <BellRing /> Remind
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}
      <ImportWizard open={importOpen} onOpenChange={setImportOpen} />
    </Page>
  );
}
