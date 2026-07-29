'use client';

import { useEffect, useState } from 'react';
import { History, Pencil, Plus, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChat } from '@/lib/store/chat';
import { useConversations } from '@/lib/store/conversations';
import { cn } from '@/lib/utils';

/**
 * Conversation history.
 *
 * Lists past conversations for the current repository, newest activity first,
 * and starts new ones. It shows the founder's own truncated words as each title
 * — never a generated description of what a conversation was about, which would
 * be the cockpit forming a view on the content of a deliberation.
 *
 * ---------------------------------------------------------------------------
 * WHY SWITCHING IS DISABLED MID-TURN RATHER THAN JUST REFUSED
 * ---------------------------------------------------------------------------
 * The store refuses a switch while a turn is in flight, because the running turn
 * would otherwise be filed under whichever transcript was loaded next. That guard
 * is the invariant and stays where it is. Disabling the controls here is the
 * courtesy on top of it: a founder should see that an action is unavailable
 * before clicking, not be told afterwards that their click did nothing.
 */
export function ConversationMenu({ workspacePath }: { workspacePath: string }) {
  const summaries = useConversations((s) => s.summaries);
  const activeId = useConversations((s) => s.activeId);
  const open = useConversations((s) => s.open);
  const startNew = useConversations((s) => s.startNew);
  const remove = useConversations((s) => s.remove);
  const rename = useConversations((s) => s.rename);

  // Mirrors `turnInFlight()` in the store. A paused turn awaiting permission is
  // still a turn: it resumes into whatever transcript is loaded when it does.
  const status = useChat((s) => s.status);
  const busy = status === 'working' || status === 'awaiting-permission';

  const [showing, setShowing] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // Escape closes, matching every other dismissible surface in the app.
  useEffect(() => {
    if (!showing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowing(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showing]);

  const close = () => {
    setShowing(false);
    setConfirming(null);
    setEditing(null);
  };

  /** Commit a rename. An unchanged or emptied title is a cancel, not a write. */
  const commitRename = (id: string, previous: string) => {
    const next = draft.trim();
    setEditing(null);
    if (!next || next === previous) return;
    void rename(id, next);
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void startNew(workspacePath)}
        disabled={busy}
        title={busy ? 'The advisor is still answering' : undefined}
        aria-label="Start a new conversation"
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} />
        New
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={() => setShowing((value) => !value)}
        aria-expanded={showing}
        aria-label="Conversation history"
      >
        <History className="h-4 w-4" strokeWidth={1.75} />
        History
        {summaries.length > 0 && (
          <span className="text-2xs text-faint">{summaries.length}</span>
        )}
      </Button>

      {showing && (
        <>
          {/* Click-away layer. Sits under the panel, over everything else. */}
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden />

          <div
            role="menu"
            className={cn(
              // Positioned against AppShell's `relative` main pane, so it hangs
              // just below the 48px header without escaping over the sidebar.
              'absolute right-4 top-[52px] z-50 w-[320px] overflow-hidden rounded-xl',
              'border border-line bg-surface shadow-2xl animate-fade-up'
            )}
          >
            {summaries.length === 0 ? (
              <p className="px-3.5 py-4 text-[13px] leading-relaxed text-muted">
                No saved conversations for this repository yet.
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto py-1">
                {summaries.map((entry) => {
                  const isActive = entry.id === activeId;
                  // Reading a conversation is never blocked; only leaving the one
                  // being written to is.
                  const switchBlocked = busy && !isActive;

                  if (editing === entry.id) {
                    return (
                      <div key={entry.id} className="px-2.5 py-2">
                        <input
                          autoFocus
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onBlur={() => commitRename(entry.id, entry.title)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitRename(entry.id, entry.title);
                            }
                            // Stopped here so the panel's own Escape handler does
                            // not close the menu out from under an edit.
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              event.stopPropagation();
                              setEditing(null);
                            }
                          }}
                          aria-label="Conversation title"
                          className={cn(
                            'w-full rounded-lg border border-accent/40 bg-elevated px-2 py-1',
                            'text-[13px] leading-snug text-ink outline-none'
                          )}
                        />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        'group flex items-start gap-2 px-2.5 py-2',
                        isActive && 'bg-elevated'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          void open(entry.id);
                          close();
                        }}
                        disabled={switchBlocked}
                        title={switchBlocked ? 'The advisor is still answering' : undefined}
                        className="min-w-0 flex-1 text-left disabled:cursor-default"
                      >
                        <p
                          className={cn(
                            'flex items-center gap-1.5 text-[13px] leading-snug',
                            isActive ? 'text-ink' : 'text-muted group-hover:text-ink',
                            switchBlocked && 'opacity-40 group-hover:text-muted'
                          )}
                        >
                          {/* A single-agent conversation is marked in the list, not
                              only in its own header. Two entries whose titles read
                              alike must not be indistinguishable in scope. */}
                          {entry.mode.kind === 'lens' && (
                            <User
                              className="h-3 w-3 shrink-0 text-accent"
                              strokeWidth={2}
                              aria-label="Single-executive conversation"
                            />
                          )}
                          <span className="truncate">{entry.title}</span>
                        </p>
                        <p
                          className={cn(
                            'mt-0.5 text-2xs text-faint',
                            switchBlocked && 'opacity-40'
                          )}
                        >
                          {formatWhen(entry.updatedAt)}
                          {entry.messageCount > 0 && ` · ${entry.messageCount} messages`}
                          {/* Stated plainly: a conversation with no session handle
                              has never been sent to the advisor, so there is
                              nothing for it to continue. */}
                          {entry.sessionId === null && ' · not yet started'}
                        </p>
                      </button>

                      {confirming === entry.id ? (
                        <button
                          type="button"
                          onClick={() => {
                            void remove(entry.id);
                            setConfirming(null);
                          }}
                          className="shrink-0 rounded-lg px-2 py-1 text-2xs text-critical hover:bg-critical/10"
                        >
                          Delete
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setDraft(entry.title);
                              setConfirming(null);
                              setEditing(entry.id);
                            }}
                            aria-label={`Rename ${entry.title}`}
                            className={cn(
                              'shrink-0 rounded-lg p-1.5 text-faint opacity-0 transition-opacity',
                              'hover:bg-elevated hover:text-ink group-hover:opacity-100'
                            )}
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setConfirming(entry.id)}
                            disabled={isActive && busy}
                            aria-label={`Delete ${entry.title}`}
                            className={cn(
                              'shrink-0 rounded-lg p-1.5 text-faint opacity-0 transition-opacity',
                              'hover:bg-critical/10 hover:text-critical group-hover:opacity-100',
                              'disabled:opacity-0'
                            )}
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="border-t border-line px-3.5 py-2 text-2xs leading-relaxed text-faint">
              {busy
                ? 'The advisor is still answering. Finish or stop the turn to change conversations.'
                : 'Stored outside the repository, in this app’s own data folder.'}
            </p>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Relative day, then absolute date.
 *
 * Deliberately coarse. A precise timestamp on a list of deliberations invites
 * reading significance into the gap between them.
 */
function formatWhen(at: number): string {
  const days = Math.floor((Date.now() - at) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
