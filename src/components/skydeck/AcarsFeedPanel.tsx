import { useEffect, useMemo, useRef, useState } from "react";
import { Download, List, Plane, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ALERT_LABELS,
  cardGradient,
  classifyAcars,
  rowGradient,
  visibleMessages,
  type AcarsAlert,
  type AcarsFilter,
} from "@/lib/acars-alert";
import { MAX_BATCH, type AcarsAiInput } from "@/lib/acars-ai";
import { describeAcarsBatch, explainAcars } from "@/lib/acars-ai.functions";
import type { AcarsMessage } from "@/lib/acars-messages";
import { acarsTitle, buildAcarsReport } from "@/lib/acars-report";
import type { Aircraft } from "@/lib/aircraft";
import { AI_LABEL } from "@/lib/ai-service";
import {
  AIRFRAMES_ATTRIBUTION,
  AIRFRAMES_SITE_URL,
  LATEST_CACHE_MS,
  fetchLatestMessages,
} from "@/lib/airframes-client";
import { cn } from "@/lib/utils";
import { ACARS_DISCLOSURE, ACARS_NOTICE } from "./AcarsMessages";

/*
 * All recent ACARS messages from every aircraft (Airframes, fetched from the browser while the panel is open).
 * Rows: flight number, an alert colour (fixed rules, acars-alert.ts) and a one-line AI headline.
 * Opening a row closes the panel and shows a floating card over the map: the AI's full story, the crew's exact
 * words and a Markdown report of the whole message.
 */

const MAX_KEPT = 300;
/** One AI batch at most this often: stays under the server's 12 a minute per visitor. */
const BATCH_GAP_MS = 8000;
/** After a busy answer the gap doubles up to this, and resets after the next answer. */
const MAX_BUSY_GAP_MS = 120_000;

/** `retry`: the AI was busy, so the message is asked for again in a later batch. */
type Brief =
  | { state: "pending" }
  | { state: "done"; text: string }
  | { state: "failed"; error: string; retry?: boolean };

const ALERT_RANK: Record<AcarsAlert, number> = {
  emergency: 0,
  warning: 1,
  weather: 2,
  position: 3,
  routine: 4,
};

const FILTERS: { id: AcarsFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "interesting", label: "Interesting" },
  { id: "breaking", label: "Breaking" },
];

function aiInput(m: AcarsMessage): AcarsAiInput {
  return {
    id: m.id,
    flight: m.flight?.slice(0, 16) ?? null,
    tail: m.tail?.slice(0, 16) ?? null,
    label: m.label?.slice(0, 8) ?? null,
    route: m.departing && m.destination ? (m.departing + "-" + m.destination).slice(0, 24) : null,
    sourceType: m.sourceType?.slice(0, 16) ?? null,
    text: m.text.slice(0, 1100),
  };
}

function timeAgo(ms: number | null, now: number): string {
  if (ms == null) return "";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return s + " s ago";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  return Math.round(s / 3600) + " h ago";
}

