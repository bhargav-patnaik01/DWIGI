'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import { AppMark } from '@/components/shared/AppMark';
import { cn } from '@/lib/utils';

interface WelcomeProps {
  onStart: () => void;
  /** True while the first conversation is being created and the turn sent. */
  starting: boolean;
  /** Why Get Started cannot proceed, or null when it can. */
  blockedReason: string | null;
}

/**
 * First-run welcome.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SCREEN DOES NOT CONTAIN
 * ---------------------------------------------------------------------------
 * No onboarding questions. No fields, no schema, no progress steps, no
 * "what stage is your company at". Every one of those exists already in
 * `core/onboarding/memory_protocol.md`, and putting a second copy here would
 * guarantee the two drift — with the founder answering the copy that is wrong.
 *
 * This screen explains what the system is and gets out of the way. `onStart`
 * hands control to the engine's own onboarding, and the first words the founder
 * reads about their own business come from the advisor.
 */
export function Welcome({ onStart, starting, blockedReason }: WelcomeProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Drag region so the frameless macOS title bar still moves the window. */}
      <div className="drag-region h-12 shrink-0" />

      <div className="flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-[27rem]">
          {/*
            Larger here than anywhere else in the application.

            This is the one place the mark is the subject rather than a label, and
            `gui/icon.png` is a full logo lockup rather than a bare glyph — at the
            52px used elsewhere its wordmark degrades into texture. A hero size lets
            it read as what it is.
          */}
          <Stagger delay={0}>
            <AppMark size={96} />
          </Stagger>

          <Stagger delay={60}>
            <h1 className="mt-6 text-[26px] font-semibold leading-tight tracking-tight text-ink">
              D.W.I.G.I
            </h1>
          </Stagger>

          <Stagger delay={120}>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              Don&rsquo;t Worry I Got It
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">
              A Chief of Staff for founders who decide alone.
            </p>
          </Stagger>

          <Stagger delay={200}>
            <p className="mt-6 text-[13.5px] leading-relaxed text-muted">
              Behind that single voice is an executive council. A decision you bring
              here is examined through several executive perspectives at once —
              strategy, capital, execution, revenue, product, risk — and you receive
              one considered recommendation rather than a survey of opinions.
            </p>
          </Stagger>

          <Stagger delay={260}>
            <p className="mt-3.5 text-[13.5px] leading-relaxed text-muted">
              It learns your business over time, records how you decided, and tells
              you when it disagrees.
            </p>
          </Stagger>

          <Stagger delay={340}>
            <div className="mt-9">
              <button
                type="button"
                onClick={onStart}
                disabled={starting || blockedReason !== null}
                className={cn(
                  'group inline-flex h-10 items-center gap-2 rounded-lg px-4',
                  'bg-accent text-[13px] font-medium text-accent-ink',
                  'transition-[opacity,transform] duration-200 ease-quiet',
                  'hover:opacity-90 active:scale-[0.985]',
                  'disabled:cursor-not-allowed disabled:opacity-45'
                )}
              >
                {starting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                    Starting
                  </>
                ) : (
                  <>
                    Get Started
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-200 ease-quiet group-hover:translate-x-0.5"
                      strokeWidth={2}
                    />
                  </>
                )}
              </button>

              {blockedReason && (
                <p className="mt-3 text-[13px] leading-relaxed text-caution">{blockedReason}</p>
              )}
            </div>
          </Stagger>

          <Stagger delay={440}>
            <div className="mt-12 border-t border-line pt-5">
              <p className="text-[12.5px] leading-relaxed text-faint">
                Created by Bhargav Patnaik for all the founders out there.
              </p>
            </div>
          </Stagger>
        </div>
      </div>
    </div>
  );
}

/**
 * One step of the entrance sequence.
 *
 * Delay is inline because Tailwind cannot generate a class per offset, and the
 * offsets are content decisions rather than design tokens. `prefers-reduced-
 * motion` collapses every animation globally in `globals.css`, so this needs no
 * separate guard — the elements simply appear.
 */
function Stagger({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <div className="animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
