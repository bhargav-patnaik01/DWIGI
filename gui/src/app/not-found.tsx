'use client';

import Link from 'next/link';
import { Compass } from 'lucide-react';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { EmptyState } from '@/components/shared/EmptyState';

/**
 * The screen a bad route lands on.
 *
 * ---------------------------------------------------------------------------
 * A DESKTOP APPLICATION SHOULD NOT SAY "404"
 * ---------------------------------------------------------------------------
 * There is no address bar here, so a founder cannot have mistyped a URL. Reaching
 * this screen means something inside the application pointed somewhere that does
 * not exist — most likely a deep link written against a different version.
 *
 * So the copy says that, in those terms, and offers the way back. A page reading
 * "404 — Not Found" would be the application admitting it is a web app wearing a
 * window.
 */
export default function NotFound() {
  return (
    <>
      <ScreenHeader title="Not found" />
      <EmptyState
        icon={Compass}
        title="That screen isn’t here"
        description="The link that brought you here points somewhere this version of D.W.I.G.I doesn’t have. It may have been written for a newer version."
        action={
          // A styled link rather than a Button wrapping one: `Button` renders a
          // `<button>`, and an anchor inside a button is neither keyboard- nor
          // screen-reader-correct.
          <Link
            href="/"
            className="inline-flex h-8 select-none items-center justify-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-colors duration-150 ease-quiet hover:bg-elevated"
          >
            Back to Chat
          </Link>
        }
      />
    </>
  );
}
