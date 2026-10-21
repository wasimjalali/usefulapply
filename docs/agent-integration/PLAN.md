# Useful Apply for AI agents: plan (v3)

**Status (2026-10-20):**
- **v1:** Wasim accepted every recommendation and set the export bar: best-in-class ATS for the US and Germany, the same renderer for people and agents, cost no object.
- **v2:** folds in the adversarial reviews from Fable 5.1 and GPT-6.1 Sol (medium). Raw reviews and the write-up are in `evals/results/2026-10-20-mcp-plan-review/`.
- **v3:** folds in the DeepSeek Flash (V4.1) review: CIMD transport, client-side confirmation, grid-based reading order in both two-column templates, paper and margin ownership, DIN zones, dedupe by input, atomic success path, quotas for free operations, and 3 missing tools.

**Later, out of scope here:** "Sign in with ChatGPT" and paying for generation with a user's ChatGPT or Claude subscription. The service layer keeps model calls behind one interface so this can plug in.

## 1. Shape: one remote MCP server, packaged three ways

There is one remote MCP server at `https://usefulapply.com/mcp`. It speaks Streamable HTTP, is stateless, and uses OAuth on our existing Better Auth login.

| Package | Reaches | Contents |
|---|---|---|
| Claude connector (Anthropic directory) | Claude.ai, Desktop, mobile, Cowork | Server URL plus listing |
| ChatGPT plugin (OpenAI directory) | ChatGPT | Same server, plus OpenAI manifest and domain challenge |
| Claude Code plugin (Anthropic plugin directory + `wasimjalali/usefulapply-plugin`) | Claude Code | `.mcp.json` plus one `apply-to-job` skill |

- Any other MCP client (Cursor, Codex, VS Code) connects to the same URL.
- Everything runs inside the existing Worker. We use Cloudflare's stateless `createMcpHandler`; `McpAgent` is deprecated and isn't used.
- Until launch, a production env flag disables every MCP tool. Being unlisted isn't enough.

## 2. Findings that shaped this plan

**Ready to reuse:**
- Server-side generation, regeneration, follow-ups, CV parsing and the job feed.
- Credit reservations with idempotency keys.
- The feed's leased generation runner: `job_feed_application_generations` with `lease_owner`, `lease_expires_at` and `attempt`.
- The chat tools' read handlers.
- The untrusted-content wrapper in `chat-tools/untrusted.ts`.

**Blockers, all fixed by this plan:**
1. **Agents can't sign in.** Auth is cookies only.
2. **The browser owns the kit.**
   - `useSupabaseSync.ts` writes `generated_cv`, `cover_letter`, `email` and `follow_up_email` wholesale from a stale tab every 2 seconds.
   - That means any server-side write, whether an agent's or a background generation, can be silently overwritten.
   - A headless kit never fills the canonical columns.
3. **Key actions are server actions only:** create an application, save a CV, read an application, tracker updates, delete, profile.
4. **Chat CV and template tools don't persist anything.** They return effects for the browser to apply, and their outline gate lasts one request.
5. **Exports run in the browser, at low quality:**
   - The CV PDF is an image of the page.
   - All 6 templates silently cut skills to 5 per group (`render-caps.ts`), so what the user downloads can be missing skills.
   - The cover letter PDF is plain Helvetica.
6. **No job-level idempotency.** MCP clients retry with fresh ids, and Queue messages can be redelivered. Refund paths can lose a refund if the Worker dies mid-way (`src/db/repos/credits.ts:1420`, `:1472`).

**Directory rules:**
- Every tool sets `title`, `readOnlyHint`, `destructiveHint` and `openWorldHint` as explicit booleans.
- Read and write tools are separate. There's no generic executor, and names are 64 characters or fewer.
- Tool text is neutral: no "tell the user", no upsell, no billing links.
- ChatGPT forbids selling credits or plans in-app. Spending credits a user already has is fine.
- Both directories need a seeded reviewer account (no MFA), plus privacy policy, terms and support URLs. Anthropic wants every tool tested inside Claude.

## 3. Architecture

