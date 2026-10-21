/**
 * OAuth scopes for the MCP server and the scope every tool needs.
 *
 * - read: look at the account, applications, CVs and the feed.
 * - write: change tracker data, CVs, profile and settings. Spends nothing.
 * - spend: start work that costs credits.
 *
 * Exact membership, no hierarchy: a token with `spend` still needs `write`
 * for a write tool. The /mcp route checks the scope before a call reaches the
 * tool (a missing scope is a 403 insufficient_scope the client can step up
 * from) and each tool checks it again.
 */
export const MCP_SCOPES = ['read', 'write', 'spend'] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

/** `offline_access` is what makes the server issue a refresh token. It grants no tool access. */
export const OAUTH_SCOPES = [...MCP_SCOPES, 'offline_access'] as const;

export const SCOPE_LABELS: Record<McpScope, { title: string; detail: string }> = {
  read: { title: 'Read', detail: 'See your account, credits, CVs and applications.' },
  write: { title: 'Edit', detail: 'Change your applications, CVs and profile. Costs no credits.' },
  spend: { title: 'Spend credits', detail: 'Start work that uses your credits, up to your daily agent limit.' },
};

/** Every MCP tool and the one scope it needs. A tool missing here cannot be called. */
export const TOOL_SCOPES = {
  // Read
  get_account: 'read',
  get_credit_history: 'read',
  list_applications: 'read',
  get_application: 'read',
  get_operation: 'read',
  get_cv: 'read',
  get_cv_outline: 'read',
  list_cv_templates: 'read',
  get_job_feed: 'read',
  get_feed_settings: 'read',
  get_career_profile: 'read',
  explain_fit: 'read',
  morning_briefing: 'read',
  // Write, spends credits
  analyze_job_fit: 'spend',
  generate_application_kit: 'spend',
  regenerate_document: 'spend',
  rewrite_cv_section: 'spend',
  apply_to_feed_job: 'spend',
  draft_screening_answers: 'spend',
  // Write, free
  create_application: 'write',
  update_application: 'write',
  update_application_status: 'write',
  delete_application: 'write',
  cancel_generation: 'write',
  save_cv: 'write',
  delete_cv: 'write',
  set_profile_photo: 'write',
  remove_profile_photo: 'write',
  update_profile: 'write',
  update_cv_content: 'write',
  add_cv_item: 'write',
  set_cv_item_visibility: 'write',
  undo_last_edit: 'write',
  edit_cv_structure: 'write',
  delete_cv_item: 'write',
  edit_document_text: 'write',
  set_cv_template: 'write',
  export_documents: 'write',
  run_job_feed: 'write',
  update_feed_settings: 'write',
  give_job_feedback: 'write',
  withdraw_feed_consent: 'write',
  update_notification_settings: 'write',
} as const satisfies Record<string, McpScope>;

export type ToolName = keyof typeof TOOL_SCOPES;

/** Space-separated `scope` claim (or an array) to a set. */
export function parseScopeClaim(claim: unknown): Set<string> {
  if (typeof claim === 'string') return new Set(claim.split(/\s+/).filter(Boolean));
  if (Array.isArray(claim)) return new Set(claim.filter((s): s is string => typeof s === 'string'));
  return new Set();
}

export function hasScope(granted: ReadonlySet<string>, needed: McpScope): boolean {
  return granted.has(needed);
}
