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
  ExecutiveMatrix,
  MemoryField,
  MemorySection,
} from '../../shared/repo';
import { lensIdFromName } from '../../shared/runtime-modes';
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

/**
 * `## 7. Risk Officer — Downside *(S5, structural)*`
 *
 * Ordinal, name, and subtitle. The em dash is the file's separator; a plain
 * hyphen is accepted too so a hand-edit does not drop a lens off the board.
 */
const LENS_HEADING = /^(\d+)\.\s*(.+?)\s+(?:—|--|-)\s+(.+)$/;

/**
 * The heading marker that declares a lens structural at S5.
 *
 * Matched as literal text from the file rather than inferred from the lens's
 * name. If the matrix stops marking a lens this way, the interface stops
 * treating it as one — which is the correct direction for the dependency to run.
 */
const STRUCTURAL_MARKER = /\(\s*S5\s*,\s*structural\s*\)/i;

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
 * Parse `core/executive_matrix.md` into the canonical lens roster.
 *
 * Only numbered `## N. Name — Role` sections are lenses. The file's explanatory
 * chapters — *How to use this file*, *Field schema* — carry no ordinal and are
 * skipped structurally rather than by title matching, so a new prose chapter
 * cannot accidentally appear on the Executive Board as a ninth executive.
 */
export function projectExecutiveMatrix(source: string): ExecutiveMatrix {
  const lenses: ExecutiveLens[] = [];

  for (const section of extractSections(source)) {
    const heading = LENS_HEADING.exec(section.title.trim());
    if (!heading) continue;

    const ordinal = Number.parseInt(heading[1] ?? '', 10);
    const name = (heading[2] ?? '').trim();
    const subtitle = (heading[3] ?? '').trim();
    if (!Number.isFinite(ordinal) || name.length === 0) continue;

    const structural = STRUCTURAL_MARKER.test(subtitle);

    lenses.push({
      id: lensIdFromName(name),
      name,
      // Strip the structural marker and any emphasis wrapping it left behind.
      role: subtitle.replace(STRUCTURAL_MARKER, '').replace(/\*+/g, '').trim(),
      structural,
      ordinal,
      fields: extractLabelledFields(section.body),
    });
  }

  // The file's own numbering is the canonical order. Sorting by it rather than
  // trusting document order means a reordered file still presents consistently.
  lenses.sort((a, b) => a.ordinal - b.ordinal);

  return { lenses };
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
