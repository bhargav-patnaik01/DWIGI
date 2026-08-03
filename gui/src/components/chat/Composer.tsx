'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { ModeSelector } from '@/components/chat/ModeSelector';
import { cn } from '@/lib/utils';

interface ComposerProps {
  disabled: boolean;
  busy: boolean;
  onSend(text: string): void;
  onCancel(): void;
  placeholder: string;
}

/**
 * Input surface.
 *
 * Does exactly one thing to the text: nothing. `onSend` receives the raw string.
 * No trimming beyond an empty-check, no normalisation, no prompt shaping — the
 * verbatim-input invariant starts here, at the keyboard.
 */
export function Composer({ disabled, busy, onSend, onCancel, placeholder }: ComposerProps) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Cmd/Ctrl+K focuses the composer. There is no command palette in V1, so the
  // shortcut does the one useful thing it can rather than opening an empty shell.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Grow with content up to a ceiling, then scroll internally.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = useCallback(() => {
    if (busy || disabled) return;
    if (value.trim().length === 0) return;
    onSend(value);
    setValue('');
  }, [busy, disabled, onSend, value]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter and Cmd/Ctrl+Enter both send. Shift+Enter inserts a newline, because a
    // composer that swallows newlines makes multi-paragraph context painful to give.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === 'Escape' && busy) {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="px-5 pb-5">
      {/* Above the input, where a choice about the next conversation belongs —
          close enough to be seen before typing, outside the box so it never
          reads as an attribute of the message being written. */}
      <div className="mb-2">
        <ModeSelector disabled={disabled} />
      </div>

      <div
        className={cn(
          'mx-auto flex max-w-reading items-end gap-2 rounded-xl border bg-surface p-2',
          'transition-colors duration-150 ease-quiet',
          disabled ? 'border-line opacity-60' : 'border-line focus-within:border-faint'
        )}
      >
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          className={cn(
            'flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[13.5px] leading-[1.6]',
            'text-ink placeholder:text-faint focus:outline-none disabled:cursor-not-allowed'
          )}
        />

        {busy ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Stop"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-ink"
          >
            <Square className="h-3.5 w-3.5" strokeWidth={2} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={disabled || value.trim().length === 0}
            aria-label="Send"
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              'transition-colors duration-150 ease-quiet',
              value.trim().length > 0 && !disabled
                ? 'bg-accent text-accent-ink hover:bg-accent/90'
                : 'text-faint'
            )}
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Quiet affordance. Hidden while typing so it never competes with content. */}
      {value.length === 0 && !disabled && (
        <p className="mx-auto mt-2 max-w-reading px-1 text-2xs text-faint">
          <kbd className="font-mono">Enter</kbd> to send ·{' '}
          <kbd className="font-mono">Shift+Enter</kbd> for a new line
          {busy && (
            <>
              {' '}· <kbd className="font-mono">Esc</kbd> to stop
            </>
          )}
        </p>
      )}
    </div>
  );
}
