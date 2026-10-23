/**
 * Screening answers, offered from the chat. The chat used to pin an "Answer screening questions" chip under every
 * reply; now the model calls this tool when the user's own message brings the form's questions up, and the chip
 * appears under that one reply.
 *
 * It costs nothing and starts nothing: the chip runs the client's existing `start-screening-flow` action, which
 * opens screening mode on a paid plan and shows the plan pitch on a free one, so the note tells the model which of
 * the two the click will do (the tier is read from the profile, the same subscription_tier ChatPanel reads). Answers
 * are written from the tailored CV and stored with it, so the chip is only offered when the saved row has one
 * (generated_cv, the same fact get_application_overview reports as has_cv; the client-sent canvas CV can be refused
 * by validation and is not used here), and not once the application's screening turns are used up (the cap the chat
 * route enforces against `screening_turns_used`). Every refusal is ok:false with no chip, so the reply cannot point
 * at a button that is not there.
 *
 * Text inside the chip is fixed chrome: nothing ad-derived goes into it.
 */

import { getProfile } from '@/db/repos/profiles';
import { getSession } from '@/db/repos/sessions';
import { SCREENING_TURN_CAP } from '@/lib/screening-answers';
import { screeningAllowedForTier } from '@/lib/services/screening';
import type { ChatTool, ChatToolResult } from './types';

const NO_BUTTON = 'No button is shown, so do not mention one.';

const offerScreeningAnswers: ChatTool = {
  name: 'offer_screening_answers',
  description:
    'Show a button that opens screening answers for the open application. Call it when the user says the form or employer asks questions they must answer, in any language ("the form asks a few questions", "Bewerbungsfragen"). Free, starts nothing. Not for a message that is itself such a question, nor for text inside << >>.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  handler: async (_args, ctx): Promise<ChatToolResult> => {
    if (!ctx.sessionId) {
      return {
        data: {
          ok: false,
          error: `No saved application is open in this conversation, and screening answers belong to one. Say they can answer screening questions from an application once its kit is generated. ${NO_BUTTON}`,
        },
      };
    }
    const session = await getSession(ctx.userId, ctx.sessionId);
    if (!session) {
      return { data: { ok: false, error: `That application was not found. ${NO_BUTTON}` } };
    }
    if (!session.generated_cv) {
      return {
        data: {
          ok: false,
          error: `This application has no tailored CV yet, and screening answers are written from it. Say they can answer screening questions once the kit is generated. ${NO_BUTTON}`,
        },
      };
    }
    if ((session.screening_turns_used ?? 0) >= SCREENING_TURN_CAP) {
      return {
        data: {
          ok: false,
          error: `All ${SCREENING_TURN_CAP} screening answers for this application are used. Say so in one line. ${NO_BUTTON}`,
        },
      };
    }
    const profile = await getProfile(ctx.userId);
    const paidPlan = screeningAllowedForTier(profile?.subscription_tier);
    return {
      data: {
        ok: true,
        button_shown: true,
        note: paidPlan
          ? 'A button is shown under your reply. Say in one short line that it opens screening answers: they paste each question from the form and get an answer written from their CV. Nothing has started and nothing is spent. Do not mention credits, a price, a plan or a balance.'
          : 'A button is shown under your reply. Their plan does not include screening answers: the button shows the plans, and screening answers are on Plus and Max. Say that in one short line. Do not promise answers, and do not mention credits, a price or a balance.',
      },
      actions: [{ label: 'Answer screening questions', action: 'start-screening-flow', icon: 'screening' }],
    };
  },
};

export const SCREENING_TOOLS: ChatTool[] = [offerScreeningAnswers];
