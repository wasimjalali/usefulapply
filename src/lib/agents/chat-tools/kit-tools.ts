/**
 * Phase 4 kit actions. Every one of these spends credits, so per the locked
 * confirmation policy no handler here calls a generation endpoint: the tool
 * proposes, the reply carries a chip with the cost in its label, and the
 * user's click is the second, confirming request. The click runs the same
 * client path the tracker's own follow-up button runs, so credits are
 * reserved by the code that always reserves them.
 *
 * Injection defense is unchanged from Phase 2 and 3: the user's own message
 * must have named the application (userNamed), and a message that reads as
 * pasted text is refused outright. Company and job title are attacker-authored.
 */

import { getDocuments } from '@/db/repos/documents';
import { getSession } from '@/db/repos/sessions';
import { getUserCredits } from '@/db/repos/credits';
import { getTotalCredits, CREDIT_COSTS } from '@/lib/credit-costs';
import { flattenUntrusted } from './untrusted';
import { findOwnedNamedRow } from './write-tools';
import type { ChatTool, ChatToolResult } from './types';

const proposeFollowUp: ChatTool = {
  name: 'propose_follow_up',
  description:
    'Offer to draft the follow-up email for one tracked application. This spends credits, so it never writes anything: it returns a button the user clicks. Noticing that a follow-up is due and offering it is free; drafting is not. The button writes the standard follow-up: it cannot apply a styling note like "keep it warm" or "mention the Munich project", so if the user asked for one, say the draft is the standard one and they can ask for a rewrite with that note once it is open. Take application_id from get_applications, and only call it when the user named the application themselves and asked for the follow-up.',
  parameters: {
    type: 'object',
    properties: {
      application_id: {
        type: 'string',
        description: 'The application_id from get_applications.',
      },
    },
    required: ['application_id'],
    additionalProperties: false,
  },
  handler: async (args, ctx): Promise<ChatToolResult> => {
    const found = await findOwnedNamedRow(ctx, args.application_id);
    if (!found.ok) return { data: { error: found.error } };
    const { row } = found;

    // The follow-up route refuses without a CV, so say it before the button
    // rather than after the click has already been made.
    const documents = await getDocuments(ctx.userId);
    if (!documents.some((doc) => doc.type === 'primary_cv')) {
      return {
        data: {
          error: 'There is no CV uploaded yet, so nothing can be written from it. Tell the user to upload their CV first.',
        },
      };
    }

    // A follow-up that already exists is overwritten by the draft, not added
    // to. The user is paying to replace something they have, so they are told
    // that before the click and the button says rewrite rather than draft.
    const session = await getSession(ctx.userId, row.id);
    const existing = session?.follow_up_email;
    const alreadyDrafted = Boolean(
      existing
      && typeof existing === 'object'
      && typeof (existing as Record<string, unknown>).body === 'string'
      && ((existing as Record<string, unknown>).body as string).trim(),
    );

    const cost = CREDIT_COSTS.FOLLOW_UP_REGEN;
    const { credits } = await getUserCredits(ctx.userId);
    const balance = credits ? getTotalCredits(credits) : 0;
    const company = flattenUntrusted(row.company);
    // The label is trusted chrome and the company name is written by whoever
    // posted the ad, so the button carries a short name, not a sales line.
    const shortCompany = company.length > 32 ? `${company.slice(0, 32)}...` : company;

    if (balance < cost) {
      return {
        data: {
          ok: false,
          requires_confirmation: true,
          affordable: false,
          credits_required: cost,
          credits_available: balance,
          company: `<<${company}>>`,
          already_drafted: alreadyDrafted,
          note: 'Nothing was written and nothing was charged. Say how many credits it needs and how many they have, and that billing is where to top up.',
          styling_notes_applied: false,
        },
        actions: [{ label: 'Open billing', action: 'navigate-pricing', icon: 'new' }],
      };
    }

    return {
      data: {
        ok: false,
        requires_confirmation: true,
        affordable: true,
        credits_required: cost,
        credits_available: balance,
        company: `<<${company}>>`,
        already_drafted: alreadyDrafted,
        note: alreadyDrafted
          ? 'This application already has a follow-up. The button replaces it, so say that plainly along with the cost, and let them decide. Nothing is written and nothing is spent yet.'
          : 'A button is shown to the user. Say what it costs and tell them to confirm it there. Nothing is written and nothing is spent yet.',
        // The tracker follow-up route takes a session id and nothing else, so a
        // styling note in the user's message has nowhere to go. Saying so is
        // the difference between a stated limit and a silent drop.
        styling_notes_applied: false,
      },
      actions: [
        {
          label: alreadyDrafted
            ? `Rewrite the ${shortCompany} follow-up (${cost} credits)`
            : `Draft the ${shortCompany} follow-up (${cost} credits)`,
          action: `confirm-follow-up:${row.id}`,
          icon: 'new',
        },
      ],
    };
  },
};

export const KIT_TOOLS: ChatTool[] = [proposeFollowUp];
