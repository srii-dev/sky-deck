import type { LegalPage } from "@/lib/legal-content";
import { SiteFooter, SiteHeader } from "./SiteChrome";

/* One text page (Phase 16e) inside the site header and footer. */
export function LegalPageView({ page }: { page: LegalPage }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 pb-10">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide">{page.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">Last changed {page.updated}</p>
        </div>
        {page.sections.map((s) => (
          <section key={s.heading} className="space-y-2">
            <h2 className="font-display text-lg font-semibold tracking-wide">{s.heading}</h2>
            {s.paragraphs.map((p) => (
              <p key={p} className="text-sm leading-relaxed text-foreground/90">
                {p}
              </p>
            ))}
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
