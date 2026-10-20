## Verdict
The plan is directionally right, and v2 closes the earlier data-integrity and export basics. It is not build-ready. Four blockers remain: CIMD on Workers has no safe transport, `confirm: true` is not a security boundary, the two-column reading-order fix does not work, and the paper/DIN assumptions will render wrong documents. Fix those and the persistence/lease races before PR 1; the rest is scope and verification cleanup.

## Findings

1. **CIMD on Workers is unsafe as specified.** severity: **critical**. evidence: `PLAN.md:70-78`, `PLAN.md:320`. Better Auth's CIMD docs require a Workers-specific transport that resolves the client hostname once, rejects RFC 6890 addresses, pins the approved IP, preserves TLS identity and refuses redirects. The plan only caps fetch size and time. fix: implement and spike that transport in 0a. Do not DNS-check and then call `globalThis.fetch`. ([CIMD security boundary](https://better-auth.com/docs/plugins/cimd#security-boundary))

2. **`confirm: true` is model-controlled, so destructive tools are not protected from prompt injection.** severity: **critical**. evidence: `PLAN.md:118-122`, `PLAN.md:168-188`; the anti-hallucination rules at `cover-letter-prompt.ts:121-141` only bind the writer, not `update_cv_content` or `edit_document_text`. A hostile job description can tell the agent to call `delete_application` with `confirm: true`, or write fabricated claims into the CV. fix: require an out-of-band approval (web-app consent or a short-lived server-issued confirmation token bound to user and tool). Restrict free-text CV/document edits to mechanical fields, or route prose through the verified writer.

3. **The two-column reading-order fix does not change PDF text order, and it misses a second template.** severity: **critical**. evidence: `PLAN.md:214`; `GermanATSTemplate.tsx:231` and `:368`; `USModernATSTemplate.tsx:183` and `:320`. CSS `order` changes the order-modified document order used for painting, so sidebar text still precedes main text in the content stream. `modern-professional` is also sidebar-first and is not mentioned. fix: keep main first in DOM and place the sidebar visually with grid column placement or absolute positioning, not `order`. Fix both two-column templates. Assert reading order per template with pdftotext/pdf.js.

4. **Paper override, margins and the 9.5pt floor contradict the fixed-width templates.** severity: **critical**. evidence: `PLAN.md:184`, `:204-205`, `:219`, `:250`, `:264`; `USPremiumATSTemplate.tsx:55-64` is fixed 8.5in, `GermanClassicTemplate.tsx:63-66` is fixed 210mm with 0.75in padding, `GermanATSTemplate.tsx:48-51` uses 12mm/19mm padding. An A4 override on an 8.5in root clips; `@page` margins plus existing padding doubles margins; the DACH 25mm/20mm rule is not applied; 12px body is 9pt, not 9.5pt. fix: make width/paper/margins renderer inputs, use one margin owner (`@page { margin: 0 }` with template padding, or the reverse), apply 25mm/20mm to the German templates, and set body text to 10pt or re-baseline.

5. **Idempotency still depends on the client reusing the key.** severity: **high**. evidence: `PLAN.md:98-100`; `PLAN.md:45` says clients retry with fresh ids. A retry with a new UUID reserves and charges again. `agent_operations.input_hash` exists but is only used to reject same-key/different-input. fix: dedupe on `(user, kind, input_hash)` within a TTL window as well as the client key; return the existing operation for an identical recent request.

6. **Persistence, capture, cancellation and lease expiry are not one atomic state machine.** severity: **high**. evidence: `PLAN.md:102-112`, `:174`; `agent-v2/route.ts:252` writes `generated_artifacts`, `regenerate/route.ts:315` writes `cover_letter`, `tracker/follow-up/route.ts:239` writes `follow_up_email`, and `useSupabaseSync.ts:648-679` writes the canonical columns, so `PLAN.md:92`'s "only writer" is not true. Success is "persistKit then capture" in two steps. Cancel can release while a model call is mid-flight, and a lease shorter than the model call allows duplicate generation. fix: one D1 batch for persist + status + capture; conditional success/cancel updates on status and attempt; heartbeat or a lease longer than the maximum generation; per-document refunds using `credit-costs.ts:23-28` rather than releasing the whole reservation on any failure.

