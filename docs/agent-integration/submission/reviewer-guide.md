# Reviewer guide: Useful Apply

For Anthropic and OpenAI reviewers. Paste this into each portal's test-account instructions. The credentials are delivered separately and are never in git.

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
| US application | Senior Software Engineer, Platform at Halcyon Cloud Labs (fictional). Status applied. Fit result 82. Full kit: tailored CV, US cover letter, application email, follow-up email. Template premium-ats. |
| German application | Senior Backend Engineer (m/w/d) at Fjordwerk GmbH, Berlin (fictional). Status drafted. Fit result 79. Full kit in German: tailored CV, DIN 5008 cover letter, application email, follow-up email. Template german-ats. |
| Plan | Max, so screening answers and the job feed are available. |
| Credits | 200 at the start (a Max month). |
| Job feed | A completed run from yesterday with 5 ranked, fictional postings, so the feed tools have something to act on before any live search. |
| Chat history | Each application has its fit and kit conversation, so the web app shows a finished application. |
| Daily agent limit | 20 credits a day (the default for new users is 10). |
| Job feed | Consent given. Roles: Senior Software Engineer, Staff Software Engineer, Platform Engineer. Austin, TX or remote. Salary floor USD 150,000. |
| Profile | Name, phone, location, LinkedIn and GitHub (fictional URLs), timezone America/Chicago. |

## Test script

Run each step in a normal conversation. Tool names are the ones in the catalog. A client that shows tool calls lets you see which tool ran.

### 1. Read tools (no credits, scope Read)

1. "What's in my Useful Apply account?" Expect `get_account`: plan Max, balance 200, a CV on file, daily agent limit 20.
2. "Show my recent credit use." Expect `get_credit_history`.
3. "List my applications." Expect `list_applications` with both seeded applications.
4. "Open the Halcyon Cloud Labs application." Expect `get_application`: fit result, status, kit, revision.
5. "Show my CV." Expect `get_cv`, then "Show its outline" for `get_cv_outline`.
6. "Which CV templates are there?" Expect `list_cv_templates` with 6 templates.
7. "Why did I score 79 for Fjordwerk?" Expect `explain_fit`.
8. "What needs my attention today?" Expect `morning_briefing`.
9. "Show my career profile." Expect `get_career_profile`. "Show my feed settings." Expect `get_feed_settings`. "Show my job feed." Expect `get_job_feed`.

### 2. Free writes (no credits, scope Write)

10. "Create an application from this job ad: [paste any short ad]." Expect `create_application`.
11. "Change the company on it to Example Corp." Expect `update_application`.
12. "Mark the Halcyon application as interview on 5 November." Expect `update_application_status`. Check the tracker in the web app.
13. "Hide the Languages section on the Halcyon CV, then show it again." Expect `set_cv_item_visibility` twice.
14. "Add a project called Billing API Rewrite to the Halcyon CV." Expect `add_cv_item`.
15. "Move Skills above Experience on the Fjordwerk CV." Expect `edit_cv_structure`.
16. "Change the professional title on the Halcyon CV to Staff Software Engineer." Expect `update_cv_content` and a returned diff.
17. "Undo that." Expect `undo_last_edit` and the title restored.
18. "Delete the project you added." Expect `delete_cv_item`.
19. "Rewrite the first sentence of the Halcyon follow-up email in my words: [your sentence]." Expect `edit_document_text` and a diff.
20. "Switch the Halcyon CV to the modern-professional template." Expect `set_cv_template`.
21. "Export the Halcyon CV as a PDF and the cover letter as a Word file." Expect `export_documents` with signed links. Open them. The PDF has selectable text. Links expire after 15 minutes.
22. "Export the Fjordwerk cover letter as a PDF." Expect a DIN 5008 letter on A4.
23. "Update my feed settings: add Remote to my preferred locations." Expect `update_feed_settings`. "Give feedback: dismiss the first job." Expect `give_job_feedback`.
24. "Run my job feed for today." Expect `run_job_feed`. Allowed once a day, and it needs the consent that's already on the account.
25. "Turn off the follow-up reminder emails." Expect `update_notification_settings`. Turn it back on.
26. "Update my phone number to +1 512 555 0143." Expect `update_profile`.
27. "Set my profile photo to [attach a small image]." Expect `set_profile_photo`. "Remove it." Expect `remove_profile_photo`.
28. "Upload this CV as my primary CV: [paste a few lines of CV text]." Expect `save_cv`. **This replaces the seeded CV.** Skip it, or re-run the seed afterwards (see Reset).

