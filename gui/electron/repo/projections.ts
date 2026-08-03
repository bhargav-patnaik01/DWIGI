/**
 * Repository projections — file text in, typed structure out.
 *
 * Each function is pure: text to projection, no filesystem, no clock, no state.
 * That makes them unit-testable against fixtures, which is where the schema
 * assumptions actually get verified.
 *
 * ---------------------------------------------------------------------------
 * WHAT THESE FUNCTIONS MUST NEVER DO
 * ---------------------------------------------------------------------------
 * Compute staleness. Decide whether a review is overdue. Convert a provenance
 * string into an epistemic weight. Score confidence. Count completion. Every one
 * of those rules lives in the repository's own architecture, and reimplementing
 * any of them here would create a second authority that silently diverges from
 * the first.
 *
 * The cockpit shows the founder what the file says. The advisor decides what it
 * means.
 */

import type {
  BusinessMemory,
  Calibration,
  CalibrationTable,
  DecisionRecord,
  ExecutiveLens,
  ExecutiveRouting,
  MemoryField,
  MemorySection,
} from '../../shared/repo';
import { isLensId } from '../../shared/runtime-modes';
import {
  extractSections,
  extractTables,
  humanise,
  parseFrontMatter,
  undecorate,
} from './markdown';

/* ------------------------------------------------------------ business memory */

/** Column indices for a memory table, located by header text. */
interface Columns {
  field: number;
  value: number;
  confidence: number;
  provenance: number;
  updated: number;
  marker: number;
}

function locateColumns(header: string[]): Columns | null {
  const find = (...names: string[]): number =>
    header.findIndex((cell) => {
      const h = undecorate(cell).toLowerCase();
      return names.some((n) => h === n || h.includes(n));
    });

  const field = find('field');
  const value = find('value');
  if (field === -1 || value === -1) return null;

  return {
    field,
    value,
    confidence: find('confidence'),
    provenance: find('provenance', 'source'),
    updated: find('updated', 'last updated'),
    // The `●`/`○` requirement marker sits in an unlabelled leading column.
    marker: header.findIndex((cell) => undecorate(cell) === ''),
  };
}

/**
 * Parse `core/business_memory.md`.
 *
 * Structure follows the schema template: one table per category, each row a
 * field. Sections are located by heading, and any table carrying Field and Value
 * columns is accepted — so a section the advisor adds later still projects,
 * rather than being silently dropped for not matching a hardcoded list.
 */
export function projectBusinessMemory(source: string): BusinessMemory {
  const sections: MemorySection[] = [];
  let fieldCount = 0;

  for (const section of extractSections(source)) {
    // Skip the template's own contract chapters; they describe the schema rather
    // than holding company facts.
    if (/^(how this file works|field metadata|provenance|notation|staleness|instance lifecycle|required-field|priority order|minimum viable)/i.test(section.title)) {
      continue;
    }

    const fields: MemoryField[] = [];

    for (const table of extractTables(section.body)) {
      const cols = locateColumns(table.header);
      if (!cols) continue;

      for (const row of table.rows) {
        const key = undecorate(row[cols.field] ?? '');
        if (!key) continue;

        const at = (index: number): string =>
          index >= 0 ? undecorate(row[index] ?? '') : '';

        fields.push({
          key,
          label: humanise(key),
          value: at(cols.value),
          confidence: at(cols.confidence),
          provenance: at(cols.provenance),
          updated: at(cols.updated),
          required: cols.marker >= 0 && (row[cols.marker] ?? '').includes('●'),
        });
        fieldCount += 1;
      }
    }

    if (fields.length > 0) {
      // Strip a leading section number so headings read cleanly.
      sections.push({ title: section.title.replace(/^\d+\.\s*/, ''), fields });
    }
  }

  return { sections, fieldCount };
}

/* ------------------------------------------------------------------ decisions */

/**
 * Parse one decision record.
 *
 * Front matter is kept verbatim and untyped. The memo and review bodies are
 * returned as raw markdown for the existing renderer — reformatting them would
 * risk altering a record the architecture declares immutable.
 */
