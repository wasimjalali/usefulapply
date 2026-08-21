/**
 * App-awareness tools: what the open application contains, and which CV
 * template is in use.
 *
 * get_application_overview reads through getSession with the session-derived
 * userId, so it can only ever see this user's row. Company and role come from
 * a pasted job ad, so they are wrapped as data like everywhere else.
 *
 * set_cv_template changes client state only (the CV canvas re-renders and the
 * choice is saved as the user's default). It is reversible in one click, so it
 * executes immediately and the reply states the change.
 */

import { getSession } from '@/db/repos/sessions';
import { CV_TEMPLATE_CATALOG, CV_TEMPLATE_IDS, cvTemplateName } from '@/lib/cv-templates/catalog';
import { flattenUntrusted } from './untrusted';
import type { ChatTool, ChatToolResult } from './types';

const getApplicationOverview: ChatTool = {
  name: 'get_application_overview',
  description:
    'Everything about the application open in this conversation: company, role, status, match score, which documents have been generated (CV, cover letter, application email, follow-up email), the CV template it uses and how many screening answers are left. Use for "what have I got for this one", "did I write the cover letter yet", "which template is this using".',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  handler: async (_args, ctx): Promise<ChatToolResult> => {
    if (!ctx.sessionId) {
      return { data: { error: 'No saved application is open in this conversation.' } };
    }
    const session = await getSession(ctx.userId, ctx.sessionId);
    if (!session) {
      return { data: { error: 'That application was not found.' } };
    }
    return {
      data: {
        company: `<<${flattenUntrusted(session.company)}>>`,
        role: `<<${flattenUntrusted(session.job_title)}>>`,
        status: session.status ?? 'drafted',
        match_score: session.match_score ?? null,
        has_cv: Boolean(session.generated_cv),
        has_cover_letter: Boolean(session.cover_letter),
        has_application_email: Boolean(session.email || session.email_body),
        has_follow_up_email: Boolean(session.follow_up_email),
        has_fit_assessment: Boolean(session.fit_assessment),
        // Null when this application has never had one picked. The template
        // named in the system prompt is the one on screen; do not guess here.
        cv_template: cvTemplateName(session.selected_template),
        selected_template: session.selected_template ?? null,
        screening_answers_used: session.screening_turns_used ?? 0,
        created_at: session.created_at,
      },
    };
  },
};

const setCvTemplate: ChatTool = {
  name: 'set_cv_template',
  description: `Switch the CV canvas to a different template and save it as the user's default for future applications. Call it only when the user asks to change or use a template. A question about templates ("which one suits Germany", "what would it look like in X") is a question: answer it and do not call this. Reversible, so when they do ask, apply it straight away. Templates: ${CV_TEMPLATE_CATALOG.map((template) => `${template.id} (${template.name}, ${template.market}${template.bestFor ? `, ${template.bestFor}` : ''})`).join('; ')}.`,
  parameters: {
    type: 'object',
    properties: {
      template_id: { type: 'string', enum: CV_TEMPLATE_IDS },
    },
    required: ['template_id'],
    additionalProperties: false,
  },
  handler: async (args): Promise<ChatToolResult> => {
    const templateId = CV_TEMPLATE_IDS.find((candidate) => candidate === args.template_id);
    if (!templateId) {
      return { data: { error: 'Unknown template. Offer the user one from the list in this tool.' } };
    }
    return {
      data: { ok: true, template: cvTemplateName(templateId) ?? templateId },
      executed: [{ type: 'set_cv_template', templateId }],
    };
  },
};

export const APP_TOOLS: ChatTool[] = [getApplicationOverview, setCvTemplate];