function subtitle(m: AcarsMessage): string {
  return [
    m.departing && m.destination ? m.departing + " → " + m.destination : null,
    m.tail && m.flight ? m.tail : null,
    m.label ? "label " + m.label : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function AlertTag({ alert }: { alert: AcarsAlert }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-wider text-white/70">
      {ALERT_LABELS[alert]}
    </span>
  );
}

function BriefText({ brief, m }: { brief: Brief | undefined; m: AcarsMessage }) {
  if (!m.text) return <p className="text-xs italic text-white/70">No message text.</p>;
  if (brief?.state === "pending") {
    return <p className="animate-pulse text-xs italic text-white/70">Describing…</p>;
  }
  // Not described (yet, or the AI failed): the raw text, so every row says something.
  if (!brief || brief.state === "failed") {
    return <p className="line-clamp-2 font-mono text-[11px] text-white/70">{m.text}</p>;
  }
  return <p className="text-[13px] leading-snug text-white/90">{brief.text}</p>;
}

/** Markdown source shown as a file. Every line is rendered as plain text; only its colour depends on the syntax. */
function MarkdownFile({ source, name }: { source: string; name: string }) {
  let inCode = false;
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/60">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[11px] text-white/70">
        <span className="font-mono">{name}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-amber-300 hover:underline"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([source], { type: "text/markdown" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download className="h-3 w-3" aria-hidden /> Download .md
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11.5px] leading-relaxed">
        {source.split("\n").map((line, i) => {
          const fence = line.startsWith("```");
          if (fence) inCode = !inCode;
          const cls = fence
            ? "text-white/70"
            : inCode
              ? "text-emerald-300"
              : line.startsWith("# ")
                ? "font-bold text-amber-300"
                : line.startsWith("## ")
                  ? "font-semibold text-sky-300"
                  : line.startsWith("> ")
                    ? "text-amber-200/90"
                    : "text-white/75";
          return (
            <span key={i} className={"block " + cls}>
              {line || " "}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

type Detail =
  | { state: "loading" }
  | { state: "done"; text: string }
  | { state: "failed"; error: string; busy?: boolean };

/** The opened message, floating over the map (not modal: the map stays visible and usable). */
function MessageCard({
  m,
  alert,
  brief,
  onClose,
  onBackToList,
  onShowOnMap,
}: {
  m: AcarsMessage;
  alert: AcarsAlert;
  brief: Brief | undefined;
  onClose: () => void;
  onBackToList: () => void;
  onShowOnMap: (() => void) | null;
}) {
  const [detail, setDetail] = useState<Detail>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    if (!m.text) {
      setDetail({ state: "failed", error: "This message has no text to explain." });
      return;
    }
    setDetail({ state: "loading" });
    explainAcars({ data: { ...aiInput(m), alert } }).then(
      (r) =>
        live &&
        setDetail(
          r.ok
            ? { state: "done", text: r.value }
            : { state: "failed", error: r.error, busy: r.busy === true },
        ),
      () => live && setDetail({ state: "failed", error: "AI description unavailable." }),
    );
    return () => {
      live = false;
    };
    // `alert` follows the live squawk; a change there should not ask the AI again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, attempt]);
  // Opened from the list by keyboard, focus would otherwise drop to the page body when the list closes.
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => cardRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const report = buildAcarsReport(
    m,
    alert,
    brief?.state === "done" ? brief.text : null,
    detail.state === "done" ? detail.text : null,
    {
      brief: brief?.state === "pending" || (!brief && !!m.text),
      detail: detail.state === "loading",
    },
  );
  const fileName = "acars-" + acarsTitle(m).replace(/[^A-Za-z0-9-]/g, "") + "-" + m.id + ".md";

  return (
    <section
      ref={cardRef}
      tabIndex={-1}
      role="region"
      aria-label={"ACARS message from " + acarsTitle(m)}
      className="force-dark pointer-events-auto fixed inset-x-3 bottom-3 z-30 flex outline-none max-h-[42dvh] flex-col md:max-h-[min(72dvh,680px)] overflow-hidden rounded-2xl border border-white/10 bg-black/90 text-white shadow-2xl backdrop-blur-md md:inset-x-auto md:bottom-6 md:left-28 md:w-[520px]"
      style={{ backgroundImage: cardGradient(alert) }}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <AlertTag alert={alert} />
          <h2 className="truncate font-mono text-2xl font-semibold tracking-tight text-white">
            {acarsTitle(m)}
          </h2>
          {subtitle(m) && <p className="text-xs text-white/70">{subtitle(m)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/70"
            aria-label="Back to all messages"
            title="All messages"
            onClick={onBackToList}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/70"
            aria-label="Close message"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-2">
        <BriefText brief={brief} m={m} />
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-white/70">
            What happened · {AI_LABEL}
          </p>
          {detail.state === "loading" ? (
            <p className="animate-pulse text-sm italic text-white/70">Writing the full story…</p>
          ) : detail.state === "failed" && detail.busy ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-white/70">
                The AI is busy with other messages right now. Try again in a minute.
              </p>
              <Button variant="panel" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
            </div>
          ) : detail.state === "failed" ? (
            <p className="text-sm text-white/70">{detail.error}</p>
          ) : (
            <p className="whitespace-pre-line text-sm leading-relaxed text-white/90">
              {detail.text}
            </p>
          )}
        </div>
        {m.text && (
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-white/70">
              The crew&apos;s exact words
            </p>
            {/* Plain text only: React escapes it, and it is never inserted as HTML. */}
            <p className="whitespace-pre-wrap break-words font-mono text-xs text-white/85">
              {m.text}
            </p>
          </div>
        )}
        {onShowOnMap && (
          <Button variant="panel" size="sm" className="gap-1" onClick={onShowOnMap}>
            <Plane className="h-3.5 w-3.5" aria-hidden /> Show on map
          </Button>
        )}
        <MarkdownFile source={report} name={fileName} />
        <p className="text-[10px] text-white/70">
          {AIRFRAMES_ATTRIBUTION}. AI text can be wrong; the colour comes from fixed rules.
        </p>
      </div>
    </section>
  );
}

export function AcarsFeedPanel({
  open,
  onOpenChange,
  aircraft,
  onSelectAircraft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aircraft: readonly Aircraft[];
  onSelectAircraft: (hex: string) => void;
}) {
  const [messages, setMessages] = useState<AcarsMessage[]>([]);
  const [status, setStatus] = useState<{ error: string | null; at: number | null }>({
    error: null,
    at: null,
  });
  const [briefs, setBriefs] = useState<Record<number, Brief>>({});
  const [filter, setFilter] = useState<AcarsFilter>("all");
  const [opened, setOpened] = useState<AcarsMessage | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const briefsRef = useRef(briefs);
  briefsRef.current = briefs;
  // Batch pacing survives the effect restarting on every feed update: no batch before `nextBatchAt`.
  const nextBatchAt = useRef(0);
  const batchGap = useRef(BATCH_GAP_MS);
  // One batch at a time, also when a feed update restarts the effect during a slow request.
  const inFlight = useRef(false);

  const live = useMemo(() => {
    const m = new Map<string, Aircraft>();
    for (const a of aircraft) m.set(a.hex.toLowerCase(), a);
    return m;
  }, [aircraft]);
  const alertOf = (m: AcarsMessage) => classifyAcars(m, m.icao ? live.get(m.icao)?.squawk : null);
  const alertOfRef = useRef(alertOf);
  alertOfRef.current = alertOf;

  // Poll the latest messages while the panel is open.
  useEffect(() => {
    if (!open) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const r = await fetchLatestMessages();
      if (stop) return;
      if (r.ok) {
        setMessages((prev) => {
          const byId = new Map(prev.map((m) => [m.id, m]));
          for (const m of r.messages) byId.set(m.id, m);
          return [...byId.values()]
            .sort((a, b) => (b.time ?? 0) - (a.time ?? 0) || b.id - a.id)
            .slice(0, MAX_KEPT);
        });
        setStatus({ error: null, at: r.fetchedAt });
      } else {
        setStatus((s) => ({ ...s, error: r.error }));
      }
      setNow(Date.now());
      timer = setTimeout(
        run,
        r.ok ? LATEST_CACHE_MS + 1000 : Math.max(5000, r.retryAfterMs ?? 20_000),
      );
    };
    void run();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [open]);

  // Headlines in batches, newest first, one batch at a time while the panel is open.
  useEffect(() => {
    if (!open) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = async () => {
      // Wait for a batch still in flight, then for the gap it set (doubled when the AI was busy).
      const wait = inFlight.current ? 1000 : nextBatchAt.current - Date.now();
      if (wait > 0) {
        timer = setTimeout(step, wait);
        return;
      }
      // The feed brings ~100 messages every few seconds, more than the AI can keep up with: describe the ones
      // worth reading first (emergency, caution, weather), then the newest.
      const todo = messages
        .filter((m) => {
          const b = briefsRef.current[m.id];
          return m.text && (!b || (b.state === "failed" && b.retry));
        })
        .map((m, i) => ({ m, rank: ALERT_RANK[alertOfRef.current(m)], i }))
        .sort((a, b) => a.rank - b.rank || a.i - b.i)
        .slice(0, MAX_BATCH)
        .map((x) => x.m);
      if (!todo.length) return;
      nextBatchAt.current = Date.now() + batchGap.current;
      setBriefs((b) => {
        const next = { ...b };
        for (const m of todo) next[m.id] = { state: "pending" };
        return next;
      });
      let result: Awaited<ReturnType<typeof describeAcarsBatch>> | null = null;
      inFlight.current = true;
      try {
        result = await describeAcarsBatch({ data: { messages: todo.map(aiInput) } });
      } catch {
        result = null;
      } finally {
        inFlight.current = false;
      }
      const busy = !!result && !result.ok && !!result.busy;
      // Busy: wait longer each time (8 s, 16 s, ... 2 min) instead of giving those messages up.
      batchGap.current = busy ? Math.min(batchGap.current * 2, MAX_BUSY_GAP_MS) : BATCH_GAP_MS;
      nextBatchAt.current = Date.now() + batchGap.current;
      setBriefs((b) => {
        const next = { ...b };
        for (const m of todo) {
          const text = result?.ok ? result.value[m.id] : undefined;
          next[m.id] = text
            ? { state: "done", text }
            : {
                state: "failed",
                error: result && !result.ok ? result.error : "No description",
                retry: busy,
              };
        }
        return next;
      });
      if (!stop) timer = setTimeout(step, batchGap.current);
    };
    timer = setTimeout(step, Math.max(300, nextBatchAt.current - Date.now()));
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, messages]);

  const { shown, duplicates, empty } = visibleMessages(messages, alertOf, filter);
  // Focus: into the opened card, back to the toolbar button when it closes, to the first row on Back to list.
  const sheetRef = useRef<HTMLDivElement>(null);
  const toList = useRef(false);
  const openedRef = useRef(opened);
  openedRef.current = opened;
  const focusToolbarButton = () =>
    document.querySelector<HTMLElement>('button[aria-label="ACARS messages"]')?.focus();
  const closeCard = () => {
    setOpened(null);
    requestAnimationFrame(focusToolbarButton);
  };
  const aiError = Object.values(briefs).find((b) => b.state === "failed");

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          ref={sheetRef}
          side="right"
          // A fixed dark surface: the rows use white text and dark-tuned alert gradients, also in the light theme.
          className="force-dark flex w-full flex-col gap-3 overflow-hidden p-0 text-foreground sm:max-w-md"
          onOpenAutoFocus={(e) => {
            if (!toList.current) return;
            toList.current = false;
            e.preventDefault();
            sheetRef.current?.querySelector<HTMLElement>("ul button")?.focus();
          }}
          // Radix returns focus only to a <SheetTrigger>, and this sheet is opened from state: hand it back to the toolbar
          // button ourselves, unless a card is opening and takes it.
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (!openedRef.current) focusToolbarButton();
          }}
        >
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>ACARS messages</SheetTitle>
            <SheetDescription className="text-xs">
              What crews and airlines are sending right now
              {status.at ? " · updated " + timeAgo(status.at, now) : ""}.
            </SheetDescription>
            <div role="group" aria-label="Show" className="flex gap-1 pt-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs transition",
                    filter === f.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/5 text-muted-foreground hover:bg-white/10",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {status.error && <p className="px-4 pb-2 text-xs text-destructive">{status.error}</p>}
            {aiError?.state === "failed" && (
              <p className="px-4 pb-2 text-[11px] text-muted-foreground">
                {aiError.retry
                  ? "AI headlines: the AI is busy, trying again shortly. Showing the raw text meanwhile."
                  : "AI headlines: " + aiError.error + " Showing the raw text instead."}
              </p>
            )}
            {!messages.length && !status.error && (
              <p className="px-4 text-sm text-muted-foreground">Loading messages…</p>
            )}
            {messages.length > 0 && !shown.length && (
              <p className="px-4 text-sm text-muted-foreground">
                Nothing {filter === "breaking" ? "breaking" : "of interest"} in the latest{" "}
                {messages.length} messages.
              </p>
            )}
            <ul className="divide-y divide-white/5">
              {shown.map((m) => {
                const alert = alertOf(m);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpened(m);
                        onOpenChange(false);
                      }}
                      className="w-full px-4 py-2.5 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      style={{ backgroundImage: rowGradient(alert) }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-white">
                          {acarsTitle(m)}
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2">
                          <AlertTag alert={alert} />
                          <span className="text-[10px] text-white/70">{timeAgo(m.time, now)}</span>
                        </span>
                      </div>
                      <div className="mt-0.5">
                        <BriefText brief={briefs[m.id]} m={m} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 space-y-1 border-t border-border/50 px-4 py-3 text-[10px] text-muted-foreground">
              {(duplicates > 0 || empty > 0) && (
                <p>
                  Left out of the list: {duplicates} repeated, {empty} without text.
                </p>
              )}
              <p>{ACARS_NOTICE}</p>
              <p>{ACARS_DISCLOSURE}</p>
              <p>
                Headlines and stories are {AI_LABEL.toLowerCase()}: message text is sent through
                SkyDeck&apos;s server to Cloudflare Workers AI or Google Gemini, and not stored.
                Colours come from fixed rules, not AI.
              </p>
              <p>
                <a
                  href={AIRFRAMES_SITE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {AIRFRAMES_ATTRIBUTION}
                </a>
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      {opened && (
        <MessageCard
          key={opened.id}
          m={opened}
          alert={alertOf(opened)}
          brief={briefs[opened.id]}
          onClose={closeCard}
          onBackToList={() => {
            toList.current = true;
            setOpened(null);
            onOpenChange(true);
          }}
          onShowOnMap={
            opened.icao && live.has(opened.icao)
              ? () => onSelectAircraft(opened.icao as string)
              : null
          }
        />
      )}
    </>
  );
}
