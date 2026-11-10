import { Link } from "@tanstack/react-router";
import { Plane } from "lucide-react";

import { APP_NAME, APP_TAGLINE, REPO_URL } from "@/config/brand";
import { LEGAL_PAGES } from "@/lib/legal-content";
import { MAP_ACTIONS } from "@/lib/site-meta";
import { FEEDBACK_URL, SITE_PAGES } from "@/lib/site-pages";
import { cn } from "@/lib/utils";
import { CreditsButton } from "./CreditsDialog";

/*
 * Header and footer for the pages that are not the map (Phase 15d). The map page keeps its own compact bar, because
 * it fills the whole screen. Navigation lists only pages that exist.
 */

const NAV: { to: "/" | "/inspector" | "/help"; label: string }[] = [
  { to: "/", label: "Map" },
  { to: "/inspector", label: "Inspector" },
  { to: "/help", label: "Help" },
];

export function SiteHeader({ className }: { className?: string }) {
  return (
    <header className={cn("border-b border-border bg-card/60", className)}>
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link to="/" className="flex items-center gap-2" aria-label={APP_NAME + " home"}>
          <span className="flex size-8 items-center justify-center rounded-md border border-border bg-background/60 text-primary">
            <Plane className="size-4" aria-hidden />
          </span>
          <span className="font-display text-lg font-bold tracking-wide text-foreground">
            {APP_NAME}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">{APP_TAGLINE}</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent/15 hover:text-foreground"
              activeProps={{ className: "bg-primary/15 text-foreground", "aria-current": "page" }}
              activeOptions={{ exact: true }}
            >
              {n.label}
            </Link>
          ))}
          {/* Into the map page: its search box and its account dialog live there. */}
          <a
            href={MAP_ACTIONS.search}
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent/15 hover:text-foreground"
          >
            Search
          </a>
          <a
            href={MAP_ACTIONS.account}
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent/15 hover:text-foreground"
          >
            Sign in
          </a>
        </nav>
      </div>
    </header>
  );
}

const FOOTER_LINKS: { path: string; navLabel: string }[] = [
  ...SITE_PAGES.map((p) => ({ path: p.path, navLabel: p.navLabel })),
  { path: "/whats-new", navLabel: "What's new" },
  { path: "/status", navLabel: "Status" },
  ...LEGAL_PAGES.map((p) => ({ path: p.path, navLabel: p.navLabel })),
];

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t border-border bg-card/40", className)}>
      <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-4 text-xs text-muted-foreground">
        <p>
          Positions come from public ADS-B feeds and can be late or wrong. Educational and hobby use
          only, not for navigation or safety decisions.
        </p>
        <nav aria-label="About and legal" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {FOOTER_LINKS.map((p) => (
            <Link
              key={p.path}
              to={p.path as "/about"}
              className="text-primary underline-offset-2 hover:underline"
            >
              {p.navLabel}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <CreditsButton className="text-primary underline-offset-2 hover:underline" />
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            Feedback
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            Source on GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
