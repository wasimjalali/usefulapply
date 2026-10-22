/**
 * The reply the chat route returns once its tool loop is over: the model's own words when the loop ran
 * clean, a fixed line when it stopped early or a tool result could not be used. Pure, so every exit of
 * the loop is pinned by loop-reply.test.ts.
 */

import { InputBudgetError } from '@/lib/models/haiku';
import type { ChatActionChip, ExecutedEffect } from './types';

// The in-loop input budget is the model layer's (token-budget.ts): a round is
// only sent if the previous round's measured input plus an estimate of what was
// appended since stays under INPUT_REFUSE_ABOVE.
export const BUDGET_REPLY = 'That was too much to read in one go. Ask about one thing at a time.';

const FAILED_REPLY = "I couldn't complete that action. Try again in a moment.";
const FAILED_CV_REWRITE_REPLY = "I couldn't prepare that CV rewrite. Try again in a moment.";

export interface ChatLoopState {
  /** The model's last text ('' when the loop threw before one came back). */
  reply: string;
  executed: ExecutedEffect[];
  confirmActions: ChatActionChip[];
  /** Tools whose handler threw. */
  failedToolNames: string[];
  /** Tools whose result was over the cap and replaced (capToolResult). */
  oversizedToolNames: string[];
  /** The first tool of the last completed round, '' when no tool round completed. */
  lastToolNames: string;
}

/**
 * `loopFailure` is what the loop threw, or null when it ended normally. Throws the error back when it is a
 * real outage (the first model call failed), which belongs on the route's 500 path.
 */
export function settleChatReply(
  state: ChatLoopState,
  loopFailure: { error: unknown } | null,
): { reply: string; confirmActions: ChatActionChip[] } {
  let reply = state.reply;
  let confirmActions = state.confirmActions;

  if (loopFailure) {
    const loopError = loopFailure.error;
    if (loopError instanceof InputBudgetError) {
      // Too much to read: the history, a pasted ad and the tool results
      // together would pass the input budget. Not an outage, so it answers
      // with a fixed reply, and effects that already ran still go back.
      console.error('Chat stopped at the input budget:', loopError.message);
      reply = state.executed.length === 0 ? BUDGET_REPLY : replyAfterExecutedEffects(state.executed);
    } else if (state.executed.length === 0) {
      // A write may already be committed when a later round fails (a
      // refusal, a max_tokens stop or an empty reply). Losing the reply is
      // survivable; telling the user nothing happened when a row already
      // moved is not, so the executed effects still go back (else branch).
      // No tool round completed means the first model call failed, which is
      // still a real request outage and belongs on the route's normal 500
      // path. Once lastToolNames is set, a tool result was already returned
      // and only the follow-up wording failed. Surface that known shape
      // directly instead of falling through to the client's generic chat
      // fallback.
      if (!state.lastToolNames) throw loopError;
      console.error('Chat reply failed after a tool round:', loopError);
      reply = state.lastToolNames === 'propose_cv_rewrite' ? FAILED_CV_REWRITE_REPLY : FAILED_REPLY;
    } else {
      console.error('Chat tool loop failed after executed effects:', loopError);
      reply = replyAfterExecutedEffects(state.executed);
    }
    // Every early stop drops the proposal chips: a half-finished turn cannot
    // offer an action beside "I couldn't finish the reply". Executed effects
    // are not chips and still go back.
    confirmActions = [];
  } else if (state.oversizedToolNames.length > 0 && state.executed.length === 0 && state.failedToolNames.length === 0) {
    // A result too large to read was replaced by an error the model saw. With
    // nothing else done this turn, the useful answer is fixed: ask about one
    // thing at a time, and no chip the model proposed beside its own reply
    // stays next to that line. When a write ran in the same turn, the model's
    // reply stands: it read that write's result and the too-large error, and a
    // fixed line here would hide the write. A handler that threw is settled
    // below, which keeps the chips of the handlers that ran.
    reply = BUDGET_REPLY;
    confirmActions = [];
  }

  // A handler exception is a known failure even when the model answers the
  // tool result with a generic conversational fallback. Do not let that text
  // turn a failed CV rewrite proposal into "I'm here to help" or otherwise
  // hide what did not run. Never append to free-form model copy after a known
  // handler failure: a mixed round may contain a stale success claim for the
  // action that did not run. Successful handlers keep their action chips and
  // effects, but the reply itself is the deterministic failure shape.
  if (state.failedToolNames.length > 0) {
    reply = state.failedToolNames.includes('propose_cv_rewrite') ? FAILED_CV_REWRITE_REPLY : FAILED_REPLY;
  }

  return { reply, confirmActions };
}

/**
 * The reply when the loop stopped after effects ran. The message has to point
 * at the right place, and it has to be true of each kind of effect. A tracker
 * write is already committed to D1, so "saved" is a fact. A
 * cv_structure_updated effect has committed nothing: it is a proposal the
 * client can still refuse on a digest mismatch.
 */
function replyAfterExecutedEffects(executed: ExecutedEffect[]): string {
  const touchedCv = executed.some((effect) => effect.type === 'cv_structure_updated');
  const touchedRow = executed.some((effect) => effect.type === 'tracker_updated');
  if (touchedRow && touchedCv) {
    return "That change saved, but I couldn't finish the reply. The tracker row is updated, and the CV edit is in the CV panel if it went through.";
  }
  if (touchedRow) {
    return "That change saved, but I couldn't finish the reply. Check the tracker for the updated row.";
  }
  if (touchedCv) {
    return "I couldn't finish the reply. If the CV edit went through it is in the CV panel, with an Undo button on it.";
  }
  return "I couldn't finish the reply. Ask me again and I'll pick it up from there.";
}
