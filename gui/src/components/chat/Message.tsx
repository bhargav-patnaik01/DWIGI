'use client';

import { Markdown } from '@/components/shared/Markdown';
import { CopyButton } from '@/components/shared/CopyButton';
import type { ChatMessage } from '@/lib/store/chat';

/**
 * One turn in the transcript.
 *
 * The founder's own words are shown as plain text, deliberately unrendered — what
 * they typed is what they see. Advisor output goes through markdown because the
 * advisor writes structured memos.
 */
export function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-up">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-elevated px-3.5 py-2.5">
          <p className="whitespace-pre-wrap text-[13.5px] leading-[1.6] text-ink">
            {message.text}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="group animate-fade-up">
      <Markdown source={message.text} />

      {/* Copy appears only on a settled message: offering it mid-stream would
          copy a partial recommendation. */}
      {!message.streaming && message.text.length > 0 && (
        <div className="mt-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <CopyButton value={message.text} />
        </div>
      )}

      {message.streaming && message.text.length === 0 && (
        <div className="flex items-center gap-1.5 py-1">
          <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-accent" />
          <span className="text-[13px] text-faint">Thinking</span>
        </div>
      )}
    </div>
  );
}
