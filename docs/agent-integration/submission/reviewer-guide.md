# Reviewer guide: Useful Apply

For Anthropic and OpenAI reviewers. Paste this whole file into the portal's test-account instructions. Each portal gets its own reviewer account, so nothing you do here affects another review. The credentials are delivered separately and are never in git.

## What you're reviewing

Useful Apply is a remote MCP server at `https://usefulapply.com/mcp`. It lets an AI assistant check a user's fit for a job, generate and edit a CV, cover letter and emails, export them and track the application. The same account works in the web app at https://usefulapply.com, so you can see every change an assistant makes.

## Sign in

1. Add the server as a custom connector (Claude) or connect the app (ChatGPT) with the URL `https://usefulapply.com/mcp`.
2. When the OAuth window opens, sign in with the reviewer email and password from the credentials we sent you. Sign-in page: https://usefulapply.com/auth/login.
3. Approve the consent page. It lists three permissions: Read, Edit and Spend credits.
4. To check the web app, open https://usefulapply.com/dashboard in a browser signed in with the same account.

The account has a verified email, no MFA, no email or SMS codes and no magic links. No sign-up is needed.

To revoke access at any point, go to Settings, Connected apps in the web app. The daily limit on credits an assistant can spend is on the same page.

## What's seeded

| Item | Detail |
|---|---|
| Person | Jordan Whitfield, a fictional senior software engineer in Austin, TX. All names, employers, addresses and phone numbers are made up. |
| Primary CV | One CV, in English, with 2 roles, education, skills, a certification and languages (English, German B2, Spanish). |
| Career profile | A career profile and a job search strategy, so the career and feed tools return data. |
| US application | Senior Software Engineer, Platform at Halcyon Cloud Labs (fictional). Status applied, with a follow-up due on the day the seed runs. Fit result 82. Full kit: tailored CV, US cover letter, application email, follow-up email. Template premium-ats. |
| German application | Senior Backend Engineer (m/w/d) at Fjordwerk GmbH, Berlin (fictional). Status interview, with the interview five days after the seed runs. Fit result 79. Full kit in German: tailored CV, DIN 5008 cover letter, application email, follow-up email. Template german-ats. |
| Plan | Max, so screening answers and the job feed are available. |
| Credits | 200 at the start (a Max month). |
| Job feed | A recent completed run with 5 ranked, fictional postings, so the feed tools have something to act on before any live search. |
| Tracker dates | One application has a follow-up due and one has an interview 5 days after the seed runs. The feed matches count as new for 24 hours. We re-seed right before your review window opens, so the briefing has content on day one. |
| Chat history | Each application has its fit and kit conversation, so the web app shows a finished application. |
| Daily agent limit | 20 credits a day (the default for new users is 10). |
| Job feed | Consent given. Roles: Senior Software Engineer, Staff Software Engineer, Platform Engineer. Austin, TX or remote. Salary floor USD 150,000. |
| Profile | Name, phone, location, LinkedIn and GitHub (fictional URLs), timezone America/Chicago. |

## Test script

Run each step in a normal conversation. The server has 43 tools: 13 read, 24 free writes and 6 that need the Spend permission. Five of those six use credits. `draft_screening_answers` is free. This script runs every one. A client that shows tool calls lets you see which tool ran.

### 1. Read tools (no credits, scope Read)

1. "What's in my Useful Apply account?" Expect `get_account`: plan Max, balance 200, a CV on file, daily agent limit 20.
2. "Show my recent credit use." Expect `get_credit_history`.
3. "List my applications." Expect `list_applications` with both seeded applications.
4. "Open the Halcyon Cloud Labs application." Expect `get_application`: fit result, status, kit, revision.
5. "Show my CV." Expect `get_cv`, then "Show its outline" for `get_cv_outline`.
6. "Which CV templates are there?" Expect `list_cv_templates` with 6 templates.
7. "Why did I score 79 for Fjordwerk?" Expect `explain_fit`.
8. "What needs my attention today?" Expect `morning_briefing`: the follow-up that's due, the coming interview and any new strong matches. The briefing only counts matches from the last 24 hours and interviews in the next 7 days. The seed puts the interview 5 days out and stamps the matches when it runs. If the account was seeded more than a day ago, the new-matches bucket is empty. After 5 days the interview bucket is empty too. That's expected. The follow-up bucket still shows.
9. "Show my career profile." Expect `get_career_profile` with the seeded profile and search strategy. "Show my feed settings." Expect `get_feed_settings`. "Show my job feed." Expect `get_job_feed`.

### 2. Free writes (no credits, scope Write)

