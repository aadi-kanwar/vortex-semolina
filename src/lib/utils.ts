import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ConvexError } from "convex/values";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Human message from a Convex/JS error. */
export function errorMessage(e: unknown): string {
  if (e instanceof ConvexError) return typeof e.data === "string" ? e.data : "Something went wrong";
  if (e instanceof Error) {
    const m = e.message.match(/Uncaught ConvexError: (.*?)(\n|$)/);
    return m ? m[1] : e.message;
  }
  return "Something went wrong";
}
