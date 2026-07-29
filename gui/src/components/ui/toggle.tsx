'use client';

import { cn } from '@/lib/utils';

interface ToggleProps {
  checked: boolean;
  onChange(next: boolean): void;
  /** Accessible name. Required — a switch with no label is unusable. */
  label: string;
  disabled?: boolean;
  /** Shown as the native tooltip, and the reason a disabled switch is disabled. */
  title?: string;
}

/**
 * Accessible on/off switch.
 *
 * `role="switch"` with `aria-checked` rather than a styled checkbox: a screen
 * reader should announce "on"/"off", not "checked". Keyboard activation comes free
 * from using a real button.
 */
export function Toggle({ checked, onChange, label, disabled, title }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full',
        'border transition-colors duration-150 ease-quiet',
        checked ? 'border-accent/40 bg-accent/80' : 'border-line bg-elevated',
        disabled && 'cursor-not-allowed opacity-45'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute h-[16px] w-[16px] rounded-full bg-canvas',
          'transition-transform duration-150 ease-quiet',
          checked ? 'translate-x-[19px]' : 'translate-x-[3px]'
        )}
      />
    </button>
  );
}
