import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-8 w-full rounded-[8px] border border-border bg-surface px-2.5 text-[13px] text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputClass, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(inputClass, "h-auto min-h-[72px] py-2 leading-5", className)} {...props} />
));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-[12px] font-medium text-fg-secondary", className)} {...props} />;
}

export function NativeSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputClass, "pr-7", className)} {...props} />;
}
