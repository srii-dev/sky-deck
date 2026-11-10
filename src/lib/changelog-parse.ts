/*
 * What's new (Phase 23c): turns CHANGELOG.md into sections of plain-text items for the page. The changelog stays the
 * one place the history is written. Pure functions.
 */

export interface ChangeGroup {
  /** "Added", "Changed", "Removed", "Fixed" and so on. */
  name: string;
  items: string[];
}

export interface ChangeRelease {
  /** "Unreleased" or a version and date. */
  heading: string;
  groups: ChangeGroup[];
}

/** Markdown inline marks removed, so the text reads on its own. */
export function plainText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseChangelog(md: string): ChangeRelease[] {
  const releases: ChangeRelease[] = [];
  let release: ChangeRelease | null = null;
  let group: ChangeGroup | null = null;
  let lastItem = false;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h2 = /^##\s+(.+)$/.exec(line);
    const h3 = /^###\s+(.+)$/.exec(line);
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (h2 && !line.startsWith("###")) {
      release = { heading: plainText(h2[1]!), groups: [] };
      releases.push(release);
      group = null;
      lastItem = false;
    } else if (h3 && release) {
      group = { name: plainText(h3[1]!), items: [] };
      release.groups.push(group);
      lastItem = false;
    } else if (bullet && group) {
      group.items.push(plainText(bullet[1]!));
      lastItem = true;
    } else if (/^\s{2,}\S/.test(line) && group && lastItem && group.items.length > 0) {
      // A bullet that continues on the next line.
      group.items[group.items.length - 1] += " " + plainText(line);
    } else if (line.trim() === "") {
      lastItem = false;
    }
  }
  return releases
    .map((r) => ({ ...r, groups: r.groups.filter((g) => g.items.length > 0) }))
    .filter((r) => r.groups.length > 0);
}
