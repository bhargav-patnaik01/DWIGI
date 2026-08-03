'use client';

import { BookOpen, Building2 } from 'lucide-react';
import { useConversations } from '@/lib/store/conversations';
import { useUi } from '@/lib/store/ui';
import { memoryScopeLabel } from '@/components/chat/MemoryScopeBadge';
import type { MemoryScope } from '@shared/runtime-modes';
import { cn } from '@/lib/utils';

/**
 * Choose what the **next** conversation is grounded in.
 *
 * ---------------------------------------------------------------------------
 * THE HARDEST PART OF THIS CONTROL IS SAYING WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------
 * It sets a default for conversations that do not exist yet. It does not switch
 * the conversation on screen, and it cannot: scope is written into a
 * conversation's record when it is created and never written again.
 *
 * A toggle that looks like it applies to what you are reading, but silently
 * applies to something you have not created, is worse than no toggle. So when
 * the selection would differ from the conversation on screen, the control says
 * so in plain words rather than relying on the founder to infer it from a badge
 * elsewhere. The line is deliberately not a warning — nothing is wrong — it is
 * a statement of which thing was just configured.
 *
 * It performs no reasoning and holds no rule about what either mode means. It
 * writes one enum into interface state; `.claude/commands/learning.md` owns
 * every consequence.
 */

const OPTIONS: {
  scope: MemoryScope;
  icon: typeof Building2;
  description: string;
}[] = [
  {
    scope: 'business',
    icon: Building2,
    description: 'Uses your Business Memory, journal, and calibration history.',
  },
  {
    scope: 'learning',
    icon: BookOpen,
    description: 'Reads nothing about your company. For learning how executives think.',
  },
];

export function ModeSelector({ disabled }: { disabled?: boolean }) {
  const selected = useUi((s) => s.defaultMemoryScope);
  const setScope = useUi((s) => s.setDefaultMemoryScope);
  const activeMode = useConversations((s) => s.activeMode);
  const activeId = useConversations((s) => s.activeId);

  // Only meaningful once a conversation exists to differ from.
  const differs = activeId !== null && activeMode.memory !== selected;

  return (
    <div className="mx-auto max-w-reading">
      <div
        role="radiogroup"
        aria-label="Conversation mode for new conversations"
        className="flex items-center gap-1"
      >
        <span className="mr-1 text-2xs text-faint">New conversation</span>

        {OPTIONS.map(({ scope, icon: Icon, description }) => {
          const active = selected === scope;
          return (
            <button
              key={scope}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              title={description}
              onClick={() => setScope(scope)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs',
                'transition-colors duration-150 ease-quiet',
                'disabled:pointer-events-none disabled:opacity-40',
                active
                  ? 'bg-elevated text-ink'
                  : 'text-faint hover:bg-elevated/60 hover:text-muted'
              )}
            >
              <Icon
                className={cn('h-3 w-3', active && scope === 'learning' && 'text-accent')}
                strokeWidth={2}
                aria-hidden
              />
              {memoryScopeLabel(scope)}
            </button>
          );
        })}
      </div>

      {differs && (
        <p className="mt-1.5 px-0.5 text-2xs leading-relaxed text-faint">
          Applies to your next conversation. This one stays{' '}
          <span className="text-muted">{memoryScopeLabel(activeMode.memory)}</span> — a
          conversation keeps the mode it was started in.
        </p>
      )}
    </div>
  );
}
