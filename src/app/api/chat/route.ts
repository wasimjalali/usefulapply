import { NextRequest, NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { buildHaikuRequest, callHaiku, InputBudgetError, type HaikuCallOptions, type HaikuResponse } from '@/lib/models/haiku';
import { providerHttpStatus } from '@/lib/models/anthropic';
import { estimateInputTokens, isOverRefuseLimit, projectNextInputTokens } from '@/lib/models/token-budget';
import {
  asCompactionBlock,
  COMPACT_ABOVE_TOKENS,
  summaryFormatProblem,
  COMPACTION_MAX_TOKENS,
  COMPACTION_RESERVE_TOKENS,
  splitForCompaction,
  type CompactionBlock,
} from '@/lib/models/compaction';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { getProfile } from '@/db/repos/profiles';
import {
  claimScreeningTurn,
  claimUserChatTurn,
  countUserChatMessages,
  getChatMessages,
  getSession,
  releaseScreeningTurn,
  storeChatReply,
} from '@/db/repos/sessions';
import { deleteChatCompaction, getChatCompaction, saveChatCompaction } from '@/db/repos/chatCompactions';
import { isChatMessageId, newChatMessageId } from '@/lib/chat-message-id';
import { SCREENING_TURN_CAP } from '@/lib/screening-answers';
import { generateScreeningReply, screeningAllowedForTier, screeningBudgetReply } from '@/lib/services/screening';
import {
  chatToolDefinitions,
  executeChatTool,
  type ChatActionChip,
  type ChatToolContext,
  type ExecutedEffect,
} from '@/lib/agents/chat-tools';
import { settleChatReply } from '@/lib/agents/chat-tools/loop-reply';
import { knownTimeZone, looksPasted } from '@/lib/agents/chat-tools/untrusted';
import {
  appendToolRound,
  buildChatMessages,
  buildCompactionMessages,
  buildMainChatPrompt,
  type ChatTurn,
} from '@/lib/agents/prompts/chat-prompt';
import { CHAT_COMPACTION_INSTRUCTIONS } from '@/lib/agents/prompts/chat-compaction-prompt';
import { isCvTemplateId } from '@/lib/cv-templates/catalog';
import { validateCvShape } from '@/lib/cv-structure/validate';
import type { TailoredCV } from '@/lib/cv-structure/types';
import { sanitizeDashes } from '@/lib/config/typo-corrections';
import { guardUnsupportedCvAdditionOffer } from '@/lib/agents/chat-reply-guard';
import { loadApplicantLogistics } from '@/lib/profile/logistics.server';

// Input/output limits. A pasted job ad is the main thing that arrives here:
// the model reads it and calls propose_application, which is how a run starts.
// So the cap has to fit a real ad, and it matches the one /api/agent-v2
// enforces on the job description, or chat would refuse text generation
// accepts.
const MAX_MESSAGE_LENGTH = 30_000;
const MAX_SCREENING_MESSAGE_LENGTH = 5_000;
// User messages per saved application, counted in D1 (chat_messages). Compaction keeps the model's input under
// the budget however long the conversation gets, so this caps cost per application, not context.
const MAX_CHAT_MESSAGES_PER_SESSION = 50;

// The model proposes tool calls, the route executes them and feeds the
// results back. Three tool rounds cover every real flow (look up, act,
// wrap up); the final round runs with tool_choice none so it must answer.
const MAX_TOOL_ROUNDS = 3;
const MAX_TOOL_CALLS_PER_ROUND = 4;
// What a turn stores when it repeats an answered message: the words of the ChatPanel button that sends it.
const REASKED_AS_QUESTION_TEXT = 'Not a job ad, just a question';
// Compaction requests one turn may send before it goes out as it is (the budget guard then decides).
const MAX_COMPACTION_PASSES = 2;

// Thinking counts toward max_tokens on Haiku 5.5, and a reply is 1 to 3
// sentences, so this is mostly thinking headroom.
const CHAT_MAX_TOKENS = 4000;

// The stop reasons that leave a usable answer. Anything else (refusal,
// max_tokens, a context-window stop) is a failure, never a reply.
const USABLE_STOP_REASONS = new Set(['end_turn', 'tool_use', 'stop_sequence']);

// The application id has to be a real D1 row id. A client session carries a
// `session-<timestamp>` id until it syncs, and a cap that accepts anything is
// not a cap.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatContext {
  hasCV: boolean;
  cvSummary?: string;
  hasAnalysis: boolean;
  jobTitle?: string;
  company?: string;
  // Master CV and certifications
  hasMasterCV?: boolean;
  masterCVSummary?: string;
  hasCertifications?: boolean;
  certificationsCount?: number;
  certificationsList?: string;
  // Chat history for context
  chatHistory?: ChatMessage[];
  // Generated content awareness
  hasGeneratedCV?: boolean;
  hasGeneratedCoverLetter?: boolean;
  hasGeneratedEmail?: boolean;
  // The user's IANA zone, so spoken dates resolve on their clock.
  timeZone?: string;
  // The CV template the canvas is showing (client state).
  cvTemplateId?: string;
  // The tailored CV the canvas is showing, for the mechanical structure tools.
  // Shape-checked and size-capped below before it reaches a handler.
  optimizedCVData?: unknown;
  // Screening question mode
  mode?: 'screening_answers';
  sessionId?: string;
  jobDescription?: string;
  matchingSkills?: string[];
  missingSkills?: string[];
  generatedCVSummary?: string;
  companyResearchSummary?: string;
}

