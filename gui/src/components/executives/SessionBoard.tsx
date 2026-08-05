'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw } from 'lucide-react';
import type { SessionLifecycleState, SessionRecord } from '@shared/sessions';
import { ISOLATED_COUNCIL_SESSION_KEY } from '@shared/sessions';
import { Button } from '@/components/ui/button';
import { useExecutiveSessions } from '@/lib/store/sessions';
import { cn } from '@/lib/utils';

/**
 * Executive Sessions — v1.2.3 Part H.
 *
 * ---------------------------------------------------------------------------
 * WHAT "INDEPENDENT SESSION" MEANS HERE, STATED ON SCREEN RATHER THAN ASSUMED
 * ---------------------------------------------------------------------------
 * Each row is a real, separate conversation with its own transcript and its own
 * engine session handle — resetting the CFO's row never touches the CEO's, and
 * closing this application and reopening it resumes each one from where it left
 * off, independently. That is genuine and is what this board reports.
 *
 * What it does not claim is concurrent activity: this application drives one AI
 * process at a time (`shared/runtime/contract.ts`), so **at most one row can
 * read Thinking or Responding**, whichever conversation is actually open right
 * now. Every other row reads Idle, Created, or Archived — a real state, not a
 * placeholder. Showing eight simultaneous "thinking" indicators would be
 * inventing a multi-process reality this cockpit does not have, which is the
 * fabrication `gui/README.md` and `KNOWN_LIMITATIONS.md` both rule out by name.
 */
export function SessionBoard() {
  const router = useRouter();
  const { records, unavailable, openSession, resetSession, resetAllExecutives, resetChiefOfStaff, busy } =
    useExecutiveSessions();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pendingBatch, setPendingBatch] = useState<'executives' | 'chief' | null>(null);

  if (unavailable) return null; // The board above already explains why.

  const open = async (record: SessionRecord) => {
    setPendingKey(record.slot.key);
    try {
      await openSession(record.slot);
      router.push('/');
    } finally {
      setPendingKey(null);
    }
  };

  const reset = async (record: SessionRecord) => {
    setPendingKey(record.slot.key);
    try {
      await resetSession(record.slot);
    } finally {
      setPendingKey(null);
    }
  };

  const isolatedRow = records.find((r) => r.slot.key === ISOLATED_COUNCIL_SESSION_KEY);
  const chiefRows = records.filter((r) => r.slot.kind === 'council');
  const executiveRows = records.filter((r) => r.slot.kind === 'lens');

  return (
    <section className="mt-8 border-t border-line pt-7">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold tracking-tight text-ink">Executive Sessions</h2>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || pendingBatch !== null}
            onClick={async () => {
              setPendingBatch('chief');
              try {
                await resetChiefOfStaff();
              } finally {
                setPendingBatch(null);
              }
            }}
          >
            {pendingBatch === 'chief' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" strokeWidth={2} />
            )}
            Reset Chief of Staff
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || pendingBatch !== null}
            onClick={async () => {
              setPendingBatch('executives');
              try {
                await resetAllExecutives();
              } finally {
                setPendingBatch(null);
              }
            }}
          >
            {pendingBatch === 'executives' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" strokeWidth={2} />
            )}
            Reset all executives
          </Button>
        </div>
      </div>

      <p className="mt-1 text-[13px] leading-relaxed text-faint">
        Each executive is its own conversation and its own runtime session — resuming, one
        never carries the other&rsquo;s history. Only one can be actively reasoning at a time,
        since one AI powers the board.
      </p>

      <div className="mt-3.5 divide-y divide-line rounded-xl border border-line bg-surface">
        {chiefRows.map((record) => (
          <SessionRow
            key={record.slot.key}
            record={record}
            pending={pendingKey === record.slot.key}
            onOpen={() => void open(record)}
            onReset={() => void reset(record)}
            experimental={record.slot.key === ISOLATED_COUNCIL_SESSION_KEY}
          />
        ))}
      </div>

      <div className="mt-3.5 divide-y divide-line rounded-xl border border-line bg-surface">
        {executiveRows.map((record) => (
          <SessionRow
            key={record.slot.key}
            record={record}
            pending={pendingKey === record.slot.key}
            onOpen={() => void open(record)}
            onReset={() => void reset(record)}
          />
        ))}
      </div>

      {isolatedRow && (
        <p className="mt-3 text-2xs leading-relaxed text-faint">
          Chief of Staff (isolated) opens an experimental conversation where each executive
          reasons independently and the results are synthesised afterward. See the notice on
          that screen before relying on it.
        </p>
      )}
    </section>
  );
}

const STATE_LABEL: Record<SessionLifecycleState, string> = {
  created: 'Not started',
  idle: 'Idle',
  thinking: 'Thinking',
  responding: 'Responding',
  archived: 'Archived',
  disposed: 'Disposed',
};

const STATE_TONE: Record<SessionLifecycleState, string> = {
  created: 'border-line bg-elevated text-faint',
  idle: 'border-positive/30 bg-positive/10 text-positive',
  thinking: 'border-accent/30 bg-accent/10 text-accent',
  responding: 'border-accent/30 bg-accent/10 text-accent',
  archived: 'border-line bg-elevated text-faint',
  disposed: 'border-line bg-elevated text-faint',
};

function SessionRow({
  record,
  pending,
  onOpen,
  onReset,
  experimental,
}: {
  record: SessionRecord;
  pending: boolean;
  onOpen: () => void;
  onReset: () => void;
  experimental?: boolean;
}) {
  const canReset = record.state === 'idle' || record.state === 'thinking' || record.state === 'responding';

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-medium text-ink">{record.slot.label}</span>
          {experimental && (
            <span className="rounded-full border border-line px-1.5 py-0.5 text-2xs text-faint">
              Experimental
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs',
              STATE_TONE[record.state]
            )}
          >
            {(record.state === 'thinking' || record.state === 'responding') && (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            )}
            {STATE_LABEL[record.state]}
          </span>
          {record.lastActivityAt !== null && (
            <span className="text-2xs text-faint">{relativeTime(record.lastActivityAt)}</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="outline" onClick={onOpen} disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Open'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onReset}
          disabled={pending || !canReset}
          title={canReset ? 'Archive this session; the next Open starts fresh' : 'Nothing to reset'}
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
        </Button>
      </div>
    </div>
  );
}

/** Coarse relative time. Display-only, not reused elsewhere, so it stays local. */
function relativeTime(epochMs: number): string {
  const deltaSeconds = Math.round((Date.now() - epochMs) / 1000);
  if (deltaSeconds < 60) return 'just now';
  const minutes = Math.round(deltaSeconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
