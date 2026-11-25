"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useApp } from "@/components/app-data";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { browserTz, timeIn, tzLabel } from "@/lib/format";
import { cn, errorMessage } from "@/lib/utils";
import { TimezoneSelect } from "./timezone-select";

const COUNTRY_TZ: Record<string, string> = {
  australia: "Australia/Sydney",
  au: "Australia/Sydney",
  "united states": "America/New_York",
  usa: "America/New_York",
  us: "America/New_York",
  "united kingdom": "Europe/London",
  uk: "Europe/London",
  germany: "Europe/Berlin",
  de: "Europe/Berlin",
  india: "Asia/Kolkata",
};

/** Next working date (team tz) from today. */
function nextWorkingDate(settings: { teamTimeZone: string; workingHours: { days: number[] }; blockedDates: string[] }) {
  for (let i = 0; i < 21; i++) {
    const t = Date.now() + i * 86400000;
    const date = formatInTimeZone(t, settings.teamTimeZone, "yyyy-MM-dd");
    const dow = Number(formatInTimeZone(t, settings.teamTimeZone, "i")) % 7;
    if (settings.workingHours.days.includes(dow) && !settings.blockedDates.includes(date)) return date;
  }
  return formatInTimeZone(Date.now(), settings.teamTimeZone, "yyyy-MM-dd");
}

export function MeetingDialog({
  open,
  onOpenChange,
  lead,
  meeting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead: Pick<Doc<"leads">, "_id" | "fields">;
  meeting?: Doc<"meetings">; // reschedule when set
}) {
  const { settings } = useApp();
  const team = settings.teamTimeZone;
  const viewer = browserTz();
  const guessTz = COUNTRY_TZ[String(lead.fields.country ?? "").trim().toLowerCase()] ?? "Australia/Sydney";
  const [date, setDate] = useState(() => nextWorkingDate(settings));
  const [clientTz, setClientTz] = useState(meeting?.clientTimeZone ?? guessTz);
  const [slot, setSlot] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const slots = useQuery(api.meetings.slotsForDay, open ? { date, excludeMeetingId: meeting?._id } : "skip");
  const request = useMutation(api.meetings.request);
  const reschedule = useMutation(api.meetings.reschedule);

  useEffect(() => setSlot(null), [date]);
  // Live: if someone else takes the selected slot, drop the selection.
  useEffect(() => {
    if (slot && slots && !slots.find((s) => s.startUtc === slot)?.available) setSlot(null);
  }, [slots, slot]);

  const free = useMemo(() => slots?.filter((s) => s.available) ?? [], [slots]);
  const submit = async () => {
    if (!slot) return;
    setBusy(true);
    try {
      if (meeting) await reschedule({ id: meeting._id, startUtc: slot, clientTimeZone: clientTz });
      else await request({ leadId: lead._id as Id<"leads">, startUtc: slot, clientTimeZone: clientTz, notes: notes || undefined });
      toast.success(meeting ? "Meeting rescheduled" : "Meeting requested — add the Meet link next");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
      setSlot(null); // free slots refresh live from the subscription
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={meeting ? "Reschedule meeting" : "Request meeting"} description={`30-minute slots in team hours (${team.replace(/_/g, " ")}). Only free slots are shown.`} className="max-w-xl">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="mdate">Date ({tzLabel(team)})</Label>
            <Input id="mdate" type="date" value={date} min={formatInTimeZone(Date.now(), team, "yyyy-MM-dd")} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="mtz">Client time zone</Label>
            <TimezoneSelect id="mtz" value={clientTz} onChange={setClientTz} />
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-medium text-fg-secondary">Free slots</span>
            <span className="caption">
              Team {tzLabel(team)} → Client {tzLabel(clientTz)}
              {viewer !== team ? ` · you ${tzLabel(viewer)}` : ""}
            </span>
          </div>
          {!slots ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : free.length === 0 ? (
            <p className="caption rounded-[8px] border border-dashed border-border p-4 text-center">No free slots on this date. Try another day.</p>
          ) : (
            <div role="radiogroup" aria-label="Free slots" className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {free.map((s) => (
                <button
                  key={s.startUtc}
                  role="radio"
                  aria-checked={slot === s.startUtc}
                  onClick={() => setSlot(s.startUtc)}
                  className={cn(
                    "rounded-[8px] border border-border px-2 py-1.5 text-left hover:bg-surface-muted",
                    slot === s.startUtc && "border-primary bg-accent-soft text-accent-soft-fg hover:bg-accent-soft",
                  )}
                >
                  <div className="num text-[14px] font-medium">{timeIn(s.startUtc, team)}</div>
                  <div className="num text-[12px] opacity-80">client {timeIn(s.startUtc, clientTz, "EEE h:mm a")}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        {!meeting ? (
          <div className="mt-4">
            <Label htmlFor="mnotes">Notes (optional)</Label>
            <Textarea id="mnotes" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda, attendees…" />
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!slot || busy} onClick={submit}>
            {meeting ? "Reschedule" : "Request meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