export async function POST(req: NextRequest) {
  // Set once the turn goes out on a compaction block: a provider 4xx on such a turn gets its own answer below.
  let sentOnBlock = false;
  // The stored block this turn was sent on, so a refusal of it drops that row and no other (null for a block that
  // was never stored, a Bedrock one).
  let failedBlockSession: { userId: string; sessionId: string; coversThroughMessageId: string } | null = null;
  try {
    // Authentication: require logged-in user for chat (costs API money)
    const clientIP = getClientIP(req);
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in to use chat.' },
        { status: 401 }
      );
    }

    const limiterSubject = clientIP === 'unknown' ? `user:${user.id}` : clientIP;
    const rateLimitResult = await checkRateLimit(`chat:${limiterSubject}`, RATE_LIMITS['chat']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    const declaredBytes = Number(req.headers.get('content-length') ?? '');
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
    }

    const { message, context, messageId } = await req.json() as {
      message: string;
      context: ChatContext;
      // The id the client gave the new message (src/lib/chat-message-id.ts). With it, the route stores the turn and
      // its reply in chat_messages under ids the client's sync writes too. A client from before Phase 2 sends none.
      messageId?: unknown;
    };
    if (messageId !== undefined && !isChatMessageId(messageId)) {
      return NextResponse.json({ error: 'Invalid message id.' }, { status: 400 });
    }

    const isScreeningMode = context.mode === 'screening_answers';
    const maxMessageLength = isScreeningMode ? MAX_SCREENING_MESSAGE_LENGTH : MAX_MESSAGE_LENGTH;

    // A blank message is refused before any gate that spends something (the
    // screening turn below is claimed only after every refusal).
    if (typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Type a message first.', code: 'MESSAGE_REQUIRED' }, { status: 400 });
    }

    // Input length validation
    if (message.length > maxMessageLength) {
      return NextResponse.json(
        {
          error: `Message is too long (${message.length} chars). Maximum: ${maxMessageLength} characters.`,
          code: 'MESSAGE_TOO_LONG',
        },
        { status: 400 }
      );
    }

    // Plan gate: screening answers require a paid plan (Plus or Max)
    let screeningSessionId: string | null = null;
    let screeningTurnsUsed = 0;
    if (isScreeningMode) {
      const profile = await getProfile(user.id);
      if (!screeningAllowedForTier(profile?.subscription_tier)) {
        return NextResponse.json(
          { error: 'Screening question answers are available on Plus and Max.' },
          { status: 403 }
        );
      }

      // The cap is per application and is spent below, not by the client. The
      // count the client keeps rides inside generated_cv, which the client
      // writes wholesale, so it can only ever be a display number.
      const sessionId = typeof context.sessionId === 'string' ? context.sessionId : undefined;
      if (!sessionId || !UUID_RE.test(sessionId)) {
        return NextResponse.json(
          { error: "This application hasn't saved yet. Try the question again in a moment.", code: 'SCREENING_SESSION_REQUIRED' },
          { status: 409 }
        );
      }
      screeningSessionId = sessionId;
    }

    const chatSessionId = typeof context.sessionId === 'string' ? context.sessionId : undefined;
    if (chatSessionId && !UUID_RE.test(chatSessionId) && !chatSessionId.startsWith('session-')) {
      return NextResponse.json(
        { error: 'Invalid application session.' },
        { status: 400 },
      );
    }

    // A saved application (UUID) has server-owned history: chat_messages in D1, never the client's copy. A local
    // `session-` conversation has no row yet, so it keeps the client window and never compacts.
    const persistedSessionId = chatSessionId && UUID_RE.test(chatSessionId) ? chatSessionId : null;
    if (persistedSessionId) {
      const ownedSession = await getSession(user.id, persistedSessionId);
      if (!ownedSession) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
      }
    }

    const chatLimitReached = () => NextResponse.json(
      { error: 'Chat message limit reached for this application. Start a new application to continue chatting.', code: 'CHAT_LIMIT_REACHED' },
      { status: 429 },
    );
    // A chat turn on a saved application is stored here, and the cap is spent by that write (one statement, so two
    // requests at once cannot both take the last slot). A request without an id (a message the chat already answered,
    // sent again by the "Not a job ad" button, or a client from before Phase 2) is stored under a fresh server id, so
    // leaving the id out never buys a turn the count would not. Screening has its own cap and only counts here. A
    // local conversation counts its client history until it has a D1 row.
    const storesTurn = Boolean(persistedSessionId && !isScreeningMode);
    const turnMessageId = typeof messageId === 'string' ? messageId : newChatMessageId();
    if (!storesTurn) {
      const userMessageCount = persistedSessionId
        ? await countUserChatMessages(user.id, persistedSessionId)
        : (context.chatHistory ?? []).filter((entry) => entry.role === 'user').length;
      if (userMessageCount >= MAX_CHAT_MESSAGES_PER_SESSION) return chatLimitReached();
    }

    // The model's history, read before any turn is claimed, so a D1 error here spends nothing. Raw: chatTurnText
    // (chat-prompt.ts) cuts every turn to CHAT_TURN_MAX_CHARS (pair-safe, lone surrogates replaced) and quotes pasted
    // ones, the new message included, so a turn has the same bytes on the turn it is sent and on every turn that
    // replays it (the server decides the quoting, never the client). Screening renders the same raw turns its own way
    // (screeningMessages in screening.ts).
    //   Saved application: every message in D1 after the compaction block, if there is one. The new message is left
    //   out by its id (the route stores it below, or the sync already did).
    //   Local conversation: the client's last ten turns, roles re-validated (client JSON could smuggle a system turn).
    let earlierTurns: StoredTurn[];
    let compaction: { block: CompactionBlock; coversThroughMessageId: string } | null = null;
    if (persistedSessionId) {
      const allRows = (await getChatMessages(user.id, persistedSessionId))
        .filter((row) => row.role === 'user' || row.role === 'assistant')
        .map((row) => ({ id: row.id, role: row.role as 'user' | 'assistant', content: row.content }));
      const rows = allRows.filter((row) => row.id !== messageId);
      earlierTurns = rows;
      if (!isScreeningMode) {
        const stored = await getChatCompaction(user.id, persistedSessionId);
        if (stored) {
          const block = asCompactionBlock(stored.block);
          // Looked up before the new message is left out, so a request naming the covered message itself (a replayed
          // id, refused below) never makes a valid block look stale.
          const covered = allRows.findIndex((row) => row.id === stored.coversThroughMessageId);
          if (block && covered !== -1) {
            compaction = { block, coversThroughMessageId: stored.coversThroughMessageId };
            earlierTurns = allRows.slice(covered + 1).filter((row) => row.id !== messageId);
          } else {
            // The messages it summarized are gone (the chat was cleared) or the row is unreadable: the full history
            // goes instead, and the turn compacts again if it has to.
            console.error(`[chat] dropping a stale compaction for ${persistedSessionId} (${block ? 'covered message gone' : 'unreadable block'})`);
            await deleteChatCompaction(user.id, persistedSessionId);
          }
        }
      }
    } else {
      earlierTurns = (context.chatHistory?.slice(-10) ?? [])
        .filter((msg): msg is ChatMessage =>
          Boolean(msg && (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string'))
        .map((msg) => ({ id: null, role: msg.role, content: msg.content }));
    }

    // The turn is claimed last, after every gate that can refuse the request.
    // Claiming earlier would spend a turn on a request that never reaches the
    // model, and the chat limit above does exactly that.
    if (screeningSessionId) {
      const claim = await claimScreeningTurn(user.id, screeningSessionId, SCREENING_TURN_CAP);
      if (!claim.ok) {
        if (claim.reason === 'not_found') {
          return NextResponse.json({ error: 'Application not found' }, { status: 404 });
        }
        return NextResponse.json(
          {
            error: `That's the ${SCREENING_TURN_CAP} screening answers for this application.`,
            code: 'SCREENING_CAP_REACHED',
            screeningTurnsUsed: claim.turnsUsed,
            screeningTurnCap: SCREENING_TURN_CAP,
          },
          { status: 429 }
        );
      }
      screeningTurnsUsed = claim.turnsUsed;
    }
    // The text stored for the turn: the message, except when it repeats the newest user message after it was already
    // answered (the "Not a job ad" button sends an ad the chat proposed an application for). The model reads the whole
    // text on this turn; the history keeps the button's words instead of a second copy of the ad, and so does the
    // client's transcript (storedUserMessage below).
    let storedUserText = message;
    if (storesTurn && persistedSessionId && typeof messageId !== 'string') {
      const newestUser = earlierTurns.findLastIndex((turn) => turn.role === 'user');
      const answered = newestUser !== -1 && earlierTurns.slice(newestUser + 1).some((turn) => turn.role === 'assistant');
      if (answered && earlierTurns[newestUser].content === message) storedUserText = REASKED_AS_QUESTION_TEXT;
    }
    if (storesTurn && persistedSessionId) {
      const claim = await claimUserChatTurn(user.id, persistedSessionId, { id: turnMessageId, content: storedUserText }, MAX_CHAT_MESSAGES_PER_SESSION);
      if (!claim.ok) {
        if (claim.reason === 'cap_reached') return chatLimitReached();
        if (claim.reason === 'not_found') return NextResponse.json({ error: 'Application not found' }, { status: 404 });
        // An id that is someone else's, already answered, or names a different text: never a second turn.
        return NextResponse.json({ error: 'Invalid message id.' }, { status: 409 });
      }
    }

    if (isScreeningMode) {
      // Screening keeps its single-shot flow: one question in, answer blocks
      // out.
      let reply: string;
      try {
        // Start date and salary come from D1 by userId, overwriting anything the browser sent.
        const screeningContext = { ...context, logistics: await loadApplicantLogistics(user.id) };
        reply = await generateScreeningReply({
          userId: user.id,
          message,
          // Raw turns: screeningMessages (screening.ts) keeps the last ten, cuts each to its own cap and quotes
          // pasted ones, and leaves empty turns out (the API refuses empty text).
          history: [...earlierTurns.map(chatTurnOf), { role: 'user' as const, content: message }],
          context: screeningContext,
          route: '/api/chat',
        });
      } catch (modelError) {
        // The turn was claimed before the call, so a failure here has to hand
        // it back. Only this path releases: a client that gives up mid-call
        // still pays for the turn it started.
        if (screeningSessionId) await releaseScreeningTurn(user.id, screeningSessionId, screeningTurnsUsed);
        // Over the input budget: nothing was sent, so not an outage. A fixed reply instead of a 500. No turn
        // count goes back: the turn was just handed back, and the client keeps its count when none comes.
        const budgetReply = screeningBudgetReply(modelError);
        if (budgetReply) {
          console.error('Screening stopped at the input budget:', modelError instanceof Error ? modelError.message : modelError);
          return NextResponse.json({ success: true, reply: budgetReply, actions: [] });
        }
        throw modelError;
      }
      return NextResponse.json({
        success: true,
        reply,
        actions: [],
        screeningTurnsUsed,
        screeningTurnCap: SCREENING_TURN_CAP,
      });
    }

    // Agentic chat: the model can read the tracker, credits, documents and
    // feed, navigate, and apply tracker writes through the tool registry.
    const timeZone = knownTimeZone(context.timeZone) ? context.timeZone : 'UTC';
    const toolContext: ChatToolContext = {
      userId: user.id,
      userMessage: message,
      userMessagePasted: looksPasted(message),
      timeZone,
      sessionId: chatSessionId && UUID_RE.test(chatSessionId) ? chatSessionId : null,
      // Only ever the CV for the application this conversation is on. Without a
      // validated session id there is nothing to write back to, so it is
      // dropped rather than carried.
      tailoredCV: chatSessionId && UUID_RE.test(chatSessionId) ? acceptTailoredCv(context.optimizedCVData) : null,
      cvOutlineRead: false,
      cvWorking: null,
      // What the canvas is painting. An id outside the catalog is dropped.
      cvTemplateId: isCvTemplateId(context.cvTemplateId) ? context.cvTemplateId : null,
    };
    const prompt = buildMainChatPrompt(context, timeZone, new Date());
    const tools = chatToolDefinitions();
    // One execution id for the whole request, so the ledger groups the rounds (and the compaction, when it runs).
    const requestExecutionId = crypto.randomUUID();
    const system = { static: prompt.static, stableContext: prompt.stableContext };
    const newTurn: ChatTurn = { role: 'user', content: message };
    let messages = buildChatMessages([...earlierTurns.map(chatTurnOf), newTurn], prompt.state, compaction?.block ?? null);
    // A block Bedrock wrote is used for this turn only, on Bedrock (see compactChat).
    let compactedOn: 'bedrock' | undefined;

    // On-demand compaction (compaction.ts): over COMPACT_ABOVE_TOKENS projected, summarize everything before the
    // last few messages first, then send the turn on the block. Saved applications only: their history is in D1,
    // and the block is stored next to it. A history that grew a lot without a chat turn (ads the client answered
    // with its buttons) may need a second pass: each pass is itself held under the line, so it compacts the oldest
    // part, and the second folds that block and the next part together.
    let turnBlock = compaction?.block ?? null;
    for (let pass = 0; pass < MAX_COMPACTION_PASSES; pass += 1) {
      if (!persistedSessionId || projectChatInput({ system, tools, messages }) <= COMPACT_ABOVE_TOKENS) break;
      const compacted = await compactChat({
        userId: user.id,
        sessionId: persistedSessionId,
        requestExecutionId,
        system,
        tools,
        turns: earlierTurns,
        earlier: turnBlock,
        provider: compactedOn,
      });
      if (!compacted) break;
      if (compacted.stored) compaction = { block: compacted.block, coversThroughMessageId: compacted.coversThroughMessageId };
      compactedOn = compacted.provider === 'bedrock' ? 'bedrock' : compactedOn;
      turnBlock = compacted.block;
      earlierTurns = earlierTurns.slice(compacted.cut);
      messages = buildChatMessages([...earlierTurns.map(chatTurnOf), newTurn], prompt.state, turnBlock);
    }

    const executed: ExecutedEffect[] = [];
    let confirmActions: ChatActionChip[] = [];
    const failedToolNames: string[] = [];
    const oversizedToolNames: string[] = [];
    let reply = '';
    let lastToolNames = '';
    let loopFailure: { error: unknown } | null = null;

    try {
      // Measured input of the last call and what was appended after it: the
      // next round's projection is exact plus a small estimated delta.
      let previousInputTokens: number | null = null;
      let appendedSinceLastCall: Anthropic.Beta.BetaMessageParam[] = [];
      // Once Bedrock answered a round of this request, the rest of the request stays on Bedrock, so a thinking block
      // signed by Bedrock never reaches the direct API (the API rejects it). Only this direction is pinned: a round the
      // direct API answered can still fail over to Bedrock on the next round, and that request then carries thinking
      // signed by the direct API. Whether Bedrock accepts that is checked by evals/haiku-55-swap/bedrock-probe.ts (check 6).
      // The next request starts on the Anthropic API again; client history is plain text, nothing signed crosses it.
      let pinnedProvider: 'bedrock' | undefined = compactedOn;
      sentOnBlock = turnBlock !== null;
      failedBlockSession = sentOnBlock && persistedSessionId && compaction && turnBlock === compaction.block
        ? { userId: user.id, sessionId: persistedSessionId, coversThroughMessageId: compaction.coversThroughMessageId }
        : null;

      for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
        const finalRound = round === MAX_TOOL_ROUNDS;
        if (previousInputTokens !== null) {
          const projected = projectNextInputTokens(previousInputTokens, appendedSinceLastCall);
          if (isOverRefuseLimit(projected)) throw new InputBudgetError('chat', projected);
        }

        const response = await callHaiku({
          site: 'chat',
          system,
          messages,
          tools,
          // The final round has to answer in text. tool_choice none keeps the
          // cache (P0b) and the tool_use turns in history stay valid.
          toolChoice: finalRound ? 'none' : 'auto',
          maxTokens: CHAT_MAX_TOKENS,
          cacheTtl: '1h',
          // Its own 5m markers sit on the new user turn and on the last tool result (chat-prompt.ts).
          cacheConversation: false,
          provider: pinnedProvider,
          generationContext: {
            requestExecutionId,
            userId: user.id,
            route: '/api/chat',
            feature: 'chat',
            // Rounds that answer a tool result are attributed to that tool
            // (one stable name, no joined cardinality), so the admin AI-costs
            // page shows agentic usage separately.
            operation: round === 0 ? 'general_chat' : `tool_call:${lastToolNames}`,
          },
        });
        assertUsableChatStop(response);
        if (response.provider === 'bedrock') pinnedProvider = 'bedrock';

        const toolUses = response.rawContent.filter(
          (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use',
        );
        if (finalRound || toolUses.length === 0) {
          reply = responseText(response);
          // Haiku can end a turn with no text at all (P0 saw it with tool_choice
          // none). An empty reply is a failure, never a blank bubble.
          if (!reply.trim()) throw new Error(`Chat model returned no text (round ${round})`);
          break;
        }

        // The assistant turn goes back verbatim (thinking and tool_use blocks
        // unaltered), then ONE user turn with a tool_result for every tool_use.
        // A tool_use without a result is a 400, so calls over the per-round cap
        // are answered as not run rather than dropped.
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const [index, call] of toolUses.entries()) {
          if (index >= MAX_TOOL_CALLS_PER_ROUND) {
            results.push({
              type: 'tool_result',
              tool_use_id: call.id,
              is_error: true,
              content: `Not run: at most ${MAX_TOOL_CALLS_PER_ROUND} tool calls per turn. Tell the user what you did not get to.`,
            });
            continue;
          }
          const args = call.input && typeof call.input === 'object' && !Array.isArray(call.input)
            ? call.input as Record<string, unknown>
            : {};
          const result = await executeChatTool(call.name, args, toolContext);
          if (result.failed) failedToolNames.push(call.name);
          if (result.oversized) oversizedToolNames.push(call.name);
          if (result.executed) executed.push(...result.executed);
          if (result.actions) confirmActions.push(...result.actions);
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify(result.data),
            ...(result.failed || result.oversized ? { is_error: true } : {}),
          });
        }
        // The last result carries the loop's 5m marker (moved each round), so the next round reads this one.
        appendedSinceLastCall = appendToolRound(messages, response.rawContent, results);
        previousInputTokens = response.inputTokensTotal;
        lastToolNames = toolUses[0].name;
      }
    } catch (error) {
      loopFailure = { error };
    }

    // An early stop, a handler that threw or a result too large to read each
    // end in a fixed reply; an outage (the first call failed) is rethrown to the
    // 500 path below. loop-reply.ts has every case.
    ({ reply, confirmActions } = settleChatReply(
      { reply, executed, confirmActions, failedToolNames, oversizedToolNames, lastToolNames },
      loopFailure,
    ));

    // The tools cannot add a new claim to the source CVs. If the model offers
    // or promises that unsupported action anyway, replace it before it reaches
    // the client and suppress the rewrite chip that would only refuse later.
    const cvRewriteProposed = confirmActions.some((chip) =>
      chip.action.startsWith('confirm-cv-rewrite:'),
    );
    const guardedReply = guardUnsupportedCvAdditionOffer(reply, { cvRewriteProposed });
    const unsupportedCvAdditionBlocked = cvRewriteProposed && guardedReply !== reply;
    reply = guardedReply;

    // The prompt bans long dashes, but the live model has ignored that rule.
    // All free-form chat copy gets the same deterministic safety net as the
    // document writers before any text reaches the client.
    reply = sanitizeDashes(reply);

    // Each structure operation carries the digest of the object it produced,
    // so composed edits return different Undo action strings. Only the last
    // one targets the final composed CV. Earlier chips would either refuse or
    // misrepresent which operation they undo.
    const safeConfirmActions = unsupportedCvAdditionBlocked
      ? confirmActions.filter((chip) => !chip.action.startsWith('confirm-cv-rewrite:'))
      : confirmActions;
    const rawActions = [...extractActions(reply, context), ...safeConfirmActions];
    const lastCvUndo = rawActions.findLast((chip) => chip.action.startsWith('undo-cv-edit:'));
    const seenActions = new Set<string>();
    const actions = rawActions.filter((chip) => {
      if (chip.action.startsWith('undo-cv-edit:') && chip !== lastCvUndo) return false;
      if (seenActions.has(chip.action)) return false;
      seenActions.add(chip.action);
      return true;
    });

    // The reply goes into the history now, under the id the client will show it with, so a quick next turn has it
    // even before the client's sync runs. The sync then writes the client's copy over it (a reply can gain a note).
    let replyMessageId: string | undefined;
    // A client that stopped waiting (the Stop button) never shows this reply, so it is not stored either, where the
    // runtime reports the disconnect. Best effort: the user's own message is stored either way.
    if (storesTurn && persistedSessionId && !req.signal?.aborted) {
      replyMessageId = newChatMessageId();
      const stored = await storeChatReply(user.id, persistedSessionId, { id: replyMessageId, content: reply, actions });
      // The user still gets the reply; the next turn's history will miss it, so this is loud.
      if (!stored) console.error(`[chat] the reply was not stored for ${persistedSessionId} (application gone or id taken)`);
    }

    return NextResponse.json({
      success: true,
      reply,
      actions,
      executed,
      ...(replyMessageId ? { replyMessageId } : {}),
      // A turn sent without an id was stored under one the client has never seen: it adds this message to its
      // transcript, so the two stay the same.
      ...(storesTurn && typeof messageId !== 'string' ? { storedUserMessage: { id: turnMessageId, content: storedUserText } } : {}),
      // Where ChatPanel draws "Earlier messages summarized": the last message the model now sees only as a summary.
      ...(persistedSessionId ? { compactedThroughMessageId: compaction?.coversThroughMessageId ?? null } : {}),
    });
  } catch (error) {
    const posthog = getPostHogServer();
    posthog.captureException(error as Error, 'server_error', {
      endpoint: '/api/chat',
      method: 'POST',
    });
    await posthog.flush();
    console.error('Chat error:', error);
    // A 4xx on a turn that carried a compaction block (Bedrock refusing an Anthropic-signed block after a failover is
    // the case evals/haiku-55-swap/bedrock-probe.ts check 7 probes). Said plainly, never answered as if it had been
    // read: the history and the block stay as they are, and the next turn tries again.
    const status = providerHttpStatus(error);
    if (sentOnBlock && status !== null && status >= 400 && status < 500) {
      // A 400 (the request itself refused) drops the stored block this turn was sent on, so the next turn compacts again
      // from the full history: a block the API no longer accepts must not sink every later turn. If it was Bedrock
      // refusing a valid block, that costs one compaction. A rate limit or an auth error keeps it. Only that row goes:
      // a newer block another tab stored meanwhile has a different covered message and stays.
      let dropped = false;
      if (status === 400 && failedBlockSession) {
        try {
          await deleteChatCompaction(failedBlockSession.userId, failedBlockSession.sessionId, failedBlockSession.coversThroughMessageId);
          dropped = true;
        } catch (deleteError) {
          console.error('[chat] could not drop the refused compaction block:', deleteError instanceof Error ? deleteError.message : deleteError);
        }
      }
      return NextResponse.json(
        { error: 'Chat is unavailable right now.', code: 'CHAT_PROVIDER_UNAVAILABLE', ...(dropped ? { compactedThroughMessageId: null } : {}) },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: 'Chat request failed' },
      { status: 500 }
    );
  }
}

