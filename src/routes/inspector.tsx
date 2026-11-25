import { useMemo, useState } from "react";
import { pageMeta } from "@/lib/site-meta";
import { Link, createFileRoute } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SiteFooter, SiteHeader } from "@/components/skydeck/SiteChrome";
import { APP_NAME } from "@/config/brand";
import {
  decodeFrame,
  resolvePositions,
  type AdsbMessage,
  type DecodedFrame,
  type ReferencePosition,
  type ResolvedPosition,
} from "@/lib/modes-decode";
import { compassPoint } from "@/lib/units";

export const Route = createFileRoute("/inspector")({
  head: () => ({
    meta: pageMeta(
      `ADS-B message inspector — ${APP_NAME}`,
      "Paste raw Mode S / ADS-B frames and see what each field means.",
    ),
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

// Published surface position frames from the same book (chapter 4), with the airfield reference it uses.
const SURFACE_FRAMES = [
  "8C4841753AAB238733C8CD4020B1",
  "8C4841753A8A35323FAEBDAC702D",
  "8C4841753A9A153237AEF0F275BE",
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
            ? `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)} (with frame ${(pos.pairedWith ?? 0) + 1})`
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
    case "surface-position":
      return [
        ["Message", `Surface position (type code ${m.typeCode})`],
        [
          "Ground speed",
          m.speedKt != null
            ? `${m.speedKt} kt${m.speedNote ? ` (${m.speedNote})` : ""}`
            : (m.speedNote ?? "—"),
        ],
        [
          "Track",
          m.trackDeg != null
            ? `${m.trackDeg.toFixed(1)}° ${compassPoint(m.trackDeg)}`
            : "Not valid (track status bit is 0)",
        ],
        ["CPR frame", m.cprOdd ? "odd" : "even"],
        ["CPR lat / lon (raw)", `${m.cprLat} / ${m.cprLon}`],
        [
          "Position",
          pos
            ? `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)} (${
                pos.pairedWith != null
                  ? `with frame ${pos.pairedWith + 1}, using the reference to pick the quadrant`
                  : "from the reference position alone: only right within about 45 nm of it"
              })`
            : "Enter a reference position (for example the airfield) to decode a surface position",
        ],
      ];
    case "operational-status":
      return [
        [
          "Message",
          `Operational status, ${m.subtype === 0 ? "airborne" : "surface"} (type code 31)`,
        ],
        ["ADS-B version", m.version != null ? String(m.version) : "Reserved value"],
        ["NIC supplement A", String(m.nicSupplementA)],
        ["NACp / SIL (raw)", `${m.nacpRaw} / ${m.silRaw} (meaning not decoded)`],
      ];
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
        <p className="mt-2 text-sm font-medium text-destructive-text">{error}</p>
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
  const [refLat, setRefLat] = useState("");
  const [refLon, setRefLon] = useState("");
  const ref = useMemo<ReferencePosition | null>(() => {
    const lat = Number(refLat);
    const lon = Number(refLon);
    const ok =
      refLat.trim() !== "" &&
      refLon.trim() !== "" &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180;
    return ok ? { lat, lon } : null;
  }, [refLat, refLon]);

  const results = useMemo(() => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const decoded = lines.map((line) => ({ line, result: decodeFrame(line) }));
    const good = decoded.map((d) => (d.result.ok ? d.result.value : null));
    const okFrames = good.filter((f): f is DecodedFrame => f !== null);
    const positions = resolvePositions(okFrames, ref);
    let k = 0;
    return decoded.map((d, i) => ({
      index: i,
      line: d.line,
      frame: d.result.ok ? d.result.value : null,
      error: d.result.ok ? null : d.result.error,
      pos: d.result.ok ? (positions[k++] ?? null) : null,
    }));
  }, [text, ref]);

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
          of the same aircraft, in time order. A surface position also needs a reference position
          (for example the airfield).
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
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Reference latitude (optional)
            <Input
              value={refLat}
              onChange={(e) => setRefLat(e.target.value)}
              inputMode="decimal"
              placeholder="51.990"
              className="data-value h-8 w-36 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Reference longitude (optional)
            <Input
              value={refLon}
              onChange={(e) => setRefLon(e.target.value)}
              inputMode="decimal"
              placeholder="4.375"
              className="data-value h-8 w-36 text-xs"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="hud" onClick={() => setText(EXAMPLE_FRAMES)}>
            Load example frames
          </Button>
          <Button
            variant="hud"
            onClick={() => {
              setText(SURFACE_FRAMES);
              setRefLat("51.990");
              setRefLon("4.375");
            }}
          >
            Load surface example
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
          Educational tool. Not decoded: Gillham-coded altitude, GNSS height, aircraft status and
          target state messages, the meaning of accuracy and integrity codes, Comm-B and ACAS
          contents. Not for operational or safety use.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
