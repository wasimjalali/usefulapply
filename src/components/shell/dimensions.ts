import { CANVAS_MIN_WIDTH } from '@/lib/shell/conversation-width';

/**
 * Fixed widths of the shell's columns, in px. A folded column stays laid out
 * behind its rail at the width it will show at, and the compact breakpoint is
 * where the open columns stop fitting, both computed from these, so they are
 * the one source for the sidebar, the rails and the breakpoint.
 */

/** The sidebar, border included. */
export const SIDEBAR_WIDTH = 224;

/** A folded column's rail, the conversation's or the canvas's. */
export const RAIL_WIDTH = 48;

/** The conversation's narrowest default width beside the canvas. */
export const CONVERSATION_FLOOR = 400;

/** The sash between the conversation and the canvas. */
export const SASH_WIDTH = 1;

/** One CV page plus its margins (816 + 128): all the canvas ever needs. */
export const CANVAS_PAGE_WIDTH = 944;

/**
 * The widest compact window. Narrower, the sidebar, the conversation floor,
 * the sash and the canvas floor no longer fit side by side, so the chat and
 * the canvas take turns for the row.
 */
export const COMPACT_MAX_WIDTH = SIDEBAR_WIDTH + CONVERSATION_FLOOR + SASH_WIDTH + CANVAS_MIN_WIDTH - 1;