/**
 * A CV is a few kilobytes. This is generous enough that no real document hits
 * it and tight enough that a hostile client cannot make the Worker chew through
 * a megabyte of JSON on every chat turn.
 */
const MAX_CV_JSON_CHARS = 200_000;

/**
 * The largest body worth parsing, checked BEFORE `req.json()` rather than after.
 *
 * The per-field caps below all run on an object that has already been parsed,
 * so a hostile client could make the Worker parse a megabyte and only then be
 * told the CV inside it was too big. Content-length is advisory (a chunked
 * request carries none), so this is a cheap early exit and not the only cap.
 *
 * Sized off what a legitimate request holds: a 200,000 char CV, ten history
 * turns (a local conversation; a saved application sends none, its history is
 * in D1), a message, a master CV summary and a job description. The client sends
 * history turns whole (a pasted ad can be up to MAX_MESSAGE_LENGTH); the server
 * cuts each to CHAT_TURN_MAX_CHARS (chat-prompt.ts), never rejects one. Real ads
 * run to about 11,500 chars, so a window of them sits far below this.
 */
const MAX_REQUEST_BYTES = 512_000;

/**
 * The tailored CV the client says its canvas is showing.
 *
 * The store is the source of truth here, not D1: `getSession` returns whatever
 * the 2-second debounced sync last wrote, so reading the CV server-side would
 * silently revert a canvas edit the user made moments earlier. See the comment
 * on ChatToolContext.tailoredCV for why accepting it is not a trust escalation.
 *
 * Shape-checked, not trusted: a malformed object reaching a template throws in
 * render, and the structure tools have to be able to assume the five core
 * arrays exist before they compare anything against them.
 */
