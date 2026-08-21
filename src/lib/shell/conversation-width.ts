/**
 * The width the user dragged the conversation column to, if they ever did.
 *
 * null means "auto": the column keeps its responsive width, which is the
 * right default at every screen size. A number is an explicit override and
 * wins until the user double-clicks the sash to hand control back.
 */

const KEY = 'usefulapply-conversation-width';

/** Below this the chat stops being readable; above it the canvas is starved. */
export const CONVERSATION_MIN_WIDTH = 360;
/** The canvas needs at least this much to be worth showing at all. */
export const CANVAS_MIN_WIDTH = 480;

export function clampConversationWidth(width: number, viewportWidth: number, sidebarWidth: number): number {
  const max = Math.max(CONVERSATION_MIN_WIDTH, viewportWidth - sidebarWidth - CANVAS_MIN_WIDTH);
  return Math.round(Math.min(max, Math.max(CONVERSATION_MIN_WIDTH, width)));
}

export function readConversationWidth(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeConversationWidth(width: number | null): void {
  try {
    if (width === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, String(width));
  } catch {
    // ignore storage failures (private mode, quota)
  }
}
