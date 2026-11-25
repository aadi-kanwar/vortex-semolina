"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInMinutes,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Video } from "lucide-react";
import { api } from "@convex/_generated/api";
import { useApp } from "@/components/app-data";
import { Page, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/input";
import { Avatar, Pill, Segmented, Skeleton } from "@/components/ui/misc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLeadPanel } from "@/hooks/use-lead-panel";
import { useLocalState } from "@/hooks/use-local-state";
import { browserTz, timeIn, tzLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MEETING_STATUS, MeetLinkForm } from "./meeting-section";

type Mode = "day" | "week" | "month";
type Ev = FunctionReturnType<typeof api.meetings.listRange>[number];
type StatusKey = Ev["status"];

const HOUR_PX = 72;
const ALL_STATUSES: StatusKey[] = ["requested", "scheduled", "completed", "no_show", "cancelled"];

function eventClass(s: StatusKey) {
  if (s === "requested") return "ev-requested";
  if (s === "scheduled") return "ev-scheduled";
  return cn("ev-closed", `ev-${s}`);
}

function EventPopover({ ev, children }: { ev: Ev; children: React.ReactNode }) {
  const { userById } = useApp();
  const { open } = useLeadPanel();
  const owner = userById.get(ev.ownerId);
  const viewer = browserTz();
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 space-y-3 p-4" side="right" align="start">
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold">{ev.leadName}</div>
              <div className="caption truncate">{[ev.company, ev.country].filter(Boolean).join(" · ")}</div>
            </div>
            <Pill color={MEETING_STATUS[ev.status].color}>{MEETING_STATUS[ev.status].label}</Pill>
          </div>
        </div>
        <div className="space-y-1 text-[14px]">
          <div className="num">
            {timeIn(ev.startUtc, viewer, "EEE d MMM · h:mm")}–{timeIn(ev.endUtc, viewer, "h:mm a")} <span className="text-fg-muted">{tzLabel(viewer)}</span>
          </div>
          <div className="caption num">
            Client: {timeIn(ev.startUtc, ev.clientTimeZone, "EEE h:mm a")} {tzLabel(ev.clientTimeZone)} · {ev.clientTimeZone.replace(/_/g, " ")}
          </div>
          <div className="flex items-center gap-1.5 pt-1">
            <Avatar id={ev.ownerId} name={owner?.name} url={owner?.avatarUrl} size={20} />
            <span className="text-[14px]">{owner?.name ?? "Unknown"}</span>
          </div>
          {ev.notes ? <p className="pt-1 text-[13px] text-fg-secondary">{ev.notes}</p> : null}
        </div>
        {ev.canEdit && ev.status === "requested" ? <MeetLinkForm meeting={ev} /> : null}
        <div className="flex gap-2">
          {ev.meetLink && (ev.status === "scheduled" || ev.status === "requested") ? (
            <Button asChild variant="soft" size="sm">
              <a href={ev.meetLink} target="_blank" rel="noreferrer">
                <Video /> Join Meet
              </a>
            </Button>
          ) : null}
          {ev.canOpenLead ? (
            <Button size="sm" variant="ghost" onClick={() => open(ev.leadId)}>
              Open lead →
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EventBlock({ ev, style }: { ev: Ev; style: React.CSSProperties }) {
  const { userById } = useApp();
  const owner = userById.get(ev.ownerId);
  const viewer = browserTz();
  return (
    <EventPopover ev={ev}>
      <button
        style={{ ...style, "--ev": MEETING_STATUS[ev.status].color } as React.CSSProperties}
        title={`${ev.leadName} · client time ${timeIn(ev.startUtc, ev.clientTimeZone)} ${tzLabel(ev.clientTimeZone)}`}
        aria-label={`${ev.leadName}, ${MEETING_STATUS[ev.status].label}, ${timeIn(ev.startUtc, viewer)}`}
        className={cn("absolute overflow-hidden rounded-[6px] px-1.5 py-0.5 text-left text-[12px] leading-tight", eventClass(ev.status))}
      >
        <div className="flex items-center gap-1">
          <Avatar id={ev.ownerId} name={owner?.name} url={owner?.avatarUrl} size={14} />
          <span className="ev-title truncate font-semibold">{ev.leadName}</span>
        </div>
        <div className="num truncate opacity-80">
          {timeIn(ev.startUtc, viewer)}
          {ev.company ? ` · ${ev.company}` : ""}
        </div>
      </button>
    </EventPopover>
  );
}

function TimeGrid({ days, events }: { days: Date[]; events: Ev[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  // Scroll to 8 AM, or earlier if this range has an earlier meeting.
  const firstHour = Math.min(8, ...events.filter((e) => days.some((d) => isSameDay(new Date(e.startUtc), d))).map((e) => new Date(e.startUtc).getHours()));
  useEffect(() => {
    scroller.current?.scrollTo({ top: firstHour * HOUR_PX - 8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0] && +days[0], days.length]);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="card overflow-hidden">
      <div className="grid border-b border-border" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
        <div />
        {days.map((d) => {
          const today = isSameDay(d, now);
          return (
            <div key={+d} className="border-l border-border px-2 py-2 text-center">
              <div className="caption">{format(d, "EEE")}</div>
              <div className={cn("num mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-[15px] font-semibold", today && "bg-primary text-primary-fg")}>{format(d, "d")}</div>
            </div>
          );
        })}
      </div>
      <div ref={scroller} className="max-h-[calc(100dvh-280px)] min-h-[420px] overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))`, height: 24 * HOUR_PX }}>
          <div className="relative">
            {hours.map((h) => (
              <div key={h} className="caption num absolute right-2 -translate-y-1/2" style={{ top: h * HOUR_PX }}>
                {h === 0 ? "" : format(new Date(2000, 0, 1, h), "h a")}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const today = isSameDay(d, now);
            const dayEvents = events.filter((e) => isSameDay(new Date(e.startUtc), d));
            // Side-by-side layout for events sharing a slot (capacity > 1).
            const groups = new Map<number, Ev[]>();
            for (const e of dayEvents) groups.set(e.startUtc, [...(groups.get(e.startUtc) ?? []), e]);
            return (
              <div key={+d} className={cn("relative border-l border-border", today && "bg-accent-soft/30")}>
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-[var(--surface-muted)]" style={{ top: h * HOUR_PX }} />
                ))}
                {[...groups.values()].flatMap((g) =>
                  g.map((e, i) => {
                    const top = (differenceInMinutes(e.startUtc, startOfDay(d)) / 60) * HOUR_PX;
                    const h = Math.max(22, ((e.endUtc - e.startUtc) / 3600000) * HOUR_PX - 2);
                    return <EventBlock key={e._id} ev={e} style={{ top: top + 1, height: h, left: `calc(${(i / g.length) * 100}% + 2px)`, width: `calc(${100 / g.length}% - 4px)` }} />;
                  }),
                )}
                {today ? (
                  <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: (differenceInMinutes(now, startOfDay(d)) / 60) * HOUR_PX }} aria-label="Now">
                    <div className="relative h-0.5 bg-danger">
                      <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-danger" />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ anchor, events, onPickDay }: { anchor: Date; events: Ev[]; onPickDay: (d: Date) => void }) {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const now = new Date();
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {days.slice(0, 7).map((d) => (
          <div key={+d} className="caption px-2 py-2 text-center">
            {format(d, "EEE")}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const evs = events.filter((e) => isSameDay(new Date(e.startUtc), d)).sort((a, b) => a.startUtc - b.startUtc);
          const today = isSameDay(d, now);
          return (
            <div key={+d} className={cn("min-h-[96px] border-b border-l border-border p-1.5 [&:nth-child(7n+1)]:border-l-0", !isSameMonth(d, anchor) && "bg-background", today && "bg-accent-soft/30")}>
              <button onClick={() => onPickDay(d)} className={cn("num mb-1 grid size-6 place-items-center rounded-full text-[13px] font-medium hover:bg-surface-muted", today && "bg-primary text-primary-fg hover:bg-primary", !isSameMonth(d, anchor) && "text-fg-muted")}>
                {format(d, "d")}
              </button>
              <div className="space-y-0.5">
                {evs.slice(0, 3).map((e) => (
                  <EventPopover key={e._id} ev={e}>
                    <button style={{ "--ev": MEETING_STATUS[e.status].color } as React.CSSProperties} className={cn("block w-full truncate rounded-[4px] px-1 text-left text-[12px]", eventClass(e.status))}>
                      <span className="num">{timeIn(e.startUtc, browserTz(), "h:mm")}</span> <span className="ev-title">{e.leadName}</span>
                    </button>
                  </EventPopover>
                ))}
                {evs.length > 3 ? (
                  <button className="caption px-1 hover:text-fg" onClick={() => onPickDay(d)}>
                    +{evs.length - 3} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarPage() {
  const { me, activeUsers } = useApp();
  const [mode, setMode] = useLocalState<Mode>("cal.mode", "week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [who, setWho] = useLocalState<string>("cal.who", "all");
  const [shown, setShown] = useLocalState<StatusKey[]>("cal.statuses", ["requested", "scheduled", "completed", "no_show"]);
  const viewer = browserTz();

  const { start, end, days, title } = useMemo(() => {
    if (mode === "day") {
      const s = startOfDay(anchor);
      return { start: s, end: addDays(s, 1), days: [s], title: format(s, "EEEE, d MMMM yyyy") };
    }
    if (mode === "week") {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      const e = endOfWeek(anchor, { weekStartsOn: 1 });
      return { start: s, end: addDays(s, 7), days: Array.from({ length: 7 }, (_, i) => addDays(s, i)), title: isSameMonth(s, e) ? format(s, "MMMM yyyy") : `${format(s, "MMM")} – ${format(e, "MMM yyyy")}` };
    }
    const s = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    return { start: s, end: addDays(s, 42), days: [], title: format(anchor, "MMMM yyyy") };
  }, [mode, anchor]);

  const data = useQuery(api.meetings.listRange, { startUtc: +start, endUtc: +end });
  const events = useMemo(
    () => (data ?? []).filter((e) => shown.includes(e.status) && (who === "all" ? true : who === "mine" ? e.ownerId === me._id : e.ownerId === who)),
    [data, shown, who, me._id],
  );
  const step = (dir: 1 | -1) => setAnchor((a) => (mode === "day" ? addDays(a, dir) : mode === "week" ? addWeeks(a, dir) : addMonths(a, dir)));

  return (
    <Page>
      <PageHeader title="Calendar" subtitle={`Shared onboarding calendar · times in ${viewer.replace(/_/g, " ")} (${tzLabel(viewer)})`}>
        <Segmented<Mode>
          ariaLabel="Calendar view"
          value={mode}
          onChange={setMode}
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
          ]}
        />
      </PageHeader>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft />
          </Button>
          <Button onClick={() => setAnchor(new Date())}>Today</Button>
          <Button size="icon" onClick={() => step(1)} aria-label="Next">
            <ChevronRight />
          </Button>
        </div>
        <h2 className="text-[16px] font-semibold">{title}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <NativeSelect aria-label="Whose meetings" value={who} onChange={(e) => setWho(e.target.value)} className="w-44">
            <option value="all">All meetings</option>
            <option value="mine">My meetings</option>
            {activeUsers
              .filter((u) => u._id !== me._id)
              .map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                </option>
              ))}
          </NativeSelect>
          <fieldset className="flex flex-wrap items-center gap-3" aria-label="Statuses">
            {ALL_STATUSES.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-[13px] text-fg-secondary">
                <Checkbox checked={shown.includes(s)} onCheckedChange={(c) => setShown(c ? [...shown, s] : shown.filter((x) => x !== s))} />
                {MEETING_STATUS[s].label}
              </label>
            ))}
          </fieldset>
        </div>
      </div>
      {data === undefined ? (
        <Skeleton className="h-[520px] rounded-[12px]" />
      ) : mode === "month" ? (
        <MonthGrid
          anchor={anchor}
          events={events}
          onPickDay={(d) => {
            setAnchor(d);
            setMode("day");
          }}
        />
      ) : (
        <TimeGrid days={days} events={events} />
      )}
      <div className="caption mt-3 flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="ev-requested inline-block h-3 w-5 rounded-[3px]" style={{ "--ev": MEETING_STATUS.requested.color } as React.CSSProperties} /> Requested (needs Meet link)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="ev-scheduled inline-block h-3 w-5 rounded-[3px]" style={{ "--ev": MEETING_STATUS.scheduled.color } as React.CSSProperties} /> Scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="ev-closed inline-block h-3 w-5 rounded-[3px]" /> Completed / cancelled
        </span>
      </div>
    </Page>
  );
}