```
Agent client ── Streamable HTTP + Bearer JWT ──► /mcp (Next route, requireMcpAuth, per-tool scope check)
                                                    │
OAuth: /.well-known/*, /api/auth/oauth2/*, /oauth/consent, Settings > Connected apps
                                                    ▼
                         src/lib/services/*  (shared by MCP, web routes, chat)
                                                    │
        D1 (revisioned writes, agent_operations) · credits · R2 · Workers AI · Anthropic
                                                    │
                  Queue "agent-generation" ──► queue() in src/worker.ts (leased runner)
                  Browser Run quickAction("pdf", { html }) ◄── export service
```

**3.1 Auth and scopes**
- Packages: `@better-auth/mcp` (on `@better-auth/oauth-provider`), `jwt()` and `@better-auth/cimd`. CIMD is advertised and DCR stays on.
- **Spike first.** Confirm exact versions, the OAuth tables on D1 with `transaction: false`, and the `/oauth2/*` routing under OpenNext. Commit the result before building on it.
- **Scopes:** `read`, `write` and `spend`. Every tool declares its required scope and the handler enforces it. A test calls every write tool with a read-only token.
- **Tokens:**
  - Access tokens are JWTs that live 10 minutes. Refresh tokens rotate.
  - Revoking in Connected apps kills the refresh token immediately. The verifier also checks a revocation table, so an access token dies within a minute.
  - Queued work that's already paid for completes, and its results show in the web app.
  - Account deletion revokes everything.
- **Callbacks:**
  - Exact match for the claude.ai, claude.com and ChatGPT web callbacks.
  - Loopback (Claude Code, Cursor) uses Better Auth's native validation with `clientRegistrationDefaultApplicationType: "infer"`, so localhost, 127.0.0.1 and [::1] work on any port.
  - PKCE S256 is required, and the resource parameter is bound.
