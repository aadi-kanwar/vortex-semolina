"use client";
import { useState } from "react";
import { useQuery } from "convex/react";
import { endOfDay, format } from "date-fns";
import { CalendarCheck, Flame, ListTodo, Plus, Video } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useApp } from "@/components/app-data";
import { MeetLinkForm } from "@/components/calendar/meeting-section";
import { StatusPill } from "@/components/leads/status-control";
import { ACTIVITY_DOT, useDescribeActivity } from "@/components/leads/timeline";
import { NewLeadDialog } from "@/components/leads/new-lead-dialog";
import { Page, PageHeader, SearchButton } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/misc";
import { useLeadPanel } from "@/hooks/use-lead-panel";
import { browserTz, cityFromTz, money, pct, relative, timeIn, tzLabel } from "@/lib/format";
import { BarList, DashSkeleton, DateRangeControl, Delta, Kpi, Panel, PanelLink, PanelSkeleton, useDateRange } from "./parts";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function MemberDashboard() {
  const { me, settings } = useApp();
  const { range, key, setKey, custom, setCustom } = useDateRange();
  const todayEnd = +endOfDay(new Date());
  const data = useQuery(api.dashboard.member, { start: range.start, end: range.end, prevStart: range.prevStart, prevEnd: range.prevEnd, todayEnd });
  const { open } = useLeadPanel();
  const describe = useDescribeActivity();
  const [newOpen, setNewOpen] = useState(false);
  const [linkFor, setLinkFor] = useState<Doc<"meetings"> | null>(null);
  const viewer = browserTz();
  const cur = data?.currency ?? settings.currency;
  const first = me.name.split(" ")[0];

  const summary = data
    ? [
        format(new Date(), "EEEE, d MMMM"),
        `${data.followUpsDue} follow-up${data.followUpsDue === 1 ? "" : "s"} due today`,
        data.needsLink ? `${data.needsLink} meeting${data.needsLink === 1 ? "" : "s"} need${data.needsLink === 1 ? "s" : ""} a Meet link` : "all meetings have links",
      ].join(" · ")
    : format(new Date(), "EEEE, d MMMM");

  return (
    <Page>
      <PageHeader title={`${greeting()}, ${first}`} subtitle={summary}>
        <DateRangeControl value={key} onChange={setKey} custom={custom} setCustom={setCustom} />
        <SearchButton />
        <Button variant="primary" onClick={() => setNewOpen(true)}>
          <Plus /> New lead
        </Button>
      </PageHeader>

      {!data ? (
        <DashSkeleton />
      ) : (
        <div className="space-y-4">
          {/* Commission row */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
            <div className="card border-transparent bg-hero p-5 text-hero-fg">
              <div className="text-[13px] font-medium text-hero-caption">Commission earned · {range.label}</div>
              <div className="hero-number mt-1">{money(data.commission.earned, cur)}</div>
              <div className="num mt-1 text-[13px] text-hero-caption">
                {data.commission.earnedDeals} deal{data.commission.earnedDeals === 1 ? "" : "s"} won · {money(data.commission.earnedSales, cur)} in sales · {data.rate}% rate
              </div>
            </div>
            <div className="card p-5">
              <div className="text-[13px] font-medium text-fg-muted">Pending payout</div>
              <div className="hero-number mt-1">{money(data.commission.pending, cur)}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[13px] text-fg-muted">
                <span className="size-2 rounded-full bg-warning-border" aria-hidden />
                {data.commission.pendingDeals} deal{data.commission.pendingDeals === 1 ? "" : "s"} awaiting admin approval
              </div>
            </div>
            <div className="card p-5">
              <div className="text-[13px] font-medium text-fg-muted">Paid to date</div>
              <div className="hero-number mt-1">{money(data.commission.paid, cur)}</div>
              <div className="num mt-1 text-[13px] text-fg-muted">
                {data.commission.lastPaidAt ? `Last payout ${money(data.commission.lastPayout, cur)} on ${format(data.commission.lastPaidAt, "d MMM")}` : "No payouts yet"}
              </div>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            <Kpi label="My leads" value={data.kpis.myLeads.toLocaleString("en-IN")} foot={<span className="caption num">+{data.kpis.newLeads} new {range.label}</span>} />
            <Kpi label="Contacted" value={data.kpis.contacted} foot={<Delta now={data.kpis.contacted} prev={data.kpis.contactedPrev} label="" />} />
            <Kpi label="Meetings booked" value={data.kpis.booked} foot={<Delta now={data.kpis.booked} prev={data.kpis.bookedPrev} label="" />} />
            <Kpi label="Deals won" value={data.kpis.won} foot={<Delta now={data.kpis.won} prev={data.kpis.wonPrev} label="" />} />
            <Kpi label="Meeting → won rate" value={pct(data.kpis.winRate)} foot={<Delta now={data.kpis.winRate} prev={data.kpis.winRatePrev} label={data.kpis.booked ? "No meetings last period" : "Book meetings to see your rate"} points />} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="My pipeline" meta={`${data.kpis.myLeads.toLocaleString("en-IN")} leads`} action={<PanelLink href="/leads">Open leads table →</PanelLink>}>
              {data.kpis.myLeads === 0 ? (
                <EmptyState title="No leads yet" hint="Claim an unassigned lead to start your pipeline." action={<Button asChild variant="primary"><a href="/leads">Browse unassigned</a></Button>} />
              ) : (
                <BarList rows={data.pipeline.map((p) => ({ id: p.statusId, name: p.name, color: p.color, count: p.count }))} />
              )}
            </Panel>
            <Panel title="Upcoming meetings" action={<PanelLink href="/calendar">Calendar →</PanelLink>}>
              {data.upcoming.length === 0 ? (
                <EmptyState icon={<CalendarCheck />} title="Nothing booked" hint="Open a lead and click Request meeting when a client agrees to a call." />
              ) : (
                <ul className="divide-y divide-[var(--surface-muted)]">
                  {data.upcoming.map((m) => (
                    <li key={m._id} className="flex items-center gap-3 py-2.5">
                      <div className="w-[64px] shrink-0 rounded-[8px] bg-surface-muted px-2 py-1.5 text-center">
                        <div className="text-[12px] font-medium text-fg-muted">{timeIn(m.startUtc, viewer, "EEE d")}</div>
                        <div className="num text-[13px] font-semibold">{timeIn(m.startUtc, viewer, "h:mm a")}</div>
                      </div>
                      <button className="min-w-0 flex-1 text-left" onClick={() => open(m.leadId)}>
                        <div className="truncate text-[14px] font-medium">{m.leadName}</div>
                        <div className="caption num truncate">
                          {[m.city ?? cityFromTz(m.clientTimeZone), m.country].filter(Boolean).join(", ")} · client time {timeIn(m.startUtc, m.clientTimeZone)} {tzLabel(m.clientTimeZone)}
                        </div>
                      </button>
                      {m.meetLink ? (
                        <Button asChild size="sm" variant="soft">
                          <a href={m.meetLink} target="_blank" rel="noreferrer">
                            <Video /> Join
                          </a>
                        </Button>
                      ) : (
                        <Button size="sm" variant="warning" onClick={() => setLinkFor(m)}>
                          Add Meet link
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Follow-ups due" meta={data.followUpsDue || undefined}>
              {data.followUps.length === 0 ? (
                <EmptyState icon={<ListTodo />} title="All caught up" hint="Set a follow-up date from a lead’s note box." />
              ) : (
                <ul className="divide-y divide-[var(--surface-muted)]">
                  {data.followUps.map((l) => (
                    <li key={l._id}>
                      <button className="flex w-full items-start gap-2 py-2 text-left" onClick={() => open(l._id)}>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-medium">{l.name}</div>
                          <div className="caption line-clamp-1">{l.lastNote ?? l.company ?? "No note"}</div>
                        </div>
                        <StatusPill statusId={l.statusId} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Going cold" meta="no activity 7+ days">
              {data.cold.length === 0 ? (
                <EmptyState icon={<Flame />} title="Nothing going cold" hint="Every open lead was touched this week." />
              ) : (
                <ul className="divide-y divide-[var(--surface-muted)]">
                  {data.cold.map((l) => (
                    <li key={l._id}>
                      <button className="flex w-full items-center gap-2 py-2 text-left" onClick={() => open(l._id)}>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-medium">{l.name}</div>
                          <div className="caption truncate">{l.company ?? "—"}</div>
                        </div>
                        <span className="num text-[13px] font-semibold text-danger">{Math.floor((Date.now() - l.lastActivityAt) / 86400000)} days</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Recent activity">
              {data.recent.length === 0 ? (
                <PanelSkeleton rows={0} />
              ) : (
                <ul className="space-y-2.5">
                  {data.recent.map((a) => (
                    <li key={a._id} className="flex items-start gap-2 text-[14px]">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: ACTIVITY_DOT[a.type] }} aria-hidden />
                      <button className="min-w-0 flex-1 text-left" onClick={() => open(a.leadId)}>
                        <span className="text-fg-secondary">{describe(a).replace(/^./, (c) => c.toUpperCase())}</span> <span className="font-medium">· {a.leadName}</span>
                      </button>
                      <span className="caption shrink-0">{relative(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {data.recent.length === 0 ? <p className="caption">Your actions show up here.</p> : null}
            </Panel>
          </div>
        </div>
      )}
      <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} />
      <Dialog open={!!linkFor} onOpenChange={(o) => !o && setLinkFor(null)}>
        {linkFor ? (
          <DialogContent title="Add Google Meet link" description="Create the meeting in Google Calendar/Meet, then paste the link here.">
            <MeetLinkForm meeting={linkFor} onSaved={() => setLinkFor(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </Page>
  );
}
