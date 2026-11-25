"use client";
import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Segmented } from "@/components/ui/misc";
import { useApp } from "@/components/app-data";

type Pref = "light" | "dark" | "system";

/** Applies the saved Convex preference once per load; localStorage (next-themes) prevents the flash. */
export function ThemeSync() {
  const { me } = useApp();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const applied = useRef(false);
  const save = useMutation(api.users.setTheme);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    const pref = me.themePreference ?? "system";
    if (pref !== theme) setTheme(pref);
  }, [me.themePreference, setTheme, theme]);

  // ⌘⇧L / Ctrl⇧L toggles light ↔ dark.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        const next: Pref = resolvedTheme === "dark" ? "light" : "dark";
        setTheme(next);
        save({ theme: next }).catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resolvedTheme, save, setTheme]);
  return null;
}

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const save = useMutation(api.users.setTheme);
  const value = (theme as Pref) ?? "system";
  return (
    <Segmented<Pref>
      ariaLabel="Theme"
      value={value}
      className="w-full [&>button]:flex-1"
      onChange={(t) => {
        setTheme(t);
        save({ theme: t }).catch(() => {});
      }}
      options={[
        { value: "light", label: <Sun />, title: "Light" },
        { value: "dark", label: <Moon />, title: "Dark (⌘⇧L)" },
        { value: "system", label: <Monitor />, title: "System" },
      ]}
    />
  );
}
