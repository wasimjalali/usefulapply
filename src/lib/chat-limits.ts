/**
 * How many earlier turns a local (`session-`) conversation replays to /api/chat: the client sends this many and the
 * route keeps at most this many. A saved application reads its whole history from D1 and compacts it instead.
 * Seven, not ten, since 2026-10-23: with CHAT_TURN_MAX_CHARS at 13,000 the worst case (seven German turns at the cut
 * plus the new one, shaped like real ads with line breaks and quotes, tools, rules and the longest CV summaries) has
 * to stay under INPUT_REFUSE_ABOVE (chat-prompt.test.ts pins it). Eight estimated 91,402 tokens with that filler.
 */
export const CHAT_LOCAL_REPLAY_TURNS = 7;