export function projectDecisionRecord(
  id: string,
  file: string,
  source: string
): DecisionRecord {
  const { data, body } = parseFrontMatter(source);
  const sections = extractSections(body);

  const findSection = (pattern: RegExp): string | null => {
    const hit = sections.find((s) => pattern.test(s.title));
    return hit && hit.body.length > 0 ? hit.body : null;
  };

  return {
    id,
    file,
    frontMatter: data,
    status: data.status ?? '',
    // Part 1 carries the memo; heading wording has varied, so match on intent.
    memo: findSection(/memo|part 1|recommendation|as delivered/i),
    review: findSection(/review|part 2|outcome/i),
  };
}

/* ----------------------------------------------------------------- executives */

/** `**Objective:** …` — a bold label at the start of a line. */
const FIELD_LABEL = /^\*\*(.+?):\*\*\s*(.*)$/;

/**
 * Pull `**Label:** value` blocks out of one lens's body.
 *
 * A value may continue over following lines — several fields are bullet lists —
 * so lines accumulate until the next label or a horizontal rule. Nothing is
 * reformatted, reordered, or summarised; bullets keep their markers so the
 * renderer can present them as the file wrote them.
 */
function extractLabelledFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let label: string | null = null;
  let buffer: string[] = [];

  const commit = (): void => {
    if (!label) return;
    const value = buffer.join('\n').trim();
    // A label with no value is dropped rather than stored empty: an empty string
    // would render as a present-but-blank field, which reads as missing content
    // when in fact the file never had that field.
    if (value.length > 0) fields[label] = value;
    label = null;
    buffer = [];
  };

  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    const match = FIELD_LABEL.exec(line.trim());
    if (match) {
      commit();
      label = (match[1] ?? '').trim();
      const inline = (match[2] ?? '').trim();
      buffer = inline.length > 0 ? [inline] : [];
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      commit();
      continue;
    }
    if (label) buffer.push(line);
  }

  commit();
  return fields;
}

/**
 * Parse one file from `core/executives/` into a lens.
 *
 * ---------------------------------------------------------------------------
 * FRONT MATTER IS THE ONLY AUTHORITY FOR IDENTITY
 * ---------------------------------------------------------------------------
 * `id`, `display_name`, `role`, `structural`, and `ordinal` are read from the
 * file's own front matter and from nowhere else. The previous parser recovered
 * all five from a prose heading, which meant identity was a regex result —
 * rename a lens and its id silently changed underneath every stored
 * conversation that referenced it.
 *
 * Deliberately no fallback to a heading, a filename, or a derived id. A file
 * that does not declare who it is returns null and is reported as skipped,
 * because the alternative is a lens displayed under an identity the cockpit
 * invented for it.
 *
 * Returns null rather than throwing: an unreadable executive is an ordinary
 * state for a directory a founder can edit, and one bad file must not take the
 * whole board down.
 */
export function projectExecutive(file: string, source: string): ExecutiveLens | null {
  const { data, body } = parseFrontMatter(source);

  const id = (data.id ?? '').trim();
  const name = (data.display_name ?? '').trim();
  // Validated against the same predicate the transport uses, because this value
  // becomes a `/lens` argument. An id that cannot be transmitted must never be
  // displayed as though it could.
  if (!isLensId(id) || name.length === 0) return null;

  const ordinal = Number.parseInt((data.ordinal ?? '').trim(), 10);

  return {
    id,
    name,
    role: (data.role ?? '').trim(),
    // Participation is not this file's to declare any more (ADR-012). Both of
    // these are filled from the manifest by the reader, which joins on `id`.
    structural: false,
    routing: null,
    // Undeclared order sorts last rather than first, so a file that forgets its
    // ordinal cannot silently displace the CEO at the top of the board.
    ordinal: Number.isFinite(ordinal) ? ordinal : Number.MAX_SAFE_INTEGER,
    file,
    fields: extractLabelledFields(body),
  };
}

/* ------------------------------------------------------------------ manifest */

/**
 * `### cfo` — a lens entry. The id is the whole heading, nothing else.
 *
 * Deliberately strict: no display name beside it, because that would be a second
 * copy of something the persona file already declares.
 */
