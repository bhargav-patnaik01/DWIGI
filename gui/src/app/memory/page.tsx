'use client';

import { useEffect } from 'react';
import { BookMarked, RefreshCw } from 'lucide-react';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { FieldRow } from '@/components/repo/FieldRow';
import { Unavailable } from '@/components/repo/Unavailable';
import { useRepo } from '@/lib/store/repo';
import { useUi } from '@/lib/store/ui';

/**
 * Business Memory — read-only projection.
 *
 * Renders whatever sections the file contains, in file order. There is no
 * hardcoded list of expected sections: if the advisor adds a category next year,
 * it appears here without a code change, and if one is absent it simply is not
 * shown. Imposing an expected shape would make the cockpit an authority on the
 * schema, which it is not.
 *
 * No editing, ever. Memory is maintained through conversation, which is what
 * keeps provenance honest.
 */
export default function MemoryPage() {
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

  if (!workspacePath) {
    return (
      <>
        <ScreenHeader title="Memory" subtitle="Read-only" />
        <EmptyState
          icon={BookMarked}
          title="No repository selected"
          description="Choose the D.W.I.G.I repository directory in Settings."
        />
      </>
    );
  }

  const memory = snapshot?.memory;

  return (
    <>
      <ScreenHeader
        title="Memory"
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
        <div className="mx-auto max-w-reading px-6 py-6">
          {!memory && (
            <p className="text-[13px] text-faint">Reading repository…</p>
          )}

          {memory && !memory.ok && (
            <Unavailable label="Business Memory" reason={memory.reason} />
          )}

          {memory?.ok && (
            <div className="space-y-8">
              {memory.value.sections.map((section) => (
                <section key={section.title}>
                  <h2 className="mb-1 text-[13px] font-semibold tracking-tight text-ink">
                    {section.title}
                  </h2>
                  <div>
                    {section.fields.map((field) => (
                      <FieldRow key={field.key} field={field} />
                    ))}
                  </div>
                </section>
              ))}

              <p className="border-t border-line pt-4 text-2xs leading-relaxed text-faint">
                Values are shown exactly as recorded, with their provenance. The advisor
                maintains this file through conversation — the cockpit never edits it.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
