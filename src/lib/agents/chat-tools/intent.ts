/**
 * Intent classification: is this message a pasted job ad, or a question?
 *
 * The client only fast-paths the unambiguous cases (isObviousJobAd); every
 * other message comes here, and the model calls this tool when it recognises
 * an ad. The tool does nothing except say so: the client then shows the
 * existing credit-aware decision card, and the user's click is what starts a
 * run. Classification never spends credits.
 */

import type { ChatTool, ChatToolResult } from './types';

const proposeApplication: ChatTool = {
  name: 'propose_application',
  description:
    'Call this only when the user\'s message IS a pasted job advertisement (a real posting with responsibilities, requirements or an about-the-role section). Never call it for a question about jobs, applications or the app, however job-related the wording is. It starts nothing and costs nothing: it shows the user the buttons for checking their fit or generating the kit.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  handler: async (): Promise<ChatToolResult> => ({
    data: {
      ok: true,
      note: 'The user now sees buttons to check their fit or generate the kit. Do not summarize or answer the ad. Say one short line telling them to pick.',
    },
    executed: [{ type: 'propose_application' }],
  }),
};

export const INTENT_TOOLS: ChatTool[] = [proposeApplication];
