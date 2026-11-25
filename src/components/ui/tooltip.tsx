"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tooltip";

export const TooltipProvider = T.Provider;

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content sideOffset={6} className="z-50 rounded-[6px] bg-fg px-2 py-1 text-[12px] text-background">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
