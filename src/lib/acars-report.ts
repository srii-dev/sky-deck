import { ALERT_LABELS, type AcarsAlert } from "./acars-alert";
import { summarizeMessage } from "./acars-explain";
import type { AcarsMessage } from "./acars-messages";

/** Header of a message card: the flight number, else the registration. */
export function acarsTitle(m: AcarsMessage): string {
  return m.flight ?? m.tail ?? "Unknown flight";
}

const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");

/** A Markdown report of one message: shown as a .md file in the panel and offered as a download. */
export function buildAcarsReport(
  m: AcarsMessage,
  alert: AcarsAlert,
  brief: string | null,
  detail: string | null,
  /** Sections whose AI text is still being written: "Writing…" instead of "Not available." */
  pending: { brief?: boolean; detail?: boolean } = {},
): string {
  const s = summarizeMessage(m, detail != null);
  const when = s.fields.find((f) => f.label === "Received")?.value ?? "time unknown";
  const lines = [
    "# ACARS report: " + acarsTitle(m),
    "",
    "> " + ALERT_LABELS[alert] + " | " + (m.label ? "label " + m.label + " | " : "") + when,
    "",
    "## Summary (AI-generated)",
    "",
    brief ?? (pending.brief ? "Writing..." : "Not available."),
    "",
    "## Explanation (AI-generated)",
    "",
    detail ?? (pending.detail ? "Writing..." : "Not available."),
    "",
    "## Message details",
    "",
    "| Field | Value |",
    "| --- | --- |",
    ...s.fields.map((f) => "| " + f.label + " | " + cell(f.value ?? "unavailable") + " |"),
  ];
  if (s.abbreviations.length) {
    lines.push(
      "",
      "## Abbreviations",
      "",
      ...s.abbreviations.map((a) => "- " + a.abbr + ": " + a.meaning),
    );
  }
  if (s.notes.length) lines.push("", "## Notes", "", ...s.notes.map((n) => "- " + n));
  lines.push(
    "",
    "## Raw message",
    "",
    "```text",
    m.text.replace(/```/g, "'''") || "(no text)",
    "```",
    "",
    "---",
    "",
    "Data: Airframes.io and its community of feeders. Received by volunteers; may be incomplete or wrong. " +
      "AI-generated text can be mistaken. Educational use only.",
    "",
  );
  return lines.join("\n");
}
