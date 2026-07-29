'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/**
 * Every variant declares its own background explicitly.
 *
 * Relying on Tailwind preflight's `background-color: transparent` left the actual
 * surface up to the user agent, and `-webkit-appearance: button` meant Windows
 * could paint a native button face instead — producing light-filled buttons on a
 * dark screen. Stating the background makes rendering identical everywhere.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent/90 active:bg-accent/80',
  ghost: 'appearance-none bg-transparent text-muted hover:bg-elevated hover:text-ink',
  outline: 'appearance-none border border-line bg-surface text-ink hover:bg-elevated',
  danger: 'appearance-none bg-transparent text-critical hover:bg-critical/10',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  icon: 'h-8 w-8',
};

/**
 * The single button primitive. Variants are closed on purpose — a fixed set
 * keeps the interface visually coherent, and a component needing a fifth
 * variant usually needs a different component.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'ghost', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-lg font-medium',
        'transition-colors duration-150 ease-quiet',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  )
);

Button.displayName = 'Button';