function acceptTailoredCv(value: unknown): TailoredCV | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return null;
  }
  if (!serialized || serialized.length > MAX_CV_JSON_CHARS) return null;
  if (validateCvShape(value as TailoredCV) !== null) return null;
  return value as TailoredCV;
}

/** Text blocks only: thinking and tool_use blocks are never reply copy. */
function responseText(response: HaikuResponse): string {
  return response.rawContent
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
}

/**
 * A refusal or a max_tokens stop is a billed 200 that leaves no usable answer,
 * so it takes the loop's failure path, the same one an empty reply takes.
 */
function assertUsableChatStop(response: HaikuResponse): void {
  if (!response.stopReason || !USABLE_STOP_REASONS.has(response.stopReason)) {
    throw new Error(`Chat model stopped without a usable answer (stop_reason ${response.stopReason ?? 'missing'})`);
  }
}

function extractActions(reply: string, context: ChatContext): Array<{label: string; action: string; icon: string}> {
  const actions: Array<{label: string; action: string; icon: string}> = [];
  const lowerReply = reply.toLowerCase();

  if (!context.hasCV && (lowerReply.includes('upload') || lowerReply.includes('cv'))) {
    actions.push({
      label: 'Upload CV',
      action: 'navigate-documents',
      icon: 'cv'
    });
  }

  return actions;
}

