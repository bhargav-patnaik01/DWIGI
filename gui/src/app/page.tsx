'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, AlertTriangle } from 'lucide-react';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Message } from '@/components/chat/Message';
import { Composer } from '@/components/chat/Composer';
import { ActivityTimeline } from '@/components/chat/ActivityTimeline';
import { ConversationMenu } from '@/components/chat/ConversationMenu';
import { LensScopeNotice } from '@/components/chat/LensScopeNotice';
import { MemoryScopeBadge } from '@/components/chat/MemoryScopeBadge';
import { Welcome } from '@/components/onboarding/Welcome';
import { getAdvisorTransport } from '@/lib/advisor/transport';
import { startConversationRecorder } from '@/lib/conversations/recorder';
import { useChat } from '@/lib/store/chat';
import { useConversations } from '@/lib/store/conversations';
import { useUi } from '@/lib/store/ui';
import { useRepo } from '@/lib/store/repo';
import { useCouncilConfig, useExecutive } from '@/lib/executives';
import { shouldShowWelcome } from '@shared/onboarding';
import {
  lensMode,
  ONBOARDING_TURN,
  withMemoryScope,
  type RuntimeMode,
} from '@shared/runtime-modes';
import { hasHost } from '@/lib/utils';

/**
 * Chat — the primary surface.
 *
 * Owns wiring only: subscribe to the transport, hand events to the reducer, send
 * what the user typed. It makes no decision about what any event means, which is
 * why there is no `if (event.kind === ...)` anywhere in this file.
 *
 * ---------------------------------------------------------------------------
 * THE THREE THINGS IT DOES DECIDE
 * ---------------------------------------------------------------------------
 * 1. Which screen to draw — welcome or chat. `shouldShowWelcome` owns the rule.
 * 2. Which runtime mode a turn carries — Council with the founder's configured
 *    lens pool, or the single executive this conversation belongs to.
 * 3. When to hand onboarding to the engine, which is once, on Get Started, by
 *    sending the repository's own `/begin` command.
 *
 * None of those involves interpreting the advisor's output, and none of them
 * composes reasoning instructions. Mode composition happens in the host.
 */
