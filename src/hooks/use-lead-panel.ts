"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** The lead slide-over is driven by `?lead=<id>` so any screen can deep-link to it. */
export function useLeadPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const leadId = params.get("lead");
  const open = useCallback(
    (id: string) => {
      const p = new URLSearchParams(params.toString());
      p.set("lead", id);
      router.push(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const close = useCallback(() => {
    const p = new URLSearchParams(params.toString());
    p.delete("lead");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);
  return { leadId, open, close };
}