/** A history message: its D1 id when it came from chat_messages, null for a local conversation's client turn. */
interface StoredTurn {
  id: string | null;
  role: 'user' | 'assistant';
  content: string;
}

function chatTurnOf(turn: StoredTurn): ChatTurn {
  return { role: turn.role, content: turn.content };
}

type ChatSystem = HaikuCallOptions['system'];
type ChatTools = NonNullable<HaikuCallOptions['tools']>;

/**
 * The turn's input as the budget estimates it (token-budget.ts, 1.8 chars/token), plus the reserve for the tool
 * rounds it may run. Measured on the request callHaiku would build, so the system blocks and tools count in the
 * bytes they are sent in.
 */
function projectChatInput(parts: { system: ChatSystem; tools: ChatTools; messages: HaikuCallOptions['messages'] }): number {
  return estimateChatRequest(parts) + COMPACTION_RESERVE_TOKENS;
}

/** A request with the chat's tools and system, estimated the way the budget guard estimates it. */
function estimateChatRequest(parts: { system: ChatSystem; tools: ChatTools; messages: HaikuCallOptions['messages'] }): number {
  const request = buildHaikuRequest({
    site: 'chat',
    system: parts.system,
    messages: parts.messages,
    tools: parts.tools,
    maxTokens: CHAT_MAX_TOKENS,
    cacheTtl: '1h',
    generationContext: { requestExecutionId: 'projection', route: '/api/chat', feature: 'chat', operation: 'projection' },
  }, 'low');
  return estimateInputTokens({ system: request.system, tools: request.tools, messages: request.messages });
}

