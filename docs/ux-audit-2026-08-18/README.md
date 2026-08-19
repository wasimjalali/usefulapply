# Useful Apply UX Audit, 18 August 2026

End-to-end screenshot record of the real user journey on staging (usefulapply.com), captured to feed a UX redesign toward Cursor-level simplicity.

## Capture conditions

| | |
|---|---|
| Environment | Staging, https://usefulapply.com |
| Date | 18 August 2026, 20:30 to 21:10 CEST |
| Viewport | 1441 x 902 CSS px (desktop reference), Chrome on macOS |
| Free account | wasim100ai@gmail.com, Free plan, no CV at start |
| Paid account | wasimjalali2004@gmail.com, Max plan |
| Test CV | `Alex_Morgan_CV.pdf`, 1.4 MB, fictional Product Manager |
| Test job | Product Manager, B2B Platform at Pixellot (see `job-description.md`) |

## How to read the files

- `*-scroll-NN.jpg` is one viewport, exactly what a user sees at that scroll position.
- `*-FULLPAGE.jpg` is those viewports stitched into the whole page, for judging rhythm and length.
- `BUG-*.jpg` in `99-misc/` is a defect, not a normal state.

## Folders

| Folder | Covers |
|---|---|
| `00-anonymous/` | Landing, pricing, features, login, signup, password reset |
| `02-free-onboarding/` | First-run dashboard, profile, account, notification settings |
| `03-free-cv-upload/` | Upload, parsing, parsed base CV, documents library |
| `04-free-fit-analysis/` | Job description paste, analysis progress, fit result |
| `05-free-application-kit/` | Cover letter and email panels (empty, generation was paywalled) |
| `06-free-job-feed/` | Feed empty state, build progress, results, upgrade nudge |
| `07-free-tracker/` | Application tracker list |
| `08-free-billing-limits/` | Out-of-credits paywall, subscription page |
| `09-max-account/` | Max plan dashboard, account menu, recent applications |
| `14-max-billing/` | Max subscription page |
| `15-feed-first-run-setup/` | Paid first-run feed setup wizard, consent, building, result |
| `16-feed-card-actions/` | Check Fit and Generate Kit launched from a job feed card |
| `10-max-generation/` | Full application generation, stage by stage |
| `11-max-application-kit/` | Optimised CV, cover letter, emails, screening answers, templates, ATS insights |
| `12-max-job-feed/` | Feed build, 20 results, Edit feed settings, job detail |
| `13-max-tracker/` | Tracker with the new application |
| `99-misc/` | Defects and one-offs |

## Start here if you are a new session

Read `HANDOFF.md`. It sequences the work: fix the bugs first, UX second.

## Companion documents

- `HANDOFF.md`: the brief for the next session, environment facts, repo rules, definition of done
- `flow-map.md`: step-by-step narrative of every flow, with click counts and decision points
- `friction-log.md`: every friction point, rated, with what a Cursor-style fix would be
- `bugs.md`: every defect found, with repro, evidence and confirmed cause
- `design-philosophy.md`: the redesign thesis (Cursor / Grok Bot inspiration), the ten rules every flow must pass, and the flow-by-flow order. Read before any redesign work
- `redesign/`: the redesign track. `HANDOFF.md` (where the next session picks up), `WORKFLOW.md` (the end-to-end method, the seed for a future skill), one locked design doc per flow plus artboard sources. `flow-1-first-run.md` is the shell every later flow inherits, `flow-2-application-kit.md` the kit panels, `flow-3-job-feed.md` the feed, `flow-4-tracker.md` the tracker, `flow-5-settings-billing.md` the settings modal, `flow-6-auth.md` the auth pages; each has a `png/` folder with the rendered artboards
- `job-description.md`: the job ad used for every generation run

## Coverage

Complete. Every state in the anonymous, free and Max journeys is captured, including the free user's Job Feed before a CV exists, the paid first-run feed setup wizard, and Check Fit / Generate Kit launched from job feed cards. The only boundary not crossed is Stripe checkout, by design: no card was used.
