"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CalendarPlus, Video } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { MEET_LINK_RE } from "@convex/lib/shared";
import { useApp } from "@/components/app-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/misc";
import { browserTz, timeIn, tzLabel } from "@/lib/format";
import { errorMessage } from "@/lib/utils";
import { MeetingDialog } from "./slot-picker";

export const MEETING_STATUS: Record<Doc<"meetings">["status"], { label: string; color: string }> = {
  requested: { label: "Requested", color: "#F59E0B" },
  scheduled: { label: "Scheduled", color: "#8B5CF6" },
  completed: { label: "Completed", color: "#16A34A" },
  no_show: { label: "No-show", color: "#E11D48" },
  cancelled: { label: "Cancelled", color: "#A1A1AA" },
};

export function MeetLinkForm({ meeting, onSaved }: { meeting: Doc<"meetings">; onSaved?: () => void }) {
  const setLink = useMutation(api.meetings.setLink);
  const [link, setLinkVal] = useState(meeting.meetLink ?? "");
  const valid = MEET_LINK_RE.test(link.trim());
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return toast.error("Use a link like https://meet.google.com/abc-defg-hij");
        try {
          await setLink({ id: meeting._id, meetLink: link.trim() });
          toast.success("Meet link saved — meeting scheduled");
          onSaved?.();
        } catch (err) {
          toast.error(errorMessage(err));
        }
      }}
    >
      <Input
        aria-label="Google Meet link"
        aria-invalid={!!link && !valid}
        placeholder="https://meet.google.com/xxx-xxxx-xxx"
        value={link}
        onChange={(e) => setLinkVal(e.target.value)}
        className={link && !valid ? "border-danger" : ""}
      />
      <Button type="submit" variant={meeting.meetLink ? "outline" : "warning"} disabled={!valid}>
        {meeting.meetLink ? "Update" : "Save link"}
      </Button>
    </form>
  );
}

export function MeetingSection({ lead, canEdit }: { lead: Doc<"leads">; canEdit: boolean }) {
  const { settings } = useApp();
  const meetings = useQuery(api.meetings.forLead, { leadId: lead._id });
  const setOutcome = useMutation(api.meetings.setOutcome);
  const [dialog, setDialog] = useState<"new" | Doc<"meetings"> | null>(null);
  const viewer = browserTz();
  const active = meetings?.find((m) => m.status === "requested" || m.status === "scheduled");
  const past = meetings?.filter((m) => m !== active) ?? [];

  const outcome = async (m: Doc<"meetings">, status: "completed" | "no_show" | "cancelled") => {
    try {
      await setOutcome({ id: m._id, status });
      toast.success(`Meeting marked ${MEETING_STATUS[status].label.toLowerCase()}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <section aria-label="Meeting" className="rounded-[10px] border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">Meeting</h3>
        {!active && canEdit ? (
          <Button size="sm" variant="primary" onClick={() => setDialog("new")}>
            <CalendarPlus /> Request meeting
          </Button>
        ) : null}
      </div>
      {!meetings ? null : active ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Pill color={MEETING_STATUS[active.status].color}>{MEETING_STATUS[active.status].label}</Pill>
            <span className="num text-[13px] font-medium">{timeIn(active.startUtc, viewer, "EEE d MMM · h:mm a")} {tzLabel(viewer)}</span>
          </div>
          <div className="caption num">
            Client: {timeIn(active.startUtc, active.clientTimeZone, "EEE h:mm a")} {tzLabel(active.clientTimeZone)} ({active.clientTimeZone.replace(/_/g, " ")})
            {viewer !== settings.teamTimeZone ? ` · Team: ${timeIn(active.startUtc, settings.teamTimeZone)} ${tzLabel(settings.teamTimeZone)}` : ""}
          </div>
          {active.notes ? <p className="text-[13px] text-fg-secondary">{active.notes}</p> : null}
          {active.meetLink ? (
            <Button asChild variant="soft" size="sm">
              <a href={active.meetLink} target="_blank" rel="noreferrer">
                <Video /> Join Meet
              </a>
            </Button>
          ) : null}
          {canEdit ? (
            <>
              <MeetLinkForm key={active._id + (active.meetLink ?? "")} meeting={active} />
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => outcome(active, "completed")} disabled={active.startUtc > Date.now()}>
                  Completed
                </Button>
                <Button size="sm" onClick={() => outcome(active, "no_show")} disabled={active.startUtc > Date.now()}>
                  No-show
                </Button>
                <Button size="sm" onClick={() => setDialog(active)}>
                  Reschedule
                </Button>
                <Button size="sm" variant="danger" onClick={() => outcome(active, "cancelled")}>
                  Cancel
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <p className="caption">{canEdit ? "No meeting yet. When the client agrees to a call, request a slot." : "No meeting booked."}</p>
      )}
      {past.length ? (
        <ul className="mt-3 space-y-1 border-t border-border pt-2">
          {past.map((m) => (
            <li key={m._id} className="flex items-center justify-between text-[12px] text-fg-muted">
              <span className="num">{timeIn(m.startUtc, viewer, "d MMM yyyy · h:mm a")}</span>
              <Pill color={MEETING_STATUS[m.status].color}>{MEETING_STATUS[m.status].label}</Pill>
            </li>
          ))}
        </ul>
      ) : null}
      {dialog ? <MeetingDialog open onOpenChange={(o) => !o && setDialog(null)} lead={lead} meeting={dialog === "new" ? undefined : dialog} /> : null}
    </section>
  );
}
