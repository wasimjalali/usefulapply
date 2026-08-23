/**
 * Navigation tool: returns a navigation effect the client executes. No data
 * is read or written server-side.
 */

import type { ChatTool, NavigateTarget } from './types';

const TARGETS: NavigateTarget[] = ['tracker', 'documents', 'billing', 'job-feed'];

const navigate: ChatTool = {
  name: 'navigate',
  description:
    'Take the user to a part of the dashboard: tracker (their applications), documents (CV uploads), billing (plan, credits and usage) or job-feed (the daily job feed). Use for "take me to X", "open my tracker", "where do I upload my CV", or to run the feed (the refresh button lives on the job-feed page).',
  parameters: {
    type: 'object',
    properties: {
      target: { type: 'string', enum: TARGETS },
    },
    required: ['target'],
    additionalProperties: false,
  },
  handler: async (args) => {
    const target = TARGETS.find((candidate) => candidate === args.target);
    if (!target) return { data: { error: 'Unknown destination.' } };
    return {
      data: { ok: true, target },
      executed: [{ type: 'navigate', target }],
    };
  },
};

export const NAVIGATE_TOOLS: ChatTool[] = [navigate];
