'use client';

import { useEffect, useMemo } from 'react';
import { LayoutDashboard, RefreshCw } from 'lucide-react';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { ProvenanceChip } from '@/components/repo/ProvenanceChip';
import { Unavailable } from '@/components/repo/Unavailable';
import { useRepo } from '@/lib/store/repo';
import { useUi } from '@/lib/store/ui';
import type { MemoryField } from '@shared/repo';

/**
 * Executive Dashboard — read-only projection.
 *
 * ---------------------------------------------------------------------------
 * EVERY NUMBER HERE IS READ, NOT CALCULATED
 * ---------------------------------------------------------------------------
 * Stage, runway, constraint, and priorities are memory field values shown
 * verbatim with their provenance. Calibration progress is the count of scored
 * predictions the journal already records — the cockpit does not compute a hit
 * rate, a percentage, or a trend, because those are the advisor's judgements and
 * a second implementation of them would diverge.
 *
 * "Pending reviews" reads the calibration journal's own review-queue table rather
 * than comparing dates. If that table is empty, the dashboard says so, even when
 * records with review dates exist — the queue is the authority.
 */

/** Field keys the dashboard surfaces, in display order. */
const HEADLINE = ['stage', 'runway_months', 'binding_constraint', 'active_primary_bet'] as const;

export default function DashboardPage() {
  const workspacePath = useUi((s) => s.workspacePath);
  const snapshot = useRepo((s) => s.snapshot);
  const loading = useRepo((s) => s.loading);
  const attach = useRepo((s) => s.attach);
  const refresh = useRepo((s) => s.refresh);
  const watch = useRepo((s) => s.watch);

  useEffect(() => {
    if (!workspacePath) return;
    if (!snapshot) void attach(workspacePath);
    return watch();
  }, [attach, snapshot, watch, workspacePath]);

  const fields = useMemo(() => {
    const map = new Map<string, MemoryField>();
    if (snapshot?.memory.ok) {
      for (const section of snapshot.memory.value.sections) {
        for (const field of section.fields) map.set(field.key, field);
      }
    }
    return map;
  }, [snapshot]);

  const reviewQueue = useMemo(() => {
    if (!snapshot?.calibration.ok) return null;
    return (
      snapshot.calibration.value.tables.find((t) => /review queue/i.test(t.heading)) ?? null
    );
  }, [snapshot]);

  const scored = useMemo(() => {
    if (!snapshot?.calibration.ok) return null;
    const table = snapshot.calibration.value.tables.find((t) =>
      t.header.some((h) => /predictions/i.test(h))
    );
    if (!table) return null;
    // Sum the "Predictions" column exactly as recorded. Summing stored counts is
    // arithmetic on displayed data, not a derived business judgement.
    const index = table.header.findIndex((h) => /predictions/i.test(h));
    let total = 0;
    for (const row of table.rows) {
      const n = Number.parseInt(row[index] ?? '', 10);
      if (Number.isFinite(n)) total += n;
    }
    return total;
  }, [snapshot]);

  if (!workspacePath) {
    return (
      <>
        <ScreenHeader title="Dashboard" subtitle="Read-only" />
        <EmptyState
          icon={LayoutDashboard}
          title="No workspace selected"
          description="Choose your workspace in Settings."
        />
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title="Dashboard"
        subtitle="Read-only"
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
        <div className="mx-auto max-w-reading space-y-6 px-6 py-6">
          {snapshot?.memory && !snapshot.memory.ok ? (
            <Unavailable label="Business Memory" reason={snapshot.memory.reason} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {HEADLINE.map((key) => (
                <StatCard key={key} field={fields.get(key)} fallbackLabel={key} />
              ))}
            </div>
          )}

          <section>
            <h2 className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">
              Pending decision reviews
            </h2>
            {!snapshot || !snapshot.calibration.ok ? (
              <Unavailable
                label="Calibration journal"
                reason={
                  snapshot && !snapshot.calibration.ok
                    ? snapshot.calibration.reason
                    : 'Not read yet.'
                }
              />
            ) : reviewQueue && reviewQueue.rows.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-line">
                {reviewQueue.rows.map((row, i) => (
                  <div
                    key={i}
                    className="flex gap-3 border-b border-line px-3.5 py-2 font-mono text-2xs text-ink/80 last:border-0"
                  >
                    {row.map((cell, j) => (
                      <span key={j} className={j === 0 ? 'flex-1 truncate' : 'shrink-0'}>
                        {cell}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-line bg-surface px-3.5 py-3 text-[13px] text-faint">
                The review queue is empty. Entries appear when the advisor logs a decision
                with a review date.
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">
              Confidence calibration
            </h2>
            <div className="rounded-lg border border-line bg-surface px-3.5 py-3">
              {scored === null ? (
                <p className="text-[13px] text-faint">Not available.</p>
              ) : scored === 0 ? (
                <p className="text-[13px] leading-relaxed text-faint">
                  No scored predictions yet. Confidence bands are asserted rather than
                  earned until decisions have been reviewed.
                </p>
              ) : (
                <p className="text-[13px] text-ink">
                  <span className="tabular font-medium">{scored}</span> prediction
                  {scored === 1 ? '' : 's'} scored to date.
                </p>
              )}
              {snapshot?.calibration.ok &&
                snapshot.calibration.value.activeAdjustments.length > 0 && (
                  <ul className="mt-2.5 space-y-1 border-t border-line pt-2.5">
                    {snapshot.calibration.value.activeAdjustments.map((entry) => (
                      <li key={entry} className="text-[13px] text-muted">
                        {entry}
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function StatCard({
  field,
  fallbackLabel,
}: {
  field: MemoryField | undefined;
  fallbackLabel: string;
}) {
  const label = field?.label ?? fallbackLabel.replace(/_/g, ' ');
  const raw = field?.value.trim() ?? '';
  const empty = !raw || raw === '—' || raw.toLowerCase() === 'unknown';

  return (
    <div className="rounded-lg border border-line bg-surface px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xs uppercase tracking-wide text-faint">{label}</span>
        {field && <ProvenanceChip value={field.provenance} />}
      </div>
      <div
        className={
          empty
            ? 'mt-1.5 text-[13px] italic text-faint'
            : 'mt-1.5 text-[15px] font-medium tabular text-ink'
        }
      >
        {empty ? 'Unknown' : raw}
      </div>
      {field?.updated && field.updated !== '—' && !empty && (
        <div className="mt-1 font-mono text-2xs text-faint">updated {field.updated}</div>
      )}
    </div>
  );
}