10. "Create an application from this job ad: [paste any short ad]." Expect `create_application`.
11. "Change the company on it to Example Corp." Expect `update_application`.
12. "Mark the Halcyon application as interview on 5 November." Expect `update_application_status`. Check the tracker in the web app.
13. "Hide the Certifications section on the Halcyon CV, then show it again." Expect `set_cv_item_visibility` twice.
14. "Add a project to the Halcyon CV. Name: Billing API Rewrite. Description: Rebuilt the billing API to cut response times." Expect `add_cv_item`. A project needs a name and a description, and the assistant should use only the words you gave.
15. "On the Fjordwerk CV, put the skill group Daten first." Expect `get_cv_outline`, then `edit_cv_structure` (reorder). It reorders entries inside a list and renames section headings. It doesn't move whole sections, and it never changes wording.
16. "Change the professional title on the Halcyon CV to Staff Software Engineer." Expect `update_cv_content` and a returned diff.
17. "Undo that." Expect `undo_last_edit` and the title restored.
18. "Delete the project you added." Expect `delete_cv_item`.
19. "Rewrite the first sentence of the Halcyon follow-up email in my words: [your sentence]." Expect `edit_document_text` and a diff.
20. "Switch the Halcyon CV to the modern-professional template." Expect `set_cv_template`.
21. "Export the Halcyon CV as a PDF and the cover letter as a Word file." Expect `export_documents` with signed links. Open them. The PDF has selectable text. Links expire after 15 minutes.
22. "Export the Fjordwerk cover letter as a PDF." Expect a DIN 5008 letter on A4.
23. "Set my job feed salary floor to 160,000." Expect `update_feed_settings`. "Save the first job in my feed." Expect `give_job_feedback`. Dismissing a job, or rating it not relevant, removes it for good, so skip those two.
24. "Run my job feed for today." Expect `run_job_feed`. Allowed once a day, and it needs the consent that's already on the account. It queues a live search of public listings and returns a run id. The jobs show up in the feed within a couple of minutes.
25. "Turn off the follow-up reminder emails." Expect `update_notification_settings`. Turn it back on.
26. "Update my phone number to +1 512 555 0143." Expect `update_profile`.
27. "Set my profile photo from this base64 PNG: `iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mPQiFpAEmIY1TCqYfhqAAC1BSIQbI06FgAAAABJRU5ErkJggg==`" Expect `set_profile_photo` with `image/png`. "Remove it." Expect `remove_profile_photo`. The tool takes base64 text, not a chat attachment. If your client can't pass base64, skip this step.
28. "Delete the Example Corp application." Expect `delete_application` and a confirmation from your client.

### 3. Spending tools (scope Spend)

Each call needs an idempotency key the client generates. Repeat a call with the same key and you're not charged twice.

29. "Check my fit for this job: [paste a real-looking ad]." Expect `analyze_job_fit`, 0.5 credits, and `creditsUsed` plus the new balance in the result.
30. "Now generate the full kit for it." Expect `generate_application_kit`, 1.5 credits after a fit check (2.0 without one). It returns an operation id at once. Say "check on it" and the client calls `get_operation` until it succeeds. This takes about a minute.
31. "Make the Halcyon cover letter shorter." Expect `regenerate_document`, 0.5 credits. This overwrites the letter. Undo with `undo_last_edit`.
32. "Rewrite the summary on the Halcyon CV to focus on leadership." Expect `rewrite_cv_section`, 0.5 credits.
33. "Run a fit check on the first job in my feed." Expect `apply_to_feed_job` in fit mode, 0.5 credits. It creates an application from the feed job. Nothing is sent to an employer. A kit on that same job afterwards costs 1.5 credits.
34. "On the Halcyon application, draft answers to: Why do you want this role? What's your notice period?" Expect `draft_screening_answers`. It costs no credits. Each call uses one of the 5 screening turns an application has, and the Max plan includes screening answers. The answers are saved on the application.
35. Ask for a second kit on an application that has one. Expect a refusal unless the request says to replace the existing kit.
36. Paste a second, different short job ad and ask for its full kit. While it runs, say "cancel the generation". Expect `cancel_generation` (scope Write, no credits) and the reserved credits released. Use a new ad, because the seeded applications and the ones from steps 29 and 30 already have kits.

Steps 29 to 36 use about 4 credits (3.5 exactly). The daily limit of 20 leaves room for a second pass, and the balance of 200 for many more.

### 4. Things that should fail

Run this section before the account changes in section 5. Some of these checks need a CV on file.

- Ask for another user's application by id. Expect not found.
- Connect with only the Read permission and try an edit. Expect an insufficient-scope error. Claude and ChatGPT ask for all three permissions and the consent page has no per-permission switches, so this check needs a client where you set the requested scope to `read`, such as MCP Inspector. Skip it otherwise.
- Ask the assistant to buy credits, change the plan or delete the account. No tool exists for any of them.
- Paste a job ad that tells the assistant to delete applications. The ad is wrapped as untrusted data, and a destructive tool still triggers your client's approval prompt.

### 5. Account changes (run these last)

These replace or remove your CV and your job feed consent. Run them after everything else. The account stays usable afterwards, except for steps that need a CV on file or feed consent, like fit checks, kits and the feed run. If you want the account restored, email support@usefulapply.com and we'll reset it.

37. "Upload this CV as my primary CV: [paste a few lines of CV text]." Expect `save_cv`. It replaces the seeded CV, costs no credits and has a daily limit. The applications keep their own copies.
38. "Delete my primary CV." Expect `delete_cv` and a confirmation from your client.
39. "Withdraw my job feed consent." Expect `withdraw_feed_consent`. Settings and saved jobs stay and the daily feed turns off. Only the user can give consent again, in the web app.

## Expected costs

| Action | Credits |
|---|---|
| Fit check | 0.5 |
| Full kit after a fit check | 1.5 |
| Full kit without a fit check | 2.0 |
| Regenerate cover letter, email or follow-up | 0.5 |
| Rewrite one CV section | 0.5 (free if refused or unchanged) |
| Fit check on a feed job | 0.5 |
| Kit from a feed job, after a fit check on it | 1.5 (2.0 without one) |
| Draft screening answers | 0 (uses one of 5 turns per application) |
| Everything else | 0 |

A full walk-through of this guide costs about 4 credits, or about 5 if you ask for a kit on the feed job in step 33. The account starts with 200. Step 36 reserves credits and returns them when you cancel.

## Support

support@usefulapply.com. Documentation: https://usefulapply.com/integrations.
