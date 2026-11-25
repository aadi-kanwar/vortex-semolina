"use client";
import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { inputClass } from "@/components/ui/input";
import { allTimezones, tzLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TimezoneSelect({ value, onChange, id }: { value: string; onChange: (tz: string) => void; id?: string }) {
  const [open, setOpen] = useState(false);
  const zones = useMemo(() => allTimezones(), []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger id={id} className={cn(inputClass, "flex items-center justify-between text-left")} aria-label="Client time zone">
        <span className="truncate">
          {value.replace(/_/g, " ")} <span className="text-fg-muted">· {tzLabel(value)}</span>
        </span>
        <ChevronsUpDown className="size-4 text-fg-muted" />
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command label="Time zone">
          <Command.Input placeholder="Search city or zone…" className="h-9 w-full border-b border-border bg-transparent px-3 text-[13px] outline-none" />
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="caption p-2">No match.</Command.Empty>
            {zones.map((z) => (
              <Command.Item
                key={z}
                value={z}
                onSelect={() => {
                  onChange(z);
                  setOpen(false);
                }}
                className="flex cursor-default items-center justify-between rounded-[6px] px-2 py-1.5 text-[13px] data-[selected=true]:bg-surface-muted"
              >
                <span>{z.replace(/_/g, " ")}</span>
                <span className="caption">{tzLabel(z)}</span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
