import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportClientError } from "../lib/report-client-error";
import { installGlobalErrorCapture } from "../lib/global-error-capture";
import { Toaster } from "@/components/ui/sonner";
import { SiteFooter, SiteHeader } from "@/components/skydeck/SiteChrome";
import { useTheme } from "../hooks/use-theme";
import { THEME_INIT_SCRIPT } from "../lib/theme";
import { getSiteUrl } from "../lib/site.functions";
import { APP_NAME } from "../config/brand";
import { canonicalUrl, shareMeta } from "../lib/site-meta";

function NotFoundComponent() {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background">
      <SiteHeader />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="max-w-md text-center">
          <h1 className="text-7xl font-bold text-foreground">404</h1>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="mt-6">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportClientError(error, "root-error-component");
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: () => getSiteUrl(),
  head: ({ loaderData, matches }) => {
    // The root match always has the path "/": the page being shown is the last (deepest) match. A page that does not
    // exist matches only the root, so it gets no canonical or share address.
    const last = matches[matches.length - 1];
    const pathname = last && last.routeId !== "__root__" ? last.pathname : null;
    // The map's title belongs to real pages; an address that matches no page gets its own.
    const title = pathname ? "SkyDeck — Live 3D flight tracker" : "Page not found — SkyDeck";
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "theme-color", content: "#0f161d" },
        { title },
        { name: "description", content: "Live ADS-B flight tracking on a 3D map." },
        { property: "og:title", content: title },
        { property: "og:description", content: "Live ADS-B flight tracking on a 3D map." },
        ...shareMeta({ site: loaderData ?? null, pathname, siteName: APP_NAME }),
      ],
      links: [
        // The two fonts are served from /fonts (see styles.css); the main ones are fetched early.
        {
          rel: "preload",
          href: "/fonts/chakra-petch-400-latin.woff2",
          as: "font",
          type: "font/woff2",
          crossOrigin: "anonymous",
        },
        {
          rel: "preload",
          href: "/fonts/jetbrains-mono-400-latin.woff2",
          as: "font",
          type: "font/woff2",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: appCss,
        },
        { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
        { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
        // Only once the site has an address (SITE_URL); the query string never belongs in it.
        ...(pathname && canonicalUrl(loaderData ?? null, pathname)
          ? [{ rel: "canonical", href: canonicalUrl(loaderData ?? null, pathname)! }]
          : []),
      ],
    };
  },
  scripts: () => [{ children: THEME_INIT_SCRIPT }],
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // The theme script in the head sets the colour scheme and the light class before React starts, so the
    // attributes of <html> legitimately differ from the server HTML (Phase 15c).
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <noscript>
          <p style={{ padding: "1rem", font: "16px system-ui, sans-serif" }}>
            SkyDeck needs JavaScript to draw the live map. Read <a href="/about">About</a> or{" "}
            <a href="/help">Help</a> to see what it does.
          </p>
        </noscript>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const theme = useTheme();
  // Errors that no error boundary sees (event handlers, timers, unhandled promise rejections).
  useEffect(() => installGlobalErrorCapture(window, reportClientError), []);
  // The service worker (public/sw.js) only runs in the built app, never in development.
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* the app works without it */
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster theme={theme.resolved} position="bottom-center" />
    </QueryClientProvider>
  );
}
