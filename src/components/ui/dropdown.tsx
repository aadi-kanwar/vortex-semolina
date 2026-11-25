"use client";
import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuSub = M.Sub;

export function DropdownMenuContent({ className, sideOffset = 6, align = "start", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={sideOffset} align={align} className={cn("card z-50 min-w-[180px] p-1 data-[state=open]:animate-in data-[state=open]:fade-in-0", className)} {...props} />
    </M.Portal>
  );
}

const itemClass =
  "flex cursor-default select-none items-center gap-2 rounded-[6px] px-2 py-1.5 text-[14px] text-fg-secondary outline-none data-[highlighted]:bg-surface-muted data-[highlighted]:text-fg data-[disabled]:opacity-50 [&_svg]:size-4";

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return <M.Item className={cn(itemClass, className)} {...props} />;
}
export function DropdownMenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem className={cn(itemClass, "pl-7 relative", className)} {...props}>
      <M.ItemIndicator className="absolute left-2 text-primary">✓</M.ItemIndicator>
      {children}
    </M.CheckboxItem>
  );
}
export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 py-1 text-[12px] font-semibold uppercase tracking-wide text-fg-muted", className)} {...props} />;
}
export function DropdownMenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}
export function DropdownMenuSubTrigger({ className, ...props }: React.ComponentProps<typeof M.SubTrigger>) {
  return <M.SubTrigger className={cn(itemClass, className)} {...props} />;
}
export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent className={cn("card z-50 min-w-[180px] max-h-[320px] overflow-y-auto p-1", className)} {...props} />
    </M.Portal>
  );
}
