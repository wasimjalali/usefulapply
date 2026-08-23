/**
 * One-step undo for a mechanical CV edit. Entirely client-side.
 *
 * The snapshot IS the live store object taken just before the edit is applied,
 * so restoring it restores `analysis`, `sectionHeaders` and `localizedStrings`
 * by construction rather than by reassembling them, which is where a
 * reassembled undo would quietly lose one of them.
 *
 * One module-level slot, overwritten by each new edit, so it is genuinely
 * single-step and not the beginning of an edit history nobody asked for. Module
 * level rather than a ref for the same reason `followUpDone` is: ChatPanel
 * mounts twice on desktop, and a per-mount slot would give the two mounts
 * different ideas about what undo means.
 *
 * There is deliberately no expiry. Phase 4 settled this for persisted chips:
 * expiry punishes a legitimate scroll-back, and the guards that matter here are
 * in the chip's own action string.
 *
 * WHY THE CHIP CARRIES THE DIGEST, and why one slot is not enough on its own.
 * The chip lives on in the message history. With `undo-cv-edit:<sessionId>`
 * alone, turn 1's chip and turn 2's chip are byte-identical strings, so
 * scrolling back and clicking turn 1's chip ("I moved your Docker bullet up")
 * reverted whatever turn 2 did instead, and said "Put back the way it was".
 * A chip that names the state its own edit produced can be told apart from
 * every other chip, so a stale one refuses instead of undoing a stranger.
 *
 * ACTION STRING: `undo-cv-edit:<sessionId>:<appliedDigest>`, where
 * appliedDigest is cvStructureDigest() of the CV that edit produced (16 lower
 * case hex characters). Chips written before this change carry no digest and
 * are still parsed, so a transcript from an earlier session keeps working; they
 * fall back to the live-digest check alone, which is what they always had.
 */

import type { TailoredCV } from './types';

let slot: { sessionId: string; cv: TailoredCV; appliedDigest: string } | null = null;

/**
 * Remember the pre-edit CV, along with the digest of what the edit produced.
 * Overwrites whatever was there.
 */
export function rememberUndo(sessionId: string, cv: TailoredCV, appliedDigest: string): void {
  slot = { sessionId, cv, appliedDigest };
}

/**
 * The two halves of an undo chip's target: everything after `undo-cv-edit:`.
 *
 * Exported so the click handler and this module cannot disagree about where the
 * session id stops and the digest starts. Returns null for anything malformed,
 * which the caller treats as a chip to ignore.
 */
export function parseUndoChip(
  chipTarget: string,
): { sessionId: string; appliedDigest: string | null } | null {
  if (!chipTarget || chipTarget.length > 200) return null;
  const colon = chipTarget.indexOf(':');
  if (colon < 0) return { sessionId: chipTarget, appliedDigest: null };
  const sessionId = chipTarget.slice(0, colon);
  const appliedDigest = chipTarget.slice(colon + 1);
  if (!sessionId || !appliedDigest) return null;
  return { sessionId, appliedDigest };
}

/**
 * Take the snapshot back, but only for the edit this chip is for, only in the
 * application it was taken in, and only while the CV still looks exactly as
 * that edit left it.
 *
 * `chipTarget` is everything after `undo-cv-edit:` in the clicked action.
 * `liveDigest` is cvStructureDigest() of the CV in the store right now.
 *
 * Three separate refusals, and WHICH ONE fires decides whether the slot is
 * thrown away:
 *
 *   wrong application   Another application's chip. The slot belongs to a live
 *                       edit somewhere else and this click has nothing to do
 *                       with it, so it is LEFT ALONE. Clearing here meant a
 *                       click on a stale chip in application A silently
 *                       destroyed application B's working undo.
 *   wrong edit          An older turn's chip in the right application. Same
 *                       reasoning: the slot holds a NEWER edit that is still
 *                       undoable, so it is left alone.
 *   CV has moved on     This chip's own edit, but the CV changed since (a
 *                       canvas edit, a confirmed delete). The snapshot is stale
 *                       and restoring it would eat that later work, so it is
 *                       refused AND dropped.
 */
export function takeUndo(chipTarget: string, liveDigest: string): TailoredCV | null {
  const chip = parseUndoChip(chipTarget);
  if (!chip || !slot) return null;
  if (slot.sessionId !== chip.sessionId) return null;
  if (chip.appliedDigest !== null && slot.appliedDigest !== chip.appliedDigest) return null;
  if (slot.appliedDigest !== liveDigest) {
    slot = null;
    return null;
  }
  const { cv } = slot;
  slot = null;
  return cv;
}