7. **Free LLM and Browser Run operations are unrationed.** severity: **high**. evidence: `PLAN.md:114-115`, `:175`, `:184`; `save_cv` parses a CV through Anthropic, `draft_screening_answers` is an LLM call capped only per application (`screening-answers.ts:14`), and `export_documents` is free. `parse-cv/route.ts:34-35` caps uploads at 4.5/10MB; the MCP tools have no equivalent cap. A looping agent can burn model and Browser Run cost without touching the 10-credit cap. fix: per-user rate limits and daily quotas for `save_cv`, screening and exports; base64 size caps; a `RATE_LIMIT_MCP` binding.

8. **Server-rendering the templates is not as simple as `renderToStaticMarkup`.** severity: **high**. evidence: `USPremiumATSTemplate.tsx:1` is `'use client'`; `PLAN.md:197-198` assumes the same component renders on the server. Importing a client component into a route handler can resolve to a client reference, and the templates depend on Tailwind/`print:` classes that are not available as inline CSS. fix: extract server-safe presentational components and a dedicated print stylesheet. Spike 0b must render one template end-to-end through the actual export path.

9. **DIN 5008 geometry is incomplete and misplaces the recipient.** severity: **high**. evidence: `PLAN.md:256-261`. The 45mm address field contains a 5-line Zusatz-/Vermerkzone (17.7mm) and a 6-line Anschriftzone (27.3mm); the return line is the top line of the former, and the recipient belongs in the latter (~62.7mm from the top), not at 45mm or 50mm. The Informationsblock (125mm from left, max 75mm) and fold marks (105/210mm) are missing. fix: encode the zones, add position assertions for the recipient, date, information block and fold marks. ([DIN 5008 measurements](https://din-formate.info/de/din-5008/))

10. **The cover letter has no reliable DIN-vs-US layout input.** severity: **high**. evidence: `PLAN.md:171`, `:184`, `:223-225`; `schema.ts:370` defines `cover_letter_language` but nothing reads or writes it; `regenerate/route.ts:214-225` detects language into `requirements.detectedLanguage`. `export_documents` has no `locale` parameter. fix: expose a persisted `letter_locale` (detected or overridden), return it in `get_application`, use it to choose DIN vs US, and include it in the export cache key.

11. **The structured letter contract contradicts the cover-letter prompt.** severity: **high**. evidence: `cover-letter-prompt.ts:217` explicitly forbids a company address line and placeholders; `PLAN.md:223` adds a recipient block. The writer will keep omitting the recipient, and the DIN layout will render empty. fix: update the prompt to allow a recipient block only from verified `company_address`/`company_contact_person`, and add a test that a missing recipient stays blank rather than being invented.

12. **Tool annotations are conditional in the table but static in MCP.** severity: **high**. evidence: `PLAN.md:160`, `:175`: "yes when `regenerate`", "yes, `confirm` when replacing". `destructiveHint` is a static boolean. fix: set `destructiveHint: true` for every tool that can overwrite or delete, and add `idempotentHint` for spending tools.

13. **The exact-match redirect allowlist will break Claude Code/Cursor loopback clients.** severity: **high**. evidence: `PLAN.md:78`; Better Auth's MCP docs say native clients register `http://localhost`, `127.0.0.1` or `[::1]` callbacks and need `clientRegistrationDefaultApplicationType: "infer"`. fix: use Better Auth's native redirect validation with `infer`, allow any port on loopback, and keep exact match for Claude/ChatGPT web callbacks. ([Better Auth MCP](https://better-auth.com/docs/plugins/mcp))

14. **The seeded reviewer account is under-specified and will fail review.** severity: **high**. evidence: `PLAN.md:52`, `:326`; `auth/server.ts:88` sets `requireEmailVerification: true`. A reviewer with no verified email, no CV and no credits cannot test generation. fix: seed `emailVerified`, credits, a primary CV, a sample application and feed consent; document the no-MFA choice.

15. **PR ordering leaves a compile break and a dependency gap.** severity: **high**. evidence: `PLAN.md:318-326`; `cv-tools.ts:86` imports `render-caps.ts`, which PR 3 deletes while PR 5 owns the tool rewrite. PR 5's `list_cv_templates` reports "measured ATS level" but PR 5 only depends on 1 and 2, not 3. fix: PR 3 must update `cv-tools.ts` or keep a compatibility shim; add PR 3 to PR 5's dependencies; assign the chat-tool rewrite to one PR.

16. **Three factual errors will propagate into the submission pack.** severity: **low**. evidence: `PLAN.md:190` says 40 tools, but the tables total 39 (13 read + 6 spend + 20 free writes); `PLAN.md:244` says Greenhouse caps uploads at 2.5MB, while Greenhouse's upload cap is 100MB and 2.5MB is a parse target; `PLAN.md:21` attributes `createMcpHandler` to Cloudflare, while Better Auth's current MCP example uses `@modelcontextprotocol/server` v2. fix: correct the count, the Greenhouse wording and the package name.

## Missing from the plan
- **Add a CV item.** The catalog can edit fields, reorder and delete (`cv-tools.ts:171`, `:206`, `:320`, `:385`) but cannot add an experience, education entry, skill group/item, project, certification, language or custom section. A human can.
- **Non-destructive hide/exclude.** Removing the `.slice()` caps (`render-caps.ts:8-12`) without a per-item visibility control forces users to delete content to fit a page.
- **Screening answer export.** The web app exports answers as PDF/TXT (`AnswersPanel.tsx:48`, `KitExportHost.tsx:111`); `export_documents` only offers `emails_txt`.
- **Notification/settings management.** `update_profile` is contact/letterhead only; the human can manage notifications, connected accounts and the default template.
- **Cover letter layout preview.** The web app shows text, not the DIN/US layout the user will download.
- **MCP operations hygiene.** Rate-limit bindings, `agent_operations` retention/cleanup, DLQ alerting, and an R2 export prefix excluded from the user storage quota and file listings.
- **Date separators across all six templates.** All use an en dash today (e.g. `USPremiumATSTemplate.tsx:432`); section 6's hyphen rule is not in PR 3's work list. The DACH margin change is also absent from section 5's template list.

## DISMISSED
- `pdf-lib` can set Language: `PDFDocument.d.ts:275` has `setLanguage`, so the metadata claim is fine.
- Browser Run supports custom fonts via `addStyleTag`; base64 `@font-face` works ([custom fonts](https://developers.cloudflare.com/browser-run/features/custom-fonts/)).
- `tagged` is treated as accessibility, not an ATS guarantee; spike 0b tests it, so the caveat is sufficient.
- `@better-auth/mcp` and `@better-auth/cimd` are real packages; the plan's spike covers versions and routing.
- "McpAgent is deprecated" is imprecise but not material; the stateless handler is still the right choice.
- oklch is supported by Chromium; the server renderer is not html2canvas. The raster fallback is a separate issue.
- DIN's right-aligned date, bold subject with no "Betreff:", and no comma after "Mit freundlichen Grüßen" are correct.
- US photo support is not a regression: `USPremiumATSTemplate` accepts `photoUrl` but never renders it; only the two German templates render photos.
- `render-caps.ts` is a detector, not the truncation cause; removing it after the `.slice()` calls is fine.
- D1 `batch()` is atomic; the plan's use for refunds is valid.
- Queue/CPU limits are adequate: generation is I/O-bound and `cpu_ms: 300000` covers it.
- Browser Run pricing math is right: 10 hours/month included, then $0.09/hour.
- The 40-tool catalog size is within directory norms; only the count is off by one.
- `requireMcpAuth` already returns 401 with `WWW-Authenticate` and 403 with `insufficient_scope`; no hand-rolled challenge is needed.
- `quickAction` can run locally with a remote browser binding; the `wrangler dev --remote` note is a tooling detail, not a plan defect.