const MANIFEST_ENTRY = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;

/** `## 3. Challenge lenses` — a group heading. */
const CHALLENGE_GROUP = /challenge/i;
const CONSTRUCTIVE_GROUP = /constructive/i;

/**
 * Parse `core/executive_manifest.md` into participation metadata.
 *
 * ---------------------------------------------------------------------------
 * GROUPING IS STRUCTURAL, NOT A FIELD
 * ---------------------------------------------------------------------------
 * A lens is a challenge lens because it sits under the challenge section, not
 * because anything says `structural: true`. That keeps the manifest's own
 * organisation and its data from disagreeing — there is nothing to disagree
 * with.
 *
 * An entry outside any recognised group is skipped rather than defaulted.
 * Guessing "constructive" would put a challenge lens into Agent Management as a
 * toggle the engine would ignore, which is precisely the deceptive switch the
 * interface refuses to show.
 */
export function projectManifest(source: string): {
  routing: Map<string, ExecutiveRouting>;
  structural: Set<string>;
  malformed: string[];
} {
  const routing = new Map<string, ExecutiveRouting>();
  const structural = new Set<string>();
  const malformed: string[] = [];

  let group: 'constructive' | 'challenge' | null = null;

  for (const section of extractSections(source)) {
    const title = section.title.trim();

    if (section.level <= 2) {
      const heading = title.replace(/^\d+\.\s*/, '');
      group = CHALLENGE_GROUP.test(heading)
        ? 'challenge'
        : CONSTRUCTIVE_GROUP.test(heading)
          ? 'constructive'
          : null;
      continue;
    }

    if (section.level !== 3) continue;
    if (!MANIFEST_ENTRY.test(title)) continue;

    // An entry that is not under a group has no stage, and stage decides whether
    // the interface may offer a toggle. Reported, never assumed.
    if (group === null) {
      malformed.push(`${title} (not under a constructive or challenge heading)`);
      continue;
    }

    const fields = extractLabelledFields(section.body);
    const activates = fields['Activates when'] ?? '';
    const suppressed = fields['Suppressed when'] ?? '';
    const escalates = fields['Escalates when'] ?? '';

    // All three are required. A partial entry cannot be gated on, and a lens the
    // gate cannot evaluate must not read as one it can.
    if (!activates || !suppressed || !escalates) {
      const missing = [
        !activates && 'Activates when',
        !suppressed && 'Suppressed when',
        !escalates && 'Escalates when',
      ].filter(Boolean);
      malformed.push(`${title} (missing ${missing.join(', ')})`);
      continue;
    }

    if (routing.has(title)) {
      malformed.push(`${title} (duplicate entry)`);
      continue;
    }

    routing.set(title, { activates, suppressed, escalates });
    if (group === 'challenge') structural.add(title);
  }

  return { routing, structural, malformed };
}

/* ---------------------------------------------------------------- calibration */

/**
 * Parse `core/calibration_journal.md`.
 *
 * Returns active adjustments and every table found, keyed by heading. Empty
 * results are expected and correct on a new installation — the file ships with
 * empty ledgers by design.
 */
export function projectCalibration(source: string): Calibration {
  const activeAdjustments: string[] = [];
  const tables: CalibrationTable[] = [];

  for (const section of extractSections(source)) {
    const title = section.title.replace(/^\d+\.\s*/, '');

    if (/active calibration adjustments/i.test(section.title)) {
      // Adjustment entries are `### CA-00N — name` headings inside the section.
      for (const line of section.body.split('\n')) {
        const entry = /^###\s+(CA-\S+.*)$/.exec(line.trim());
        if (entry?.[1]) activeAdjustments.push(entry[1].trim());
      }
    }

    for (const table of extractTables(section.body)) {
      // A table whose rows are all empty carries no information.
      if (table.rows.length === 0) {
        tables.push({ heading: title, header: table.header, rows: [] });
        continue;
      }
      tables.push({
        heading: title,
        header: table.header.map(undecorate),
        rows: table.rows.map((row) => row.map(undecorate)),
      });
    }
  }

  return { activeAdjustments, tables };
}