/**
 * One compaction request: the same tools and system as a chat turn (so it reads their cached prefix), the earlier
 * block, then every message before the kept ones, with the summary prompt in CHAT_COMPACTION_INSTRUCTIONS.
 *
 * Returns the block and how many of `turns` it covers, or null when there is nothing to compact or the request
 * failed. A failure is not the turn's failure: callHaiku has already written the failed ledger row and the PostHog
 * event, and the turn goes out uncompacted (the budget guard still stops one that no longer fits).
 *
 * A block written by Bedrock (a failover) is used for this turn only, with the turn pinned to Bedrock, and never
 * stored: its signature is Bedrock's, and the next turn starts on the Anthropic API again. A second pass on such a
 * block is pinned to Bedrock too (`provider`).
 *
 * The request itself stays under COMPACT_ABOVE_TOKENS: when everything before the kept messages is more than that,
 * only the oldest part is compacted, and the turn (or the next one) compacts again on top of the block.
 */
async function compactChat(params: {
  userId: string;
  sessionId: string;
  requestExecutionId: string;
  system: ChatSystem;
  tools: ChatTools;
  turns: StoredTurn[];
  earlier: CompactionBlock | null;
  provider: 'bedrock' | undefined;
}): Promise<{ block: CompactionBlock; cut: number; coversThroughMessageId: string; provider: string; stored: boolean } | null> {
  const first = splitForCompaction(params.turns.map((turn) => turn.role));
  if (first === null) return null;
  // Over the line, step back to the previous range that still ends on a user turn (the shape splitForCompaction
  // picks), never into one ending on an assistant turn.
  const endsOnUser = (end: number) => end > 0 && params.turns[end - 1].role === 'user';
  let cut = first;
  let response: HaikuResponse;
  try {
    const requestMessages = (end: number) => buildCompactionMessages(params.turns.slice(0, end).map(chatTurnOf), params.earlier);
    const tooBig = (end: number) =>
      estimateChatRequest({ system: params.system, tools: params.tools, messages: requestMessages(end) }) > COMPACT_ABOVE_TOKENS;
    while (tooBig(cut)) {
      let previous = cut - 1;
      while (previous > 0 && !endsOnUser(previous)) previous -= 1;
      if (previous <= 0) break;
      cut = previous;
    }
    response = await callHaiku({
      site: 'chat_compaction',
      system: params.system,
      tools: params.tools,
      messages: requestMessages(cut),
      maxTokens: COMPACTION_MAX_TOKENS,
      cacheTtl: '1h',
      cacheConversation: false,
      compaction: { instructions: CHAT_COMPACTION_INSTRUCTIONS },
      provider: params.provider,
      generationContext: {
        requestExecutionId: params.requestExecutionId,
        userId: params.userId,
        route: '/api/chat',
        feature: 'chat',
        operation: 'compaction',
      },
    });
  } catch (error) {
    console.error('[chat] compaction failed, sending the turn uncompacted:', error instanceof Error ? error.message : error);
    return null;
  }
  const coversThroughMessageId = params.turns[cut - 1].id;
  if (!coversThroughMessageId) throw new Error('compactChat: a saved application turn has no id');
  const block = response.rawContent.map((item) => asCompactionBlock(item)).find((item) => item !== null);
  // readHaikuContent already refused a response without one; this is the type narrowing, and a loud stop if not.
  if (!block) throw new Error('compactChat: compaction response carried no block');
  // The summary replaces the quoted turns on every later turn, so one that broke the format (an unclosed << , a
  // heading or a line shaped like the app's state) is never used. The signature covers the text, so it cannot be
  // repaired, only refused: the turn goes out uncompacted.
  const broken = summaryFormatProblem(block.content);
  if (broken) {
    console.error(`[chat] compaction summary refused (${broken}), sending the turn uncompacted`);
    return null;
  }

  let stored = false;
  if (response.provider !== 'bedrock') {
    try {
      stored = await saveChatCompaction(params.userId, params.sessionId, {
        block,
        coversThroughMessageId,
        inputTokens: response.inputTokensTotal,
      });
    } catch (error) {
      console.error('[chat] compaction not stored, used for this turn only:', error instanceof Error ? error.message : error);
    }
    if (!stored) console.error(`[chat] compaction not stored for ${params.sessionId}, used for this turn only`);
  }
  return { block, cut, coversThroughMessageId, provider: response.provider, stored };
}
