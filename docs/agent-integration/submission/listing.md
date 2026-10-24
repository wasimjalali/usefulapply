# Listing: Useful Apply

One source for every directory. Copy from here, trim to each field's limit. No prices, trials or promotions anywhere (OpenAI forbids them, and Anthropic's reviewers read the same text).

Sources for the field list, all read 2026-10-25: Anthropic's "Submit a connector to the directory" (https://claude.com/docs/connectors/building/submission), Anthropic's "Submit your plugin" (https://claude.com/docs/plugins/submit) and OpenAI's plugin submission page (https://developers.openai.com/plugins/deploy/submission).

## Core text

| Field | Value |
|---|---|
| Name | Useful Apply |
| URL slug (permanent once published) | `useful-apply` |
| One-liner (limit 200) | Check your fit for a job, then get a tailored CV, cover letter and emails, formatted for US and German applications. |
| Short description (OpenAI `shortDescription`, limit 30) | Tailored job applications |
| Categories (Anthropic: 1 to 5) | Productivity, Career and jobs. Wasim picks the closest names from each portal's list. |
| Website | https://usefulapply.com |
| Documentation | https://usefulapply.com/integrations |
| Support | https://usefulapply.com/integrations and support@usefulapply.com |
| Privacy policy | https://usefulapply.com/privacy |
| Terms | https://usefulapply.com/terms |
| MCP server URL | https://usefulapply.com/mcp |
| Icon | `public/useful-apply-logo.png`, the Useful Apply mark on cream, 512 x 512 PNG. |

### Short description (277 characters)

Useful Apply helps you apply for a job from your AI assistant. Check how well you fit a role, then generate a CV, cover letter, application email and follow-up that follow US or German (DIN 5008) conventions. You review everything, edit it, export it and track the application.

### Long description (1,851 characters, under Anthropic's 2,000 limit)

Useful Apply turns a job ad and your CV into a complete application, without leaving your AI assistant.

Paste a job ad and ask for a fit check. You get a score, the skills you match, the gaps and a plain explanation. If the role is worth it, ask for the full kit: a CV tailored to the ad, a cover letter, an application email and a follow-up email. The kit is written in the ad's language and laid out the way recruiters in that market expect. US letters use block format. German letters follow DIN 5008 with the recipient taken from the ad.

The writer is built to draw every claim in a CV or letter from the CV you provide, and you review everything before it goes anywhere.

Beyond generating, the connector lets your assistant:
- track applications: create, edit, delete, set status and interview or follow-up dates and give a morning briefing
- edit a tailored CV: change text, add or delete entries, hide or show items, reorder lists, rename headings, pick a template and undo the last edit
- rewrite one CV section, redo a letter or email with your instruction, or save your own wording
- draft answers to an employer's screening questions
- export PDF, Word and text files with signed download links
- run your daily job feed, read your career profile, change feed settings, save, dismiss or rate jobs, start an application from one and withdraw consent
- save or delete your CV, set your profile photo and contact details and manage email notifications
- cancel a generation that's running
- show your account, credit balance and recent use

Generation uses the credits already on your Useful Apply account, with a daily limit you control in Settings, Connected apps. You can revoke access there at any time. The connector never buys anything for you.

You need a Useful Apply account to connect. Sign in with OAuth when your assistant asks.

## Example prompts

Each one uses different tools. They all work on the reviewer account (Halcyon Cloud Labs and Fjordwerk applications, a German CV layout, 5 seeded feed jobs). Prompts 3 and 5 spend 0.5 credits each, prompt 1 spends 2 (0.5 for the fit check, 1.5 for the kit). Prompt 4 only shows new matches, a due follow-up and a coming interview for a day after the seed runs (the interview, 5 days), so re-run the seed right before each review window opens and again if the review is delayed.

1. **US, fit and kit.** "Here's a job ad for a Senior Software Engineer at a company in Austin: [paste]. Check my fit, tell me the biggest gap, then write the full application kit." (`analyze_job_fit`, `explain_fit`, `generate_application_kit`, `get_operation`)
2. **German, edit and export.** "Öffne meine Bewerbung bei Fjordwerk, stelle in meinem Lebenslauf die Kenntnisgruppe „Daten“ an die erste Stelle und exportiere Lebenslauf und Anschreiben als PDF." (`list_applications`, `get_application`, `get_cv_outline`, `edit_cv_structure`, `export_documents`)
3. **Tracker and follow-up.** "I sent my Fjordwerk application today. Mark it as applied, set a follow-up for next Tuesday and make the follow-up email shorter." (`update_application_status`, `regenerate_document`)
4. **Morning review.** "What needs my attention today? Check my account, my applications and any new strong matches in my job feed." (`get_account`, `morning_briefing`, `get_job_feed`)
5. **Job feed.** "Save the best match in my job feed, then check my fit for it." (`get_job_feed`, `give_job_feedback`, `apply_to_feed_job`)

OpenAI `defaultPrompt` (3, 128 characters each) are in `../openai/app-submission.md`.

## Per-directory field mapping

### Anthropic connector directory (claude.ai/directory/manage, choose "MCP connector")

Steps and fields as the portal lists them:

| Portal step | What to enter |
|---|---|
| 1. Connection | `https://usefulapply.com/mcp`. Users connect to the same URL, so leave "Users connect to different URLs" off. |
| 2. Tools | Synced from the server. All 43 tools set a `title` and explicit `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`. Fix anything the portal flags on the server before submitting. |
| 3. Listing | Name `Useful Apply`. One-liner (200). Description (2,000, use the long description). 1 to 5 categories. Documentation URL, privacy policy URL, support contact, icon, slug `useful-apply`. |
| 4. Use cases | Primary: check fit for a job, generate and edit an application kit, track applications. Users need a Useful Apply account first and a CV on file. The connector reads and writes data. |
| 5. Company | Company name, website `https://usefulapply.com`, a primary contact for review updates. Wasim supplies. |
| 6. Authentication | Authentication requirement: required. Method: OAuth, with dynamic client registration (`https://usefulapply.com/api/auth/oauth2/register`), so leave the Anthropic-held client ID and secret empty. CIMD isn't offered yet. |
| 7. Data handling | The API is our own. No partner or third-party proxying. No personal health data. No sponsored content. |
| 8. Test and launch | Reviewer credentials and the instructions from `reviewer-guide.md`. Confirm every tool was run as a custom connector in Claude or in MCP Inspector. |
| 9. Compliance | Seven acknowledgments: directory guidelines, first-party API use, financial transactions, AI media generation, prompt injection, conversation data collection, public documentation. All are required. Wasim reads and ticks each. Our truthful positions: no financial transactions through the connector, no AI media generation, untrusted job text is wrapped as data, no conversation data collected, documentation is public at `/integrations`. |
| 10. Review and submit | Check quality warnings (very short answers get flagged). |

Other Anthropic items:

- **Allowed link URIs** (optional): `https://usefulapply.com`. Only needed if the connector opens links with `ui/open-link`. Our signed export links are plain URLs in tool output, so this can stay empty.
- **Screenshots:** only required for MCP Apps (PNG, at least 1,000 px wide, 3 to 5, prompt text separate). We don't ship an MCP App, so none are required. We prepare them anyway for the listing, see `screenshots.md`.
- **Terms to accept:** Anthropic Software Directory Terms and Policy.
- Escalations: mcp-review@anthropic.com.
- Submitting needs any paid Claude plan. Wasim submits.
- After submitting, Anthropic scans it and by default lists it as a Community connector. Some submissions also get a human review. Status and feedback show in the portal.

### Anthropic plugin directory (claude.ai/directory/manage, choose "Plugin bundle")

The plugin is the public repo `wasimjalali/usefulapply-plugin` at its root: `.claude-plugin/plugin.json` (version 1.1.0), `.claude-plugin/marketplace.json`, `.mcp.json` pointing at `https://usefulapply.com/mcp`, the `apply-to-job` skill, a README and an MIT license. `claude plugin validate` passes (2026-10-25). Anthropic asks for the MCP server as a connector too, so the two listings can be paired. Do both.

Before the portal: connect GitHub on claude.ai in the organization you submit from. The portal checks that the connected account can push to the repo.

| Portal step | What to enter |
|---|---|
| 1. Submit new | "Plugin bundle" |
| 2. Source | Repository `wasimjalali/usefulapply-plugin`. Plugin path empty (the plugin is at the root). Branch or tag empty (follows `main`). Then Validate, and fix any blocking finding in the repo before going on. |
| 3. Listing details | Read from `plugin.json` and the README. Nothing to type here; to change a field, change the repo and validate again. |
| 4. Data handling | Reads or stores personal data: yes, through the Useful Apply connector (CV, applications, profile), stored in the user's Useful Apply account. Sends data to services other than its declared connector: no. How long it keeps data: the plugin keeps none itself; Useful Apply keeps account data while the account is open and deletes it within 30 days of account deletion (https://usefulapply.com/privacy). Intended for people under 18: no. |
| 5. Compliance | Contact email Wasim reads (support@usefulapply.com or his own). Tick all four acknowledgements. |
| 6. Review and submit | Keep "GitHub push webhook" (the default), Submit for review, then Set up push updates (needs admin on the repo). Leave auto-publish off for now. |

After a version passes the scan, select Publish on the plugin's page; an Anthropic reviewer then publishes it. Raise `version` in `plugin.json` with every later release.

### OpenAI app directory (ChatGPT)

OpenAI now starts every submission with a ZIP upload at https://platform.openai.com/plugins. The package is `../openai/package/` (built from the text in this file) and the full field sheet is `../openai/app-submission.md`. Mapping:

| OpenAI field | Value |
|---|---|
| `displayName` | Useful Apply |
| `shortDescription` (30) | Tailored job applications |
| `longDescription` (4000) | Long description above |
| `developerName` | Must match the verified identity. The package says `Useful Apply`. Wasim confirms. |
| `websiteURL`, `supportURL`, `privacyPolicyURL`, `termsOfServiceURL` | As in the core table |
| `defaultPrompt` | 3 prompts in the OpenAI sheet |
| `logo` | `./assets/logo.png` in the package (the icon above) |
| Review cases | 5 positive, 3 negative in the OpenAI sheet |
| `demo_recording_url` | Wasim records, see `screenshots.md` |

## Claims to keep out of every listing

- Prices, free tiers, trials, discounts, "credit packs" and "upgrade". (OpenAI forbids them. Keep Anthropic's the same.)
- "Never", "zero" or "100%" claims about fabrication or accuracy. Say it's a design commitment and the user reviews everything.
- "Auto-apply". The product never submits applications to employers.
- Any claim that exports pass a named employer's ATS. Say "ATS-readable", which is what the export eval measures.