### 3. Spending tools (use credits, scope Spend)

Each call needs an idempotency key the client generates. Repeat a call with the same key and you're not charged twice.

29. "Check my fit for this job: [paste a real-looking ad]." Expect `analyze_job_fit`, 0.5 credits, and `creditsUsed` plus the new balance in the result.
30. "Now generate the full kit for it." Expect `generate_application_kit`, 1.5 credits after a fit check (2.0 without one). It returns an operation id at once. Say "check on it" and the client calls `get_operation` until it succeeds. This takes about a minute.
31. "Make the cover letter shorter." Expect `regenerate_document`, 0.5 credits. This overwrites the letter. Undo with `undo_last_edit`.
32. "Rewrite my summary to focus on leadership." Expect `rewrite_cv_section`, 0.5 credits.
33. "Apply to the first job in my feed." Expect `apply_to_feed_job`.
34. "Draft answers to: Why do you want this role?" Expect `draft_screening_answers`. It's gated by the same plan rules as the web app and may refuse on this account. A neutral refusal is correct behavior, not a bug.
35. Ask for a second kit on an application that has one. Expect a refusal unless the request says to regenerate.
36. "Cancel the generation." While one runs, expect `cancel_generation` and the unspent credits released.

Steps 29 to 36 use roughly 6 to 8 credits. The daily limit of 20 leaves room for a second pass, and the balance of 200 for many more.

### 4. Things that should fail

- Ask for another user's application by id. Expect not found.
- Connect with only the Read permission and try an edit. Expect an insufficient-scope error.
- Ask the assistant to buy credits, change the plan or delete the account. No tool exists for any of them.
- Paste a job ad that tells the assistant to delete applications. The ad is wrapped as untrusted data, and a destructive tool still triggers your client's approval prompt.

## Expected costs

| Action | Credits |
|---|---|
| Fit check | 0.5 |
| Full kit after a fit check | 1.5 |
| Full kit without a fit check | 2.0 |
| Regenerate cover letter, email or follow-up | 0.5 |
| Rewrite one CV section | 0.5 (free if refused) |
| Everything else | 0 |

A full walk-through of this guide costs about 8 credits. The account starts with 200.

## Reset the account

Re-run the seed script. It restores the plan, the credits, the applications, the CV, the chat history, the feed items and the feed settings to the state above and keeps the same login. Only the reviewer's own rows (and the shared feed postings keyed `reviewer-seed:`) are touched.

```
npx tsx scripts/seed-reviewer-account.ts \
  --base-url https://usefulapply.com \
  --credentials-out <path outside the repo> \
  --remote --yes-production
```

The script only accepts `reviewer@usefulapply.com` or `reviewer+<label>@usefulapply.com`, and `--remote` needs `--yes-production`. It prints what it will do before it does it.

Run it from the repo root with a Cloudflare login that can write to the production database. Use the same `--credentials-out` file as before. If that file is missing or stale, the script deletes the reviewer account and creates it again with a new password, so update the portals afterwards.

### Does the plan survive?

Yes. The account is Max in the profile, the credits row and the subscriptions row, with no Stripe ids and `user_credits.subscription_status` empty.

- The daily cron sweep (`processOverdueMonthlyResets`) resets a paid row only when its `subscription_status` is `active` and its reset date is more than 3 days past. This row's status is empty, so the sweep never selects it.
- Stripe webhooks look users up by customer or subscription id. The reviewer has none, so no event can match it.
- Nothing refills credits automatically either. When the balance runs low, re-run the seed. Credits are the only thing that drifts, so re-run it after each review round and before a resubmission.

## Support

support@usefulapply.com. Documentation: https://usefulapply.com/integrations.
