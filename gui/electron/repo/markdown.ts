/**
 * Markdown extraction primitives for repository projections.
 *
 * TOLERANT BY DESIGN. Every function returns empty or null rather than throwing.
 * The repository is authored by an advisor over months and its files are edited
 * by hand; a parser that throws would take a screen down over a stray pipe
 * character. A degraded card is recoverable, a crashed cockpit is not.
 *
 * These helpers extract *structure* only. They never interpret cell contents.
 */

export interface MarkdownTable {
  header: string[];
  rows: string[][];
}

/** Split a pipe row into trimmed cells, tolerating optional edge pipes. */
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** A `|---|:--:|` style alignment row. */
function isSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');
}

/**
 * Strip decoration the schema uses for emphasis so values compare cleanly.
 *
 * Removes backticks and bold markers only. It does not lowercase, trim to a known
 * vocabulary, or substitute defaults — that would be interpretation.
 */
export function undecorate(cell: string): string {
  return cell.replace(/`/g, '').replace(/\*\*/g, '').trim();
}

/** Every pipe table in the document, in order. */
export function extractTables(source: string): MarkdownTable[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const tables: MarkdownTable[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const next = lines[i + 1] ?? '';
    if (!line.includes('|') || !isSeparator(next)) continue;

    const header = splitRow(line);
    const rows: string[][] = [];
    i += 2;
    while (i < lines.length && (lines[i] ?? '').includes('|')) {
      const row = splitRow(lines[i] ?? '');
      // Ignore rows that are entirely empty after splitting.
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      i += 1;
    }
    i -= 1;
    tables.push({ header, rows });
  }

  return tables;
}

export interface Section {
  /** Heading text without the leading hashes. */
  title: string;
  level: number;
  /** Body between this heading and the next of equal or higher level. */
  body: string;
}

/** Split a document into ATX-heading sections. */
export function extractSections(source: string): Section[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const sections: Section[] = [];
  let current: { title: string; level: number; body: string[] } | null = null;
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;

    const heading = !inFence ? /^(#{1,6})\s+(.*)$/.exec(line) : null;
    if (heading) {
      if (current) {
        sections.push({ ...current, body: current.body.join('\n').trim() });
      }
      current = {
        title: (heading[2] ?? '').trim(),
        level: (heading[1] ?? '').length,
        body: [],
      };
      continue;
    }

    if (current) current.body.push(line);
  }

  if (current) sections.push({ ...current, body: current.body.join('\n').trim() });
  return sections;
}

/**
 * Parse a leading `---` fenced block as flat key/value pairs.
 *
 * Deliberately not a YAML parser. Decision-record front matter is flat scalars
 * plus simple lists, and a real YAML dependency would invite nested structures
 * the projection types do not model. Nested values are preserved as their raw
 * text so nothing is lost, merely unstructured.
 */
export function parseFrontMatter(source: string): {
  data: Record<string, string>;
  body: string;
} {
  const normalised = source.replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalised);
  if (!match) return { data: {}, body: normalised };

  const data: Record<string, string> = {};
  const lines = (match[1] ?? '').split('\n');
  let currentKey: string | null = null;

  for (const line of lines) {
    // List item or continuation belonging to the previous key.
    if (/^\s+/.test(line) || /^\s*-\s/.test(line)) {
      if (currentKey) {
        const addition = line.replace(/^\s*-\s*/, '').trim();
        if (addition) {
          data[currentKey] = data[currentKey] ? `${data[currentKey]}, ${addition}` : addition;
        }
      }
      continue;
    }

    const kv = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    currentKey = kv[1] ?? null;
    if (currentKey) data[currentKey] = (kv[2] ?? '').trim();
  }

  return { data, body: normalised.slice(match[0].length) };
}

/** Turn `north_star_metric` into `North star metric` for display. */
export function humanise(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