- **CIMD safety on Workers** (Better Auth's CIMD security boundary):
  - Resolve the hostname once, and reject RFC 6890 private and loopback ranges.
  - Pin the approved IP while keeping TLS identity.
  - Refuse redirects, and cap size and time.
  - If Workers can't meet this, CIMD stays off and DCR stays on.

**3.2 Service layer** (`src/lib/services/`)
- One function per capability. Each takes `userId` from the verified token or session, checks ownership in the query, and persists its own result.
- MCP tools, web routes and chat all call the same services.
- Chat's CV and template tools are rewritten onto these mutation services. Client effects become just a UI refresh.
- CV edits use revision-bound outline handles, so they work across stateless calls.

**3.3 Concurrency: one writer, with revisions**
- New `application_sessions.revision` integer. Every write is `UPDATE … WHERE id=? AND user_id=? AND revision=?` and returns the new revision.
- The web client stops writing generated fields wholesale.
  - Canvas and editor saves go through the same edit services with the revision they loaded.
  - On a conflict, the client reloads that application and tells the user it was updated elsewhere.
- After a background or agent change, the client refreshes the open application, by polling `revision` on focus and every 15 seconds while it's open.
- Server-side kit persistence (`persistKit`) is the only writer of generation output, for web and MCP alike.

**3.4 Operations, credits and the Queue**
- **New `agent_operations` table:**
  - Columns: `id`, `user_id`, `kind`, `idempotency_key`, `input_hash`, `status`, `result_ref`, `reservation_key`, `lease_owner`, `lease_expires_at`, `attempt`, `error_code`.
  - Unique on `(user_id, kind, idempotency_key)`.
- **Spending tools require `idempotencyKey`, a client UUID:**
  - A retry with the same key returns the same operation.
  - A retry with the same key but different input is rejected.
  - An identical request with a fresh key also returns the existing operation: same `(user, kind, input_hash)` within 10 minutes, while pending, running or just succeeded.
  - The fit-continuation discount is claimed server-side.
- **Generation flow:**
  1. The tool reserves credits.
  2. It writes the operation and sets `generation_status='pending'`.
  3. It enqueues a message that carries only the operation id.
  4. It returns at once with `{operationId, status: "generating", pollAfterSeconds: 10}`. An optional `waitSeconds` (max 20) lets fast clients block briefly.
- **Consumer:**
  - It's a `queue()` handler in `src/worker.ts` that enters the same request context as `scheduled()`.
  - Settings: `max_batch_size: 1`, a dead-letter queue, and a lease claim by conditional update. A message whose claim affects 0 rows is acked without running the model.
  - On success, one D1 `batch()` does `persistKit`, the operation status, `generation_status` and the reservation capture.
  - Success and cancel are conditional on `(status, attempt)`, so a late finisher never overwrites a cancel.
  - The lease outlives the longest generation, kept alive by a heartbeat while the model runs.
  - Partial failure refunds per document, using `credit-costs.ts`. Terminal failure releases the reservation and sets the status to failed.
  - Every writer of kit columns goes through the revisioned services: agent-v2, `/api/regenerate`, `/api/tracker/follow-up` and the queue runner.
- **Refunds are atomic.** The reservation transition, the credit restore and the ledger row go in one D1 `batch()`. A reconcile pass in the existing cron repairs any stuck reservation. A test kills the Worker between every step.
- **Guardrails:**
  - A per-user daily MCP spend cap (default 10 credits a day, adjustable in Connected apps) is reported in `get_account`.
  - At most 2 concurrent generations per user.
  - `generate_application_kit` refuses when the application already has a finished kit, unless `regenerate: true`.
  - **Free but costly operations get quotas:** `save_cv` (an LLM parse), `draft_screening_answers` and `export_documents` (Browser Run) each have a per-user rate limit and daily quota, plus base64 size caps that match `/api/parse-cv` (4.5 MB direct).

**3.5 Prompt-injection posture**
- Every string that comes from a job description, a feed item or a web page goes back to the client wrapped in the untrusted delimiters, and those tools' descriptions say the content is data.
- `concise` mode never returns the raw job description.
- Tool results contain facts only, never instructions.
- **No model-set `confirm` flags.** A model can set those after reading a hostile job description. Destructive tools rely on three things instead:
  - `destructiveHint: true`, so Claude and ChatGPT ask the user before calling the tool.
  - MCP elicitation (a confirmation form the user answers in their own client) when the client supports it.
  - An `undo_last_edit` tool. The server keeps the last 10 prior versions per application.
- **Prose edits:**
  - `update_cv_content` and `edit_document_text` apply the user's own words. Their descriptions say the content must come from the user, never from job text or tool output.
  - They return a diff.
  - Any AI rewriting goes through the verified writer (`rewrite_cv_section`, `regenerate_document`) under the anti-hallucination rules.

**3.6 Files, retention, analytics**
- Exports are stored in R2 at `exports/{userId}/{sha256(content, template, paper, locale, rendererVersion, photoHash)}`.
- Downloads use an HMAC-signed URL that binds `{userId, key, exp}` and lives 15 minutes, served with `no-store` and `no-referrer`. A cache hit re-checks ownership.
- Exports are deleted after 30 days and on account deletion. The privacy policy covers R2 exports, Browser Run processing and MCP analytics.
- PostHog gets `mcp_tool_called` with tool, client, duration and outcome. No content.

## 4. Tool catalog (v1)

**Conventions:**
- Every tool sets all four annotations explicitly, as static booleans. Any tool that can overwrite or delete has `destructiveHint: true`. Spending tools also set `idempotentHint: true`, because they are idempotent by key and input.
- Every spending tool states its cost and returns `creditsUsed` and the new balance.
- Out-of-credit errors are neutral facts. They may link to an informational plans page, never to checkout.

**Read** (`readOnlyHint: true`, scope `read`)

| Tool | Does |
|---|---|
| `get_account` | Plan, balance, next reset, daily MCP cap and usage, CV on file, profile basics |
| `get_credit_history` | Recent credit transactions |
| `list_applications` | Tracker list, filter by status, paginated |
| `get_application` | Job, fit, status, dates, generation and operation status, kit (`concise` or `full`), revision |
| `get_operation` | Status and result of a queued generation |
| `get_cv` | Primary, master or tailored CV as structured data, plus `revision` |
| `get_cv_outline` | Sections and item handles, used by the CV edit tools |
| `list_cv_templates` | 6 templates: market, paper, photo support, measured ATS level from the eval |
| `get_job_feed` | Inbox or saved, paginated, untrusted-wrapped |
| `get_feed_settings` | All feed preferences including automation and timezone |
| `get_career_profile` | Career profile and search strategy |
| `explain_fit` | Plain-language fit explanation for an application |
| `morning_briefing` | What needs attention today (follow-ups due, interviews, new strong matches) |

**Write, spends credits** (scope `spend`, `idempotencyKey` required)

| Tool | Credits | Destructive | Does |
|---|---|---|---|
| `analyze_job_fit` | 0.5 | no | Fit analysis on an application or a pasted job description (creates a draft) |
| `generate_application_kit` | 1.5 after fit, else 2.0 | yes (can replace a kit with `regenerate`) | Queues the CV, cover letter, email and follow-up |
| `regenerate_document` | 0.5 | yes (overwrites) | Cover letter, email or follow-up, with an instruction |
| `rewrite_cv_section` | 0.5, free if refused | yes (overwrites) | One section, with an instruction |
| `apply_to_feed_job` | 0.5 or 2.0 | no | Feed job to application, then fit or kit |
| `draft_screening_answers` | per current rules | no | Plus/Max screening answers, same turn cap as the web app |

**Write, free** (scope `write`)

| Tool | Destructive | Does |
|---|---|---|
| `create_application` | no | Draft from a job description, title, company, URL |
| `update_application` | no | Title, company, URL, company address, contact person, letter language |
| `update_application_status` | no | Status, interview date, follow-up date (these drive the reminder emails) |
| `delete_application` | yes | Remove an application |
| `cancel_generation` | no | Stop a queued or running generation (unspent credits are released) |
| `save_cv` | yes (can replace) | Upload a CV (text, or PDF/DOCX/TXT/MD as base64), parse it, save as primary or master |
| `delete_cv` | yes | Remove the primary or master CV |
| `set_profile_photo` / `remove_profile_photo` | yes (replaces) / yes | Photo used by templates that support one |
| `update_profile` | yes (overwrites fields) | Contact details used in the CV header and letterhead |
| `update_cv_content` | yes (overwrites fields) | Field-level edits to the tailored CV with the user's own words (`revision` required); returns a diff |
| `add_cv_item` | no | Add an experience, education, project, certification, language, skill group or item, or custom section (`revision` required) |
| `set_cv_item_visibility` | no | Hide or show an item, group or section without deleting it |
| `undo_last_edit` | yes | Restore the previous version of a tailored CV or document |
| `edit_cv_structure` | yes (reorders and renames) | Reorder sections and items, rename headings (`revision` required) |
| `delete_cv_item` | yes | Remove an item (`revision` required) |
| `edit_document_text` | yes (overwrites) | Directly edit cover letter, email or follow-up text with the user's own words; returns a diff |
| `set_cv_template` | yes (replaces the choice) | Choose a template for an application |
| `export_documents` | no | `cv_pdf`, `cv_docx`, `cover_letter_pdf`, `cover_letter_docx`, `emails_txt`, `answers_pdf`, `answers_txt`, with any `templateId`, an optional `paper` override and `letterLocale`; returns signed links |
| `run_job_feed` | no | Today's feed (one a day, consent required) |
| `update_feed_settings` | yes (overwrites settings) | Roles, countries, remote, salary floor, automation, timezone |
| `give_job_feedback` | yes (dismiss and not relevant end the job, with no undo) | Save, unsave, dismiss, rate. Only dismiss and rate_not_relevant ask the user to confirm; the other verbs run without a form |
| `withdraw_feed_consent` | yes | Stop feed data processing |
| `update_notification_settings` | yes (overwrites settings) | Email notifications and reminders |

**Left out:** checkout, plans, credit packs, account deletion, admin and the chat endpoint. The tool count is 43 (13 read, 6 spend, 24 free writes), which is within normal range for catalogs the directories have reviewed. Each description stays one or two sentences.

**Claude Code skill `apply-to-job`:** check the account and CV, create the application, run the fit check, confirm spend with the user, generate, poll `get_operation`, review, export, set the tracker status.

## 5. Exports: one renderer for people and agents

**Renderer:**
- The export service renders the template to HTML on the server with `renderToStaticMarkup`, in a `print` mode that hides edit buttons.
- The templates are `'use client'`. If importing them on the server resolves to client references, shared server-safe presentational components serve both the canvas and the renderer.
- A dedicated print stylesheet is inlined, so nothing depends on Tailwind classes. Spike 0b proves this through the real export path.
- Everything is inlined: CSS, self-hosted fonts as base64 `@font-face`, and the photo as a data URI.
- It calls `env.BROWSER.quickAction("pdf", { html, pdfOptions })`. There's no public print route, no render token and no subrequests.
- `pdf-lib` then sets Title, Author, Subject, Language and Producer.

**PDF options:**
- Width, paper and margins are renderer inputs, so an A4 override reflows rather than clips.
- Margins have exactly one owner: either `@page { margin: 0 }` plus template padding, or the reverse. `preferCSSPageSize` is on.
- `printBackground` is on. `tagged` is on, but it's treated as accessibility, not a parsing guarantee. Rendering waits for fonts and images to be decoded.

**Web app:**
- The canvas Download buttons call the same export endpoint, and a new CV DOCX button is added.
- If Browser Run fails, the browser export runs as a fallback, with a visible notice and a PostHog event.
- MCP returns an error rather than a degraded file.

**Templates change too** (canvas and PDF stay identical):
- **No silent truncation.** The `.slice()` caps and `render-caps.ts` go away, and layouts wrap to fit every skill. Anything the user excludes is an explicit, visible choice.
- **Both two-column templates (`german-ats` and `modern-professional`)** keep their look.
  - The DOM puts the main column first, and CSS grid column placement puts the sidebar back on the left.
  - CSS `order` isn't used, because it changes paint order and therefore PDF text order.
  - The sidebar background repeats on every page. Reading order is asserted per template.
- **Hide, don't delete:** CV items, skill groups and items, and sections take an optional `hidden` flag, toggled in the canvas and skipped by the renderer.
- **Date ranges** use a hyphen in every template. Today all six use an en dash.
- **Page breaks:**
  - Entries don't break inside when they fit on a page.
  - An oversized entry continues with widow and orphan control.
  - Headings stay with their content.
  - The minimum body size is 10 pt. Today's 12 px is 9 pt, so the templates get re-baselined.
- **Fonts:** Arimo and Gelasio, metric-compatible with Arial and Georgia, are self-hosted and bound explicitly in the templates. Screen and PDF use the same files, so output is deterministic. Ligatures are off.

**Cover letter:**
- The writer agent moves to a **structured letter contract**: sender, recipient (only verified details, never invented), date, subject, salutation, paragraphs and closing. This is an `agent-expert` change, and the anti-hallucination rules are unchanged.
- The layout comes from that structure. Legacy body-only letters are rendered as they are, in letter typography, with no second header added.
- DOCX is generated with `docx` from the same structure.
- DIN or US layout follows `letterLocale`: the session's `cover_letter_language`, which the writer now persists, falling back to the template market. It is part of the export cache key.
- The cover letter tab gets "Preview layout", which shows the rendered PDF.
- Screening answers export as PDF and TXT too, as the web app does today.

**Cost:**
- Browser Run Quick Actions bill browser time only. Workers Paid includes 10 hours a month, then $0.09 an hour.
- At about 3 seconds a PDF, that's about $0.000075 a PDF beyond roughly 12,000 a month.
- Queues are within the included operations at our volume.
- Expected incremental bill: $0, model usage aside.

## 6. ATS and market standard

**Every PDF:**
- Real text with Unicode maps. Umlauts and accents extract correctly.
- Contact details are in the body, never in a header or footer.
- No text in images.
- Standard headings:
  - English: Summary, Experience, Education, Skills, Certifications, Languages.
  - German: Profil, Berufserfahrung, Ausbildung, Kenntnisse, Zertifikate, Sprachen.
- Date ranges use a hyphen, never an en dash (product rule): "Mar 2022 - Present", "03/2022 - heute".
- File names: `First_Last_CV.pdf`, `Lebenslauf_First_Last.pdf`, `First_Last_Cover_Letter.pdf`, `Anschreiben_First_Last.pdf`.
- File size under 2 MB. Greenhouse recommends 2.5 MB or less for reliable parsing.

**Market rules:**

| | US / North America templates | DACH templates (`german-ats`, `german-classic`) |
|---|---|---|
| Paper | Letter, 0.5 to 0.75 in margins | A4, 25 mm left and 20 mm right margins |
| Photo | None. No US template renders a photo today (`premium-ats` accepts `photoUrl` but never renders it), and that matches the US norm | Optional, top right, Bewerbungsfoto ratio |
| Personal data | Never date of birth, nationality or marital status | Only fields the user explicitly chose to show |
| Length | Guidance: 1 page target, 2 max | Guidance: 2 pages |
| Cover letter | US business letter, block format | DIN 5008:2020 Form B. See the measurements below |

**DIN 5008 Form B, as print CSS measurements, checked in the eval by pdf.js text position:**
- **Address field:** 85 × 45 mm, starting 45 mm from the top and 20 mm from the left.
  - The top 17.7 mm is a 5-line Zusatz- und Vermerkzone, with the return line on its top line.
  - Below it is a 6-line Anschriftzone of 27.3 mm, where the recipient starts at about 62.7 mm from the top.
- **Informationsblock:** 125 mm from the left, max 75 mm wide.
- **Fold marks:** at 105 mm and 210 mm, with the hole mark at 148.5 mm.
- The date is on the right ("Berlin, 20. Oktober 2026").
- The subject is bold, two blank lines below the address block, with no "Betreff:".
- One blank line after "Sehr geehrte …".
- "Mit freundlichen Grüßen" has no comma.

**Other markets:**
- Other EU countries such as the UK, Ireland, the Netherlands and the Nordics use the US conventions on A4, via the `paper` override.
- `list_cv_templates` reports ATS level as measured, not as a promise. A single-column ATS template is the recommended default in both markets.

**CV DOCX:**
- Native paragraphs and heading styles. No layout tables or text boxes.
- Same order and headings as the PDF.
- `ImageRun` for the photo on DACH templates.
- A4 for DACH, Letter for US.

## 7. Verification

**ATS and export eval** (`evals/ats-export/`, write-up in `evals/results/`)
- **Fixtures** for all 6 templates:
  - a 1-page US CV;
  - a 2-page German CV with umlauts, a photo and long entries;
  - a CV that goes past every old skill cap;
  - a single entry longer than one page;
  - one US and one DIN 5008 cover letter.
- **PDF checks:**
  - Full text extracted with `pdftotext` and pdf.js matches the source CV data: every skill, bullet, job title, date-to-employer pairing and heading, in reading order, with umlauts intact.
  - Page size, margins, metadata, file size.
  - No photo where the template has none.
  - DIN positions: recipient, date and fold marks.
  - Reading order for both two-column templates.
- **DOCX checks:** XML content and order, plus a LibreOffice render to PDF that is then text-checked.
- **ATS-parser proxy:** the OpenResume parser, version pinned, runs on the PDFs. Its parsed fields must match the source.
- **Baseline:** the same checks run on today's html2canvas export.
- **Visual parity:** canvas screenshot against PDF page images, judged by a clean Opus judge plus Wasim.
- **Real ATS, manual, once per market:** upload to a Greenhouse or Personio test posting, with screenshots saved in the eval folder. Wasim provides the accounts.
- **Environment:** runs against the remote Browser Run binding (`wrangler dev --remote`), because `quickAction` doesn't run locally.

**MCP E2E** (Playwright Test, trace and video on, HTML report saved to `verify/<branch>/`)
- **Happy path:**
  1. OAuth with consent.
  2. Upload a German CV and run a fit check on a senior job description.
  3. Generate the kit and poll it.
  4. Edit a CV field, delete an item and rewrite a section.
  5. Regenerate the cover letter.
  6. Export all seven formats in two templates.
  7. Set the status to interview with a date.
  8. Check that `/dashboard` shows the same kit and tracker state.
- **Negative paths:**
  - another user's ids;
  - a read token on write tools;
  - an expired or revoked token, and a refresh after revoke;
  - the same `idempotencyKey` twice (one charge);
  - the same key with different input;
  - a Queue crash mid-run (no double charge, credits released);
  - a stale open tab writing after an agent edit (conflict, no overwrite);
  - a hostile job description that tries to trigger `save_cv`, `delete_application` or a CV prose edit (it must hit the client's approval or elicitation, and `undo_last_edit` must restore the content);
  - quotas on `save_cv`, screening and exports;
  - a retry with a fresh key and identical input (one charge);
  - the daily cap reached.
- **Live checks:** Claude.ai custom connector (every tool), Claude Code, MCP Inspector, ChatGPT developer mode.

## 8. Delivery

| PR | Contents | Review row | Starts after |
|---|---|---|---|
| **0a / 0b. Spikes** (no merge) | 0a: Better Auth MCP/CIMD on D1 + OpenNext. 0b: Browser Run `quickAction(pdf, html)` on one template with fonts, photo and tagging | n/a, findings committed to `docs/agent-integration/spikes.md` | now |
| **1. OAuth + MCP skeleton** | Auth plugins, OAuth migration, consent page, well-known routes, Connected apps (revoke, daily cap), scopes, `/mcp` behind the env flag with `get_account` | Sensitive | spike 0a |
| **2. Data integrity** | `revision` + `agent_operations` migration, revisioned services, web client off wholesale sync, `persistKit`, atomic refunds + reconcile, Queue + leased consumer in `worker.ts` | Sensitive | now (parallel with 1) |
| **3. Renderer + ATS** | Export service, template fixes (caps, grid order in both two-column templates, paper and margins, breaks, fonts, hyphens, `hidden` flag, print mode), `cv-tools.ts` kept compiling, CV DOCX, cover letter layouts and preview, answers export, web downloads switched, R2 cache, signed links, ATS eval | Sensitive (signed URLs) + design judge | spike 0b. Integrates with 2's kit service when 2 merges |
| **4. Structured cover letter** | Writer prompt and output contract, legacy rendering path | Feature, `agent-expert` | now (parallel) |
| **5. Tool catalog** | All tools, annotations, scopes, injection wrapping, elicitation, undo history, quotas, daily cap, analytics, MCP E2E. Owns the chat-tool rewrite onto services | Feature (high) | 1, 2 and 3 |
| **6. Distribution** | Plugin repo and skill, OpenAI manifest and domain file, `/integrations` docs page, privacy and terms updates, reviewer account seeded with a verified email, credits, a primary CV, a US and a German application with kits, and feed consent (no MFA), submission pack | Feature (Sonnet + Codex): legal text and reviewer-account seed script | 3, 4 and 5 |

**Shared files:** the orchestrator alone edits `wrangler.jsonc`, `src/worker.ts`, migrations, `package.json` and the lockfile. Workers report back when they need a change there.

**Deploy:** after each merge, `npm run deploy:cf`. The tools stay disabled until PR 6.

**Submission:** Wasim submits at claude.ai/directory/manage (connector and plugin) and in the OpenAI directory (identity verification needed first). I prepare every field, the example prompts, the screenshots and the reviewer pack.

## 9. Decisions (all accepted 2026-10-20)

1. Browser Run renderer for CV and cover letter, used by the web app too. Cost isn't a constraint.
2. Generation runs on Cloudflare Queues.
3. Free tier gets the full tool set, with web-app gates plus the daily MCP cap.
4. The server owns kit persistence for web and MCP (made safe by revisions in 3.3).
5. Public plugin repo `wasimjalali/usefulapply-plugin`.
6. Accept legacy stateless MCP clients as well as the 2026-07-28 spec.

**Routine calls I made from the reviews:**
- US templates stay photo-free, as they are today.
- Silent skill truncation is removed.
- Spending tools require an `idempotencyKey`, and identical input is deduped as well.
- Destructive actions are confirmed in the user's own client (approval prompt or elicitation) and are undoable. There's no model-set `confirm` flag.
- A daily MCP spend cap defaults to 10 credits.
- Exports are kept 30 days.

## 10. Risks

- **ChatGPT commerce review** of a credit-metered product. Mitigation: no prices or upgrade text anywhere in tool output.
- **New Better Auth MCP packages.** Spike 0a gates PR 1.
- **Removing skill caps changes layout density.** The eval's over-cap fixture and the visual judge gate it.
- **Client behaviour we can't verify ahead of time:** ChatGPT redirect URIs (copied from its dashboard), inline rendering of resources (signed links are the fallback), timeouts (covered by async operations).
