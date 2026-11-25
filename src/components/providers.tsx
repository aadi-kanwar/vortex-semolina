"use client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not set. Locally: run `npx convex dev`. On Vercel: set CONVEX_DEPLOY_KEY and build with `npm run vercel-build` (= convex deploy --cmd 'npm run build').",
  );
}
const convex = new ConvexReactClient(url);

// DECISION: Convex Auth's client provider (tokens in localStorage) rather than
// its Next.js cookie/middleware variant: every page here is client-rendered
// behind <Authenticated>, so there's nothing to protect server-side.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", fontSize: 13 },
            }}
          />
        </TooltipProvider>
      </ThemeProvider>
    </ConvexAuthProvider>
  );
}
