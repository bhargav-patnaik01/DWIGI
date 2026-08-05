'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, RefreshCw, Scale, X } from 'lucide-react';
import type { DecisionRecord } from '@shared/repo';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/shared/Markdown';
import { Unavailable } from '@/components/repo/Unavailable';
import { useRepo } from '@/lib/store/repo';
import { useUi } from '@/lib/store/ui';

/**
 * Decisions — read-only journal.
 *
 * ---------------------------------------------------------------------------
 * GROUPING COMES FROM THE FILE, NOT FROM A CALCULATION
 * ---------------------------------------------------------------------------
 * Records are grouped by their own `status` front-matter value. The cockpit does
 * NOT compare `review_date` to today to decide what is overdue — that rule
 * belongs to the advisor and its calibration journal, which maintains the
 * authoritative review queue. Recomputing it here would create a second,
 * quietly diverging answer to "what needs reviewing".
 *
 * A record with a status the cockpit has never seen gets its own group rather
 * than being forced into a known one.
 */
const ORDER = ['open', 'reviewed', 'superseded'] as const;

const GROUP_LABEL: Record<string, string> = {
  open: 'Pending review',
  reviewed: 'Closed',
  superseded: 'Superseded',
  '': 'No status recorded',
};

export default function DecisionsPage() {
  const workspacePath = useUi((s) => s.workspacePath);
  const snapshot = useRepo((s) => s.snapshot);
  const loading = useRepo((s) => s.loading);
  const attach = useRepo((s) => s.attach);
  const refresh = useRepo((s) => s.refresh);
  const watch = useRepo((s) => s.watch);
  const [selected, setSelected] = useState<DecisionRecord | null>(null);

  useEffect(() => {
    if (!workspacePath) return;
    if (!snapshot) void attach(workspacePath);
    return watch();
  }, [attach, snapshot, watch, workspacePath]);

  const journal = snapshot?.journal;

  const groups = useMemo(() => {
    if (!journal?.ok) return [];
    const byStatus = new Map<string, DecisionRecord[]>();
    for (const record of journal.value.records) {
      const key = record.status.toLowerCase();
      const list = byStatus.get(key) ?? [];
      list.push(record);
      byStatus.set(key, list);
    }
    // Known statuses first in a deliberate order, then anything unexpected.
    const known = ORDER.filter((s) => byStatus.has(s)).map((s) => [s, byStatus.get(s)!] as const);
    const rest = [...byStatus.entries()].filter(
      ([s]) => !(ORDER as readonly string[]).includes(s)
    );
    return [...known, ...rest];
  }, [journal]);

  if (!workspacePath) {
    return (
      <>
        <ScreenHeader title="Decisions" subtitle="Journal" />
        <EmptyState
          icon={Scale}
          title="No workspace selected"
          description="Choose your workspace in Settings."
        />
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title="Decisions"
        subtitle={
          journal?.ok
            ? `${journal.value.records.length} record${journal.value.records.length === 1 ? '' : 's'}`
            : 'Journal'
        }
        actions={
          <Button size="icon" variant="ghost" onClick={() => void refresh()} aria-label="Refresh">
            <RefreshCw
              className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
              strokeWidth={1.75}
            />
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-reading px-6 py-6">
          {journal && !journal.ok && (
            <Unavailable label="Decision journal" reason={journal.reason} />
          )}

          {journal?.ok && journal.value.records.length === 0 && (
            <EmptyState
              icon={Scale}
              title="No decision records yet"
              description="The advisor writes a record when a decision is hard to reverse,
                materially affects cash or headcount, sets direction, or when you override
                its recommendation."
            />
          )}

          {groups.map(([status, records]) => (
            <section key={status} className="mb-7">
              <h2 className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">
                {GROUP_LABEL[status] ?? status} · {records.length}
              </h2>
              <div className="overflow-hidden rounded-lg border border-line">
                {records.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => setSelected(record)}
                    className="flex w-full items-center gap-3 border-b border-line px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-elevated"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-ink">
                        {record.frontMatter.domain || record.id}
                      </div>
                      <div className="mt-0.5 flex gap-2.5 font-mono text-2xs text-faint">
                        <span>{record.frontMatter.date || '—'}</span>
                        {record.frontMatter.confidence && (
                          <span>{record.frontMatter.confidence}</span>
                        )}
                        {record.frontMatter.review_date && (
                          <span>review {record.frontMatter.review_date}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={1.75} />
                  </button>
                ))}
              </div>
            </section>
          ))}

          {journal?.ok && journal.value.skipped.length > 0 && (
            <p className="text-2xs text-faint">
              {journal.value.skipped.length}{' '}
              {journal.value.skipped.length === 1 ? 'file' : 'files'} could not be read:{' '}
              {journal.value.skipped.join(', ')}
            </p>
          )}
        </div>
      </div>

      {selected && <DecisionSheet record={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

/** Full record, shown as stored. Front matter is listed verbatim. */
function DecisionSheet({
  record,
  onClose,
}: {
  record: DecisionRecord;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex bg-canvas/80 backdrop-blur-[1px]">
      <div className="ml-auto flex h-full w-full max-w-2xl flex-col border-l border-line bg-canvas animate-fade-up">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-5">
          <span className="truncate font-mono text-2xs text-faint">{record.file}</span>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <dl className="mb-6 overflow-hidden rounded-lg border border-line">
            {Object.entries(record.frontMatter).map(([key, value]) => (
              <div
                key={key}
                className="flex gap-3 border-b border-line px-3 py-1.5 last:border-0"
              >
                <dt className="w-[130px] shrink-0 font-mono text-2xs text-faint">{key}</dt>
                <dd className="min-w-0 flex-1 font-mono text-2xs text-ink/80">{value}</dd>
              </div>
            ))}
          </dl>

          {record.memo && (
            <section className="mb-6">
              <h3 className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">
                Memo as delivered
              </h3>
              <Markdown source={record.memo} />
            </section>
          )}

          {record.review ? (
            <section>
              <h3 className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">
                Review
              </h3>
              <Markdown source={record.review} />
            </section>
          ) : (
            <p className="border-t border-line pt-4 text-[13px] text-faint">
              No review written yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