export default function ChatPage() {
  const workspacePath = useUi((s) => s.workspacePath);
  const onboardingStarted = useUi((s) => s.onboardingStarted);
  const markOnboardingStarted = useUi((s) => s.markOnboardingStarted);
  const devForceFirstRun = useUi((s) => s.devForceFirstRun);
  const defaultMemoryScope = useUi((s) => s.defaultMemoryScope);

  const snapshot = useRepo((s) => s.snapshot);

  const messages = useChat((s) => s.messages);
  const activity = useChat((s) => s.activity);
  const status = useChat((s) => s.status);
  const pending = useChat((s) => s.pendingPermissions);
  const lastError = useChat((s) => s.lastError);
  const applyEvent = useChat((s) => s.applyEvent);
  const appendUserMessage = useChat((s) => s.appendUserMessage);

  // `activeId` and `activeSessionId` are read via `getState()` inside callbacks
  // rather than subscribed to. Subscribing would re-run `ensureOpen`'s identity on
  // every session bind, and re-opening mid-turn would discard the turn in flight.
  const activeIncomplete = useConversations((s) => s.activeIncomplete);
  const activeMode = useConversations((s) => s.activeMode);
  const conversationError = useConversations((s) => s.error);
  const resumeLatest = useConversations((s) => s.resumeLatest);
  const startNew = useConversations((s) => s.startNew);

  const council = useCouncilConfig();
  const activeLens = useExecutive(activeMode.kind === 'lens' ? activeMode.lensId : null);

  const [available, setAvailable] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  /**
   * Which conversation the runtime currently has open.
   *
   * A ref rather than state because it must be read and written inside `send`
   * without re-rendering, and compared against `activeId` — switching
   * conversations has to re-open the session, since the runtime holds exactly one
   * session handle at a time.
   */
  const openedFor = useRef<string | null>(null);

  /* --------------------------------------------------- transport subscription */
  useEffect(() => {
    const transport = getAdvisorTransport();
    // Reducer is handed events verbatim. No filtering, no transformation.
    const unsubscribe = transport.subscribe(applyEvent);
    return unsubscribe;
  }, [applyEvent]);

  /* ------------------------------------------------------ transcript recording */
  // Mounted separately from the reducer subscription: the reducer draws the
  // transcript, the recorder makes it durable, and neither knows about the other.
  useEffect(() => startConversationRecorder(), []);

  /* -------------------------------------------------------------- resume */
  // Reopen the most recent conversation for this repository. Nothing is created
  // here — a launch that ends without a question asked should leave no trace.
  useEffect(() => {
    if (!workspacePath) return;
    void resumeLatest(workspacePath);
  }, [workspacePath, resumeLatest]);

  /* ------------------------------------------------------------- availability */
  useEffect(() => {
    let alive = true;
    void getAdvisorTransport()
      .isAvailable()
      .then((ok) => alive && setAvailable(ok))
      .catch(() => alive && setAvailable(false));
    return () => {
      alive = false;
    };
  }, []);

  /* ---------------------------------------------------------- open on demand */
  /**
   * Ensure the runtime has the active conversation's session open.
   *
   * ---------------------------------------------------------------------------
   * THE ONE LINE THAT MAKES RESUME WORK
   * ---------------------------------------------------------------------------
   * `resumeSessionId` is the stored handle. Passing it tells the transport to
   * continue that session rather than start a new one; omitting it — which is
   * what this did before — silently began a fresh conversation on every launch,
   * so the advisor met the founder as a stranger each morning.
   *
   * Re-opens whenever the active conversation changes, because the runtime holds
   * one session at a time. Keyed on the conversation id and not the session
   * handle: the handle legitimately changes from null to a real value after the
   * first turn, and re-opening then would discard the turn in flight.
   */
  const ensureOpen = useCallback(async () => {
    if (!workspacePath) return false;

    // Fresh conversations carry no handle yet. `undefined` means "start one",
    // which is exactly right, and is distinct from a handle we failed to load.
    const conversationId = useConversations.getState().activeId;
    if (!conversationId) return false;
    if (openedFor.current === conversationId) return true;

    try {
      await getAdvisorTransport().open({
        workspacePath,
        resumeSessionId: useConversations.getState().activeSessionId ?? undefined,
      });
      openedFor.current = conversationId;
      return true;
    } catch (error) {
      applyEvent({
        kind: 'error',
        turnId: null,
        message: error instanceof Error ? error.message : 'Could not open a session.',
        fatal: true,
      });
      return false;
    }
  }, [applyEvent, workspacePath]);

  /* ------------------------------------------------------------- auto-scroll */
  // Follow the stream only while the user is already at the bottom; yank the view
  // away from someone reading earlier output is worse than not following.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !pinned.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, activity, pending]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  /* -------------------------------------------------------------- runtime mode */
  /**
   * The mode this conversation's turns carry.
   *
   * A lens conversation always sends its own executive, regardless of Agent
   * Management: the founder picked that executive deliberately, and a lens
   * disabled for Council is still available to talk to directly. A Council
   * conversation sends the configured pool, which composes nothing at all while
   * the configuration is untouched.
   *
   * ---------------------------------------------------------------------------
   * THE SCOPE COMES FROM THE CONVERSATION, NOT FROM THE SETTING
   * ---------------------------------------------------------------------------
   * `activeMode.memory` was written into this conversation's record when it was
   * created and is never written again. `defaultMemoryScope` — the toggle by the
   * composer — is deliberately not read here.
   *
   * Reading the setting instead would be a one-word change with no visible
   * symptom until the day a founder flips the toggle and every thread in their
   * history quietly changes what it is grounded in. It is the single most likely
   * way this feature breaks, so the two values never meet in this file.
   *
   * It is also re-sent on *every* turn rather than declared once per session, so
   * a session the engine has forgotten — which the transport already reports and
   * recovers from — cannot silently return a Learning conversation to Business.
   */
  const mode: RuntimeMode = useMemo(
    () =>
      withMemoryScope(
        activeMode.kind === 'lens' && activeMode.lensId
          ? lensMode(activeMode.lensId)
          : council.mode,
        activeMode.memory
      ),
    [activeMode, council.mode]
  );

  /* -------------------------------------------------------------------- send */
  const send = useCallback(
    async (text: string) => {
      if (!workspacePath) return;
      pinned.current = true;

      /*
       * A conversation must exist before the turn starts, not after.
       *
       * The recorder persists on `turn-started`, and it can only write against an
       * existing conversation — so creating one lazily inside the event handler
       * would drop the first message of every new thread. Creating it here also
       * means `ensureOpen` has a session handle to consult.
       */
      if (!useConversations.getState().activeId) {
        await startNew(workspacePath);
        if (!useConversations.getState().activeId) return;
      }

      appendUserMessage(text);

      if (!(await ensureOpen())) return;
      try {
        await getAdvisorTransport().send(text, mode);
      } catch (error) {
        applyEvent({
          kind: 'error',
          turnId: null,
          message: error instanceof Error ? error.message : 'Send failed.',
          fatal: false,
        });
      }
    },
    [appendUserMessage, applyEvent, ensureOpen, mode, startNew, workspacePath]
  );

  /* --------------------------------------------------------------- onboarding */
  /**
   * Hand first-run onboarding to the engine.
   *
   * ---------------------------------------------------------------------------
   * THE ADVISOR SPEAKS FIRST, AND THIS IS THE WHOLE OF HOW
   * ---------------------------------------------------------------------------
   * A new conversation, then one turn carrying the repository's own `/begin`
   * command. Everything the founder then reads — the first question, its wording,
   * how many follow-ups it asks — comes from `core/onboarding/memory_protocol.md`.
   * There is no onboarding script in this application to drift out of step with it.
   *
   * `/begin` is sent as ordinary turn text, not as a mode: it invokes the command
   * directly and carries no runtime override. Agent Management is deliberately not
   * applied here, because onboarding is not a deliberation.
   */
  const beginOnboarding = useCallback(async () => {
    if (!workspacePath || starting) return;
    setStarting(true);
    try {
      await startNew(workspacePath);
      if (!useConversations.getState().activeId) return;

      // Recorded before the send so a launch interrupted mid-onboarding resumes
      // the conversation rather than offering to start over.
      markOnboardingStarted();

      if (!(await ensureOpen())) return;

      /*
       * Shown in the transcript, not hidden.
       *
       * The founder pressed a button and a command was sent on their behalf; the
       * honest thing is for it to appear in their own record of the conversation.
       * Rendering the chat as though the advisor opened unprompted would be the
       * cockpit concealing something it did.
       */
      appendUserMessage(ONBOARDING_TURN);
      await getAdvisorTransport().send(ONBOARDING_TURN);
    } catch (error) {
      applyEvent({
        kind: 'error',
        turnId: null,
        message:
          error instanceof Error ? error.message : 'Could not start the onboarding conversation.',
        fatal: false,
      });
    } finally {
      setStarting(false);
    }
  }, [
    appendUserMessage,
    applyEvent,
    ensureOpen,
    markOnboardingStarted,
    starting,
    startNew,
    workspacePath,
  ]);

  /* ------------------------------------------------------- single-agent chats */
  /*
   * Nothing here opens one.
   *
   * The Executive Board creates the conversation itself and then navigates, so
   * this screen has no cross-route intent to interpret — it simply draws whichever
   * conversation is active and reads its mode from the stored record. An earlier
   * attempt did the reverse and failed silently, because the two routes are
   * separate chunks in the static export and the store instance was not shared.
   */
  const returnToCouncil = useCallback(() => {
    if (!workspacePath) return;
    void startNew(workspacePath);
  }, [startNew, workspacePath]);

  const cancel = useCallback(() => {
    void getAdvisorTransport().cancel();
  }, []);

  /* ------------------------------------------------------------------ render */
  const noRuntime = available === false;
  const noWorkspace = !workspacePath;
  const blocked = noRuntime || noWorkspace;
  const busy = status === 'working' || status === 'awaiting-permission';

  const isLensChat = activeMode.kind === 'lens';

  /* --------------------------------------------------------------- first run */
  const welcome = shouldShowWelcome({
    hasWorkspace: Boolean(workspacePath),
    // In the browser preview there is no host to read a snapshot from, so no
    // claim about first run can be made and the normal screen is correct.
    snapshotLoaded: hasHost() ? snapshot !== null : true,
    memoryPresent: snapshot?.memoryPresent ?? false,
    onboardingStarted,
    forced: devForceFirstRun,
    /*
     * The *setting*, not the active conversation, and this is the one place that
     * is correct.
     *
     * The welcome screen is an invitation to create the next conversation, so
     * the scope that governs it is the one the next conversation would get. Every
     * other read in this file goes to `activeMode.memory`.
     */
    memoryScope: defaultMemoryScope,
  });

  if (welcome && messages.length === 0) {
    return (
      <Welcome
        onStart={() => void beginOnboarding()}
        starting={starting}
        blockedReason={
          noRuntime
            ? 'The Claude Code CLI could not be reached. The cockpit drives it as a child process and cannot substitute for it.'
            : null
        }
      />
    );
  }

  if (blocked && messages.length === 0) {
    return (
      <>
        <ScreenHeader title="Chat" subtitle="Chief of Staff" />
        <EmptyState
          icon={MessageSquare}
          title={noRuntime ? 'Runtime not found' : 'No repository selected'}
          description={
            noRuntime
              ? 'The Claude Code CLI could not be reached. The cockpit drives it as a child process and cannot substitute for it.'
              : 'Choose the D.W.I.G.I repository directory in Settings. The advisor reads its operating instructions from there.'
          }
        />
      </>
    );
  }

  /*
   * Header subtitle is the mode indicator.
   *
   * A lens conversation names its executive; a Council conversation with a
   * narrowed pool says so, because a founder who disabled two lenses months ago
   * should not have to remember that while reading a recommendation.
   */
  const subtitle = status === 'awaiting-permission'
    ? 'Awaiting permission'
    : busy
    ? 'Thinking'
    : isLensChat
      ? `${activeLens?.name ?? activeMode.lensId} · single executive`
      : council.isDefault
        ? 'Council · Chief of Staff'
        : `Council · ${council.enabled.size} of ${council.constructive.length} executives`;

  return (
    <>
      <ScreenHeader
        title={isLensChat ? `${activeLens?.name ?? activeMode.lensId} Chat` : 'Council Chat'}
        // Read from the conversation's own record, never from the setting.
        badge={<MemoryScopeBadge scope={activeMode.memory} />}
        subtitle={subtitle}
        actions={workspacePath ? <ConversationMenu workspacePath={workspacePath} /> : undefined}
      />

      {isLensChat && (
        <LensScopeNotice
          // The matrix is authoritative for the name. Falling back to the stored id
          // keeps the warning present even if the matrix has become unreadable —
          // losing the executive's display name must never lose the warning.
          lensName={activeLens?.name ?? activeMode.lensId ?? 'selected'}
          onReturnToCouncil={returnToCouncil}
          busy={busy}
        />
      )}

      <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto">
        {/* Either the opening state or the transcript — never both. Rendering both
            put an empty screen over its own scroll height and produced a scrollbar
            with nothing to scroll. */}
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-5">
            <div className="max-w-reading text-center animate-fade-up">
              <p className="text-[15px] font-medium text-ink">
                {isLensChat ? (activeLens?.name ?? 'Executive') : 'Chief of Staff'}
              </p>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
                {isLensChat
                  ? activeLens?.fields.Owns
                    ? `Ask about anything this executive owns: ${lowerFirst(activeLens.fields.Owns)}`
                    : 'Ask this executive about a decision inside their mandate.'
                  : 'Ask about a decision you are weighing. Depth is chosen to match what the decision is worth — small questions get short answers.'}
              </p>
            </div>
          </div>
        ) : (
        <div className="mx-auto max-w-reading space-y-5 px-5 py-6">
          {/* A transcript with a hole in it is still worth reading, but the
              founder is told it has one rather than left to assume it is whole. */}
          {activeIncomplete && (
            <p className="rounded-xl border border-caution/30 bg-caution/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
              Part of this stored transcript could not be read and has been left out.
              What the advisor itself remembers of the conversation is unaffected.
            </p>
          )}

          {messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}

          {activity.length > 0 && <ActivityTimeline items={activity} />}


          {/* Two independent failures, shown independently: a turn can fail while
              the transcript saves, and the transcript can fail to save while the
              turn succeeds. Collapsing them would misattribute either one. */}
          {[lastError, conversationError].filter(Boolean).map((message) => (
            <div
              key={message}
              className="flex gap-2.5 rounded-xl border border-critical/30 bg-critical/5 p-3.5"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-critical"
                strokeWidth={1.75}
              />
              <p className="text-[13px] leading-relaxed text-muted">{message}</p>
            </div>
          ))}
        </div>
        )}
      </div>

      <Composer
        disabled={blocked}
        busy={status === 'working'}
        onSend={send}
        onCancel={cancel}
        placeholder={
          noWorkspace
            ? 'Select a repository in Settings'
            : isLensChat
              ? `Ask ${activeLens?.name ?? 'this executive'}…`
              : 'Ask the Chief of Staff…'
        }
      />

    </>
  );
}

/**
 * Lowercase the first character of projected file text for use mid-sentence.
 *
 * Presentation only — the string itself is the matrix's own wording, and nothing
 * about its meaning is touched.
 */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
