import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SiteFooter, SiteHeader } from "@/components/skydeck/SiteChrome";
import { APP_NAME } from "@/config/brand";
import {
  decodeFrame,
  resolvePositions,
  type AdsbMessage,
  type DecodedFrame,
  type ResolvedPosition,
} from "@/lib/modes-decode";
import { compassPoint } from "@/lib/units";

export const Route = createFileRoute("/inspector")({
  head: () => ({
    meta: [
      { title: `ADS-B message inspector — ${APP_NAME}` },
      {
        name: "description",
        content: "Paste raw Mode S / ADS-B frames and see what each field means.",
      },
    ],
  }),
  component: Inspector,
});

// Published example frames from "The 1090 MHz Riddle" (J. Sun, open book).
const EXAMPLE_FRAMES = [
  "8D4840D6202CC371C32CE0576098",
  "8D40621D58C386435CC412692AD6",
  "8D40621D58C382D690C8AC2863A7",
  "8D485020994409940838175B284F",
].join("\n");

type Row = [label: string, value: string];

function messageRows(m: AdsbMessage, pos: ResolvedPosition | null): Row[] {
  switch (m.kind) {
    case "identification":
      return [
        ["Message", `Aircraft identification (type code ${m.typeCode})`],
        ["Callsign", m.callsign || "—"],
        ["Category", m.category],
      ];
    case "airborne-position":
      return [
        ["Message", `Airborne position (type code ${m.typeCode})`],
        [
          "Altitude",
          m.altitudeFt != null
            ? `${m.altitudeFt.toLocaleString("en-US")} ft (barometric)`
            : (m.altitudeNote ?? "—"),
        ],
        ["CPR frame", m.cprOdd ? "odd" : "even"],
        ["CPR lat / lon (raw)", `${m.cprLat} / ${m.cprLon}`],
        [
          "Position",
          pos
            ? `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)} (with frame ${pos.pairedWith + 1})`
            : "Needs an earlier frame of the opposite parity from the same aircraft",
        ],
      ];
    case "velocity": {
      const dir =
        m.directionDeg != null
          ? `${m.directionDeg.toFixed(1)}° ${compassPoint(m.directionDeg)}`
          : "—";
      return [
        ["Message", `Airborne velocity (subtype ${m.subtype})`],
        [
          m.speedType === "ground speed"
            ? "Ground speed"
            : m.speedType === "true airspeed"
              ? "True airspeed"
              : "Indicated airspeed",
          m.speedKt != null ? `${Math.round(m.speedKt)} kt` : "—",
        ],
        [m.directionType === "track" ? "Track" : "Heading", dir],
        [
          "Vertical rate",
          m.vRateFpm != null
            ? `${m.vRateFpm.toLocaleString("en-US")} ft/min (${m.vRateSource})`
            : "—",
        ],
      ];
    }
    case "other":
      return [["Message", `Type code ${m.typeCode}: ${m.name}`]];
  }
}

function FrameCard({
  index,
  line,
  frame,
  error,
  pos,
}: {
  index: number;
  line: string;
  frame: DecodedFrame | null;
  error: string | null;
  pos: ResolvedPosition | null;
}) {
  if (!frame) {
    return (
      <div className="glass-panel rounded-md p-3">
        <div className="hud-label mb-2">Frame {index + 1}</div>
        <div className="data-value break-all text-xs text-muted-foreground">{line}</div>
        <p className="mt-2 text-sm font-medium text-destructive">{error}</p>
      </div>
    );
  }
  const rows: Row[] = [
    ["Downlink format", `DF${frame.df} · ${frame.dfName} · ${frame.bits} bits`],
    [frame.icaoFrom === "frame" ? "ICAO address" : "ICAO address (from parity)", frame.icao],
    ...(frame.message ? messageRows(frame.message, pos) : []),
  ];
  return (
    <div className="glass-panel rounded-md p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="hud-label">Frame {index + 1}</div>
        {frame.crcOk === true && (
          <Badge className="border-success/40 bg-success/15 text-success">CRC OK</Badge>
        )}
        {frame.crcOk === false && <Badge variant="destructive">CRC mismatch</Badge>}
        {frame.crcOk === null && <Badge variant="outline">CRC not applicable</Badge>}
      </div>
      <div className="data-value mb-3 break-all text-xs text-muted-foreground">{frame.hex}</div>
      <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="data-value break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {frame.warnings.map((w) => (
        <p key={w} className="mt-2 text-xs text-warning/90">
          {w}
        </p>
      ))}
    </div>
  );
}

function Inspector() {
  const [text, setText] = useState("");

  const results = useMemo(() => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const decoded = lines.map((line) => ({ line, result: decodeFrame(line) }));
    const good = decoded.map((d) => (d.result.ok ? d.result.value : null));
    const okFrames = good.filter((f): f is DecodedFrame => f !== null);
    const positions = resolvePositions(okFrames);
    let k = 0;
    return decoded.map((d, i) => ({
      index: i,
      line: d.line,
      frame: d.result.ok ? d.result.value : null,
      error: d.result.ok ? null : d.result.error,
      pos: d.result.ok ? (positions[k++] ?? null) : null,
    }));
  }, [text]);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
        <h1 className="font-display text-2xl font-bold tracking-wide">ADS-B message inspector</h1>

        <p className="text-sm text-muted-foreground">
          Paste raw Mode S frames, one per line: 14 hex characters (56 bits) or 28 (112 bits). Plain
          hex, <span className="data-value">*8D…;</span> and{" "}
          <span className="data-value">@timestamp8D…;</span> forms are accepted. Everything is
          decoded in your browser; nothing is sent anywhere. Position needs an even and an odd frame
          of the same aircraft, in time order.
        </p>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="8D4840D6202CC371C32CE0576098"
          spellCheck={false}
          rows={6}
          aria-label="Raw frames"
          className="data-value text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="hud" onClick={() => setText(EXAMPLE_FRAMES)}>
            Load example frames
          </Button>
          <Button variant="hud" onClick={() => setText("")} disabled={!text}>
            Clear
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {results.length === 0 && <p className="text-sm text-muted-foreground">No frames yet.</p>}
          {results.map((r) => (
            <FrameCard key={r.index} {...r} />
          ))}
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground">
          Educational tool. Not decoded: Gillham-coded altitude, GNSS height, surface position,
          status messages, Comm-B and ACAS contents. Not for operational or safety use.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
