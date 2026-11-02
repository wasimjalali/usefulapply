# Plan: Useful Apply desktop app (2026-11-02)

Final plan, agreed with Wasim. Nothing here is built yet.

- **The new app is built in a new repo.** This repo stays intact as the legacy product. We copy what we need from it and change nothing here.
- **Design:** [Doop canvas](https://doop.design/c/_NLWh_hojB) and [prototype](https://doop.design/c/_NLWh_hojB/proto). A snapshot is saved in [`2026-11-02-desktop-app-canvas/`](2026-11-02-desktop-app-canvas/index.md). Start at frame `01 Build map`.

## Summary

Useful Apply becomes a free Mac app with no AI inside it. The interface is ours, and the thinking comes from the agent already installed on the user's machine, on their own subscription.

The new repo leaves hosted chat, credits, billing and accounts behind. We don't add Pi or any agent SDK. Version 1 aims for adoption, not income.

## Decisions

| Question | Decision |
|---|---|
| Where does the code live? | A new repo. This repo stays intact as the legacy product |
| Where does data live? | Only on the user's computer, with no accounts or server |
| Which agents? | Claude Code and Codex (ChatGPT). Gemini is out, see below |
| How do we run Claude Code? | `claude -p`, not the Agent SDK |
| What do we take from OpenBot? | Its behavior, rebuilt from reading its code. No copied code, because its license is PolyForm Noncommercial |
| Where do jobs come from? | The career-ops scanners. No SerpAPI |
| What comes first in first run? | The agent, because the agent reads the CV. Then the CV, then the search |
| How does the chat open? | As a side panel beside the page, never a popup over it |
| Which systems? | macOS only |
| App signing? | No paid Apple signing. It installs with one Terminal command, like Useful Bot |
| Income in version 1? | None. The goal is more people using it |
| Who is version 1 for? | Technical people first. It must still feel grandma-simple and premium, with no tutorial |
| May the agent pick and score new jobs without asking? | No by default. One question in first run, because it spends their usage |
| Interface language? | English, with German documents |
| Which markets? | Germany first, because Wasim uses it too. Then the US, the UK and Canada. Elsewhere after, and users can add companies themselves |

**Why Gemini is out.** Wasim's rule: use something only if it's lawful and permissible. Google's [Antigravity FAQ](https://antigravity.google/docs/faq) says wrapping `agy` inside third-party apps "is not supported under consumer plans", and its [terms](https://antigravity.google/terms/) ban using the service with products Google doesn't provide. Login with Google for [Gemini CLI](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals) ended for personal accounts on 18 June 2026. OpenBot and T3 Code both offer Google sign-in through Google's own server, but we found no exception for that in Google's terms. Revisit only if Google allows it.

## Product shape

Four things make up the product: the user's agent, small skills, 5 tools and our interface. Everything runs on the user's computer except the AI model and the public job sources. The diagram is canvas frame `03 How it connects`.

The app starts the agent and streams its replies into our chat. The agent reads skills, then works through the 5 tools, and the interface redraws from the same local data.

## Interface

The app has five screens: First run, Today, Jobs, Applications and Settings. Workspace stops being a screen. The papers live on an application's own page, and the agent lives in a side panel, the Ask panel, that opens from the chat box on any screen after first run.

The app, not the agent, decides what the user sees next. Today is plain code over the local database, so it opens instantly and costs no tokens. The agent only runs when the user asks it to do something. There is no tutorial, and nothing is on screen unless it's needed.

### Screens to build: 42

| Screen | What it does | Frames | Logic to reuse from this repo |
|---|---|---|---|
| First run (6) | Find the agent, test it, import the CV, confirm the search, run the first scan | N1, N2, F1, F2, G1, G3 | Parsing behind `FileUpload` and `CVInputZone` |
| Today (6) | Opens on the next thing to do | A1, A5b, A6, T1, T3, T4 | Next-step rules in `tracker-status.ts` |
| Jobs (6) | Job list, job page with the fit on it, how I search | A2, G5, G7, J1, J3, F8 | `job-ad-text`, `feed-format.ts` |
| Applications (9) | List in groups, one application's page, status and next step | A7, A8, P1, P2, P3, P4, P6, P7, P8 | `tracker-status.ts` |
| Papers (9) | CV, letter, emails and answers, edited on the paper | A4, A5, A9, D1, D2, D3, D5, D6, D10 | `cv-templates/`, CV structure, edit history |
| Ask panel (3) | Chat with the agent, in a side panel on every screen after first run | K1, K2, K5 | None |
| Settings and errors (3) | One page: agent, me, my CV, where data is stored | S1, S6, U7 | Parts of `settings/` |

Build the screens from `02 Parts`. Old components are reused for their logic only.

### The side panel

Frame `05 Side panel` shows each stage. Every screen with a chat box already behaves this way in the prototype.

| Place | What happens |
|---|---|
| Today, Find jobs, My applications | It slides in from the right, 480px wide. The page moves left and stays usable, and its cards stack when needed |
| An application's papers | It takes the right column. The paper doesn't move, so the user watches it change |
| After a change | The changed part is marked on the page, with "Put it back" in the chat |
| First run | No chat. One step at a time |
| Buttons such as Check my fit and Write my application | They don't open the chat. The work shows on the page |
| Prep me and Help me reply | They open the panel and start the answer |
| Moving between screens | It stays open until the user closes it. Each application keeps its own conversation |
| The smallest window | The page gets 700px, from the 1180px minimum window |

In the prototype, the panel closes when you move to another frame, because each frame is its own page. The app keeps it open, as above.

### Left out of the new app

| Left out | Why |
|---|---|
| Login, signup, password, auth and OAuth pages, connected apps | No accounts |
| Subscription, credits, upgrade walls, every credit line in the copy | No payment |
| `admin-dashboard` and its 5 sub-pages | No hosted usage to monitor |
| Signed-out first run (`GuidedLine`, `GuidedStepper`) | The agent has to be connected first. A user with a job ad pastes it into Ask |
| Separate fit screens | The fit goes on the job page |
| "Not for me" dialog | It acts at once, with Undo |
| "Fix the job details" dialog | Job details edit in place |
| "What didn't work out" page, "What I changed" page | Both open in place |
| Separate CV and letter edit screens | One screen: click on the paper and type (D6) |
| Download dialog | "Download both" gives PDFs. A quiet link gives Word |
| Settings tabs, My CV page, reminder toggles, long CV, start date and pay fields | One page is enough. The app asks for start date and pay only when an ad needs them (F8) |
| Lowest pay, right to work and words to avoid fields | Almost no ad states pay. The other two can be set through Ask |
| Phone screens, `MobileFeed` | Mac app |
| Saved jobs, editable search lists, level, job type and language filters, career profile card | A job stays listed until the user decides. Titles and places are enough |
| Tracker table, filter pills, thumbs, feedback dialog, PDF preview dialogs, ATS percentage, `AgentProgressV2`, `NamedStages` | Clutter, or replaced by the new design |
| CV looks Executive, Portrait Classic and Classic Green | Three is enough. Portrait ATS is the default for Germany |
| Email reminders | No server. Today, a Mac notification and the dock badge replace them |

### States the design covers

- Agent not found, with a guided setup
- Agent found but signed out, or out of date
- Test message failed
- Agent hit its usage limit, offering the other installed agent
- No agent connected: jobs, tracker and editing still work, and writing asks for one
- Agent working, in plain words such as "Writing your cover letter", with a Stop button. Tool names stay hidden under "Details"
- A saved document with claims the fact check couldn't confirm, shown on the paper with "Fix it" or "Keep it, it's true"
- A scan where some companies couldn't be reached. The scan still finishes
- No internet
- Update ready

The writing screen (A4) fills each paper when `save_document` returns. The window has a hidden title bar with room for the Mac window buttons, and a minimum width of 1180px. All names and numbers on the canvas are examples.

### How screens stay in sync

Screens don't call `/api` routes or hold document state of their own. They use one typed bridge, `window.ua`. Write the types first, and start the interface on fake data behind the same types.

| Screen | Reads and writes through | Listens for |
|---|---|---|
| First run, Settings | `agent.detect`, `agent.select`, `agent.install`, `agent.login`, `agent.test`, `settings.get`, `settings.save`, `cv.import`, `data.reveal`, `data.deleteAll` | `agent:status` |
| Today | `today.get` | `data:changed` |
| Jobs | `jobs.scan`, `jobs.list`, `jobs.get`, `jobs.decide`, `search.get`, `search.save`, `companies.list`, `companies.add`, `companies.remove` | `scan:progress`, `data:changed` |
| Applications | `applications.list`, `applications.get`, `applications.update`, `applications.delete`, `documents.get`, `documents.save`, `documents.restore`, `documents.setLook`, `export.pdf`, `export.word` | `data:changed` |
| Ask panel | `agent.send`, `agent.stop`, `thread.get` | `agent:event` |

`today.get` returns one ordered list, using the ladder in `01 Build map`. Each application has its own agent thread, plus one general thread. There's no chat history screen. Undo and "Put it back" call `documents.restore` from the interface, not through the agent.

## Job engine

Take only the scanners from [career-ops](https://github.com/career-ops-hq/career-ops), about 3,600 lines of its 592,000. They read public job sources directly and use no AI, so scanning costs us and the user nothing. Job Hunt already runs this setup at reviewed commit `86979c5`: one run on 2026-11-01 read 142 German sources and 9,478 postings, found 118 new jobs, took about 10 seconds and used no AI or API keys. The Arbeitsagentur gave 93 of those 118.

| Source | File in `providers/` | Lines | Why |
|---|---|---|---|
| Arbeitsagentur | `arbeitsagentur.mjs` | 385 | Germany's federal job board |
| Personio | `personio.mjs` | 527 | Common across DACH and the EU |
| Softgarden | `softgarden.mjs` | 146 | German-market ATS |
| Join | `join.mjs` | 344 | German-market ATS |
| Recruitee | `recruitee.mjs` | 502 | Common in the EU |
| Greenhouse | `greenhouse.mjs` | 284 | Tech companies |
| Ashby | `ashby.mjs` | 557 | Tech companies |
| Lever | `lever.mjs` | 133 | Tech companies |
| SmartRecruiters | `smartrecruiters.mjs` | 269 | Large employers |
| Arbeitnow | `arbeitnow.mjs` | 127 | German and EU jobs |
| Workable | `workable.mjs` | 345 | Smaller companies |

Also take the shared helpers these files import, such as `_http.mjs`. It needs Node networking, which the desktop app has. Workday (1,294 lines) and ATS auto-discovery can come in a second batch.

**Leave behind:** `scan.mjs` (5,283 lines), the updater, modes, tracker scripts, batch runner, Go dashboard and web app.

**What to build around them:**

1. A small runner: load the company list, call each source's `fetch(entry, ctx)`, normalize the jobs, remove duplicates and save them. A failing company is recorded, never fatal.
2. A starter company list for Germany. Start from `scanner/portals.yml` in `job-hunt`, which has 140 live boards, and apply its `discover-ats` patch when discovery arrives. That list leans to AI and tech, so broaden it for other jobs and remove any notes about Wasim's own search. Lists for the US, the UK and Canada come next, then the rest.
3. Add-a-company: the user pastes a careers link, and each source's `detect(entry)` works out which scanner fits.
4. A second step that reads the full ad, checks it's still open and pulls out facts such as required German level and years. Start from `scanner/check-ads.mjs` in `job-hunt`, which already does this.
5. Filters in code: titles, place, age, words to avoid and right to work. Pay can't filter, because almost no ad states it (1 of 118 in that run). Keep jobs with no pay.
6. Fixes to our copy: map the pay fields the Arbeitsagentur returns, and fill its missing posted date from the detail API.

Scoring isn't part of the engine. The user's agent scores jobs using the `score-job` skill. It sees full ads only for jobs that pass the filters, up to a limit we set after testing.

**When it runs:** scanning is free and local, so it runs on app open, at most once a day, and on "Find new jobs". Picking and scoring spend the user's agent, so they wait for a click: "Pick the best for me" on Today and Jobs. The one question in first run can let the agent do this on its own. It's off by default.

**Rules to follow:**

- Keep the MIT license notice with the copied code.
- Don't call the product career-ops. Its trademark policy allows "based on career-ops".
- Check the Arbeitsagentur terms first, because the scanner uses the public key from that website. By Wasim's rule, a source that isn't permitted comes out.
- StepStone, XING and LinkedIn have no scanner. For now, users paste those links and the agent reads them.
- Keep the same address blocking and timeouts in `_http` and `_ip-guard`. Test them under Electron's Node first.

**Done when:**

- A scan of the German list returns jobs from every source that has any.
- A broken company is reported instead of stopping the scan.
- A second run adds no duplicates.
- A posting with no pay, no date or an unreadable ad still shows correctly.

## Agent connection

The desktop app finds the CLI the user already installed, runs it in the background and shows its replies in our chat. We never see or store the user's login, because each CLI keeps its own.

| CLI | How we run it |
|---|---|
| Claude Code | `claude -p` with `--output-format stream-json`, `--verbose`, `--include-partial-messages`, `--resume` and `--mcp-config` |
| Codex | `codex app-server`, its official interface for rich clients |

**What to reuse:**

- **From OpenClaw:** its CLI backend pattern. Each CLI is one entry of settings for command, arguments, resume and output format, and tools reach it through a local MCP server with a token. Check its license before copying code.
- **From career-ops (MIT):** `web/src/lib/clis.ts` for finding CLIs, `spawn-cli.mjs` and `cli-fencing.mjs` for restricting what a CLI can do.
- **From OpenBot 0.58.0:** how it finds, sets up, signs in, updates and reconnects CLIs, as written in the flow below. We rebuild the behavior and copy no code. One difference: it runs Claude through the Agent SDK, and we use `claude -p`.

### First-run flow

Frame `04 First run flow` shows the order and what happens when something's off.

1. Look for each CLI in the login shell's PATH, then common install folders, because apps opened from the desktop don't get the terminal's PATH. Run `--version` with a timeout and compare it to our minimum version.
2. Check login with `claude auth status --json`, and Codex's `account/read` through its app server. Only a clear status counts as logged out. A timeout or unreadable reply keeps the last state.
3. Show what was found and whether it's logged in, with no terminal anywhere in the flow.
4. If nothing is found, one click sets up the agent: download the vendor's published CLI, unmodified, into the app's own folder and verify its checksum.
5. If it's logged out, start the CLI's own login: `claude auth login --claudeai`, or Codex's `account/login/start`. The browser opens, and we never see or store a token.
6. Run one small test message, then continue to CV import. The agent reads the CV, which is why it comes first.
7. Confirm the search on the screen built from the CV, with the one question about picking jobs (G1).
8. Run the first scan (G3), then open the job list (A2).
9. "Skip for now" goes straight to How I search (G5), where the user types titles and places. Scanning, the job list, tracker and editing work. Reading a CV, picking and writing wait until an agent is connected from Settings or Ask.

### Keeping it connected

- The user's own CLI wins when it's at least as new as our copy. We never update or change their install. If it's older, we say so.
- Our own copy updates itself, checked on launch and then hourly, and only swaps when the agent is idle.
- Keep one session ID per thread and CLI: `--resume` for Claude, `thread/resume` for Codex. If a session is gone, start a new one and pass our saved summary of the thread.
- Report each state clearly: not installed, out of date, logged out, usage limit or failed to start. Restart a crashed process up to 3 times with growing waits.
- Stop by interrupting the turn, then ending the whole process tree. Close idle processes after 10 minutes and resume from disk.

### Details that will bite if missed

- Don't use `claude --bare`. It skips skills and never reads the subscription login.
- An `ANTHROPIC_API_KEY` in the environment can bill per token instead of using the subscription. Show the user which one is active.
- Close stdin when launching. `codex exec` otherwise waits forever, according to career-ops.
- Each CLI session runs in the app's own workspace folder, never the user's home folder.
- Clear Claude session variables such as `CLAUDECODE` before launching, as OpenBot does.
- `codex app-server` is marked experimental in its own help, so set a minimum version and test each update.

### Safety

Job ads are untrusted text, and they reach an agent that may have shell access on the user's machine. So each run allows only our 5 tools plus reading the web where possible, with no shell and no file writes. Claude Code and Codex can both be restricted this way.

## Skills

Today's 191 KB of prompts become about 16 small skills that load only when needed, at most 60 lines each. That's a target for the evals to test.

Each skill is a folder with a `SKILL.md`, following the Agent Skills format. The app ships them in its workspace folder, under `.claude/skills/` and `.agents/skills/`.

| Skill | One job | Source in this repo |
|---|---|---|
| `import-cv` | Turn an uploaded CV into structured data | `parse-cv` route |
| `no-invented-claims` | Only state what the CV supports, and how to handle a flagged claim | Rules across all prompts |
| `writing-voice` | Plain, human wording with no AI tells | Rules across all prompts |
| `score-job` | Score fit and name the gaps honestly | `fit-assessment-prompt.ts` (11 KB) |
| `find-jobs` | Run a scan and shortlist against the user's targets | Job feed ranking prompt |
| `tailor-cv` | Tailor a CV to one job | `cv-prompt.ts` (47 KB) |
| `rewrite-cv-section` | Change one CV section on request | `cv-prompt.ts` |
| `cv-germany` | German CV conventions | `cv-prompt.ts` |
| `cv-english-markets` | US, UK and Canada conventions | `cv-prompt.ts` |
| `write-letter` | Structure and argument of a cover letter | `cover-letter-prompt.ts` (33 KB) |
| `letter-germany` | Sie form, Betreff, DIN 5008, closing line | `cover-letter-prompt.ts` |
| `application-email` | The email that goes with an application | `email-prompts.ts` (34 KB) |
| `follow-up-email` | Follow-ups and their timing | `email-prompts.ts` |
| `screening-answers` | Answer form questions from the user's own facts | `logistics-prompt.ts` (16 KB) |
| `track-application` | Keep the tracker current | `tracker-prompt.ts` (7 KB) |
| `interview-prep` | Get ready for an interview from the CV and the ad | "Prep me" in `tracker-prompt.ts` |

The chat prompt (34 KB) and compaction prompt (10 KB) mostly go, because the user's agent already handles conversation and memory.

**What goes where:**

- **Skill:** judgment and style, such as how to frame experience.
- **Tool:** reading and saving data.
- **Code:** rules that must never break, such as the fact check, valid document structure and PDF output.

**Done when:** kits made with the skills are judged at least as good as the stored Sonnet 5.5 results in this repo's `evals/results/2026-10-12-sonnet-eval`, with no more invented claims, on both Claude Code and Codex. Include German cases. If a rule was cut and quality drops, it goes back into the smallest skill that fixes it.

## Tools

The agent gets 5 tools, down from today's 45. The app serves them to each CLI through a local MCP server, so the same tools work on both.

| Tool | What it does | Replaces today |
|---|---|---|
| `get_data` | Reads the CV, profile, an application, the tracker or listed jobs | `get_cv`, `get_cv_outline`, `get_application`, `list_applications`, `get_job_feed`, `get_career_profile`, `list_cv_templates` |
| `save_document` | Saves a CV, letter, email, fit report or screening answers. Checks the structure, runs the fact check and returns any unconfirmed claims | `update_cv_content`, `edit_document_text`, `add_cv_item`, `edit_cv_structure`, `generate_application_kit`, `regenerate_document`, `rewrite_cv_section`, `draft_screening_answers`, `analyze_job_fit` |
| `search_jobs` | Runs the job engine with the user's filters and skips jobs already in the tracker | `run_job_feed`, `update_feed_searches`, `update_feed_settings` |
| `update_application` | Creates an application, or changes its status, notes or follow-up date | `create_application`, `update_application`, `update_application_status`, `apply_to_feed_job` |
| `export_pdf` | Renders the CV or letter as a PDF and returns the file path | `export_documents` |

**Rules for the tools:**

- The agent can't delete or send. Deleting, sending, undo, template choice and photos stay in the interface, where the user does them by hand.
- `save_document` always runs the fact check, so an agent can't skip it. It reports problems and doesn't block the save, and the interface shows them to the user.
- Text from job ads comes back marked as untrusted, reusing the existing `UNTRUSTED_NOTE`.
- Each tool's description stays short, because every run pays to read it.

Credits and account tools, consent, notification settings and `cancel_generation` don't come over, because nothing generates on our side anymore.

## Backend

The backend runs inside the desktop app, with data stored on the user's machine and no server. That makes it free to run per user, needs no accounts and matches the local-data promise of career-ops.

**Bring over from this repo and adapt (copy, don't move):**

| Part | Lines today | Change |
|---|---|---|
| CV templates (`src/components/cv-templates`) | 2,725 | Keep |
| CV structure and template logic | about 3,300 | Keep |
| PDF export (`src/lib/services/export`) | 3,104 | Keep the templates and print rules. Replace Browser Run with Electron's built-in PDF printing |
| Word export (`cv-docx.ts`, `letter-docx.ts`, in `src/lib/services/export`) | Measure when copying | Keep, alongside PDF |
| Fact check and document validators | Part of 5,575 in `lib/agents` | Move out of the writer pipeline into `save_document` |
| Edit history | 328 | Keep, for undo |
| Database | 47 tables today | Local SQLite with only what the five screens need, reusing Drizzle |
| MCP framework | Part of 5,291 | Keep the framework, drop OAuth and 40 tools |

`today.get` runs in the app. So does the check for due follow-ups and interviews, which drives the Mac notification and the dock badge.

**Don't bring over:**

| Part | Lines |
|---|---|
| Hosted AI: writer pipeline, model layer, prompts, chat and kit routes, chat tools | 20,390 |
| Old chat interface | 6,135 |
| Credits, Stripe, admin | 5,422 |
| Hosted feed: server, ingestion and SerpAPI | 4,653 |
| AI feed ranking and search strategy | 2,198 |
| Session sync engine | 1,186 |
| Email templates | 611 |
| Cron jobs | 607 |
| Rate limiter | 330 |
| Better Auth, OAuth routes, R2 and KV wiring, legacy `supabase/` folder | Not measured |

That's at least 40,000 of this repo's 117,000 lines that the new app doesn't need. They stay here, untouched.

**Desktop shell:** Electron. It runs Node for the CLIs and job engine, and bundles Chromium, so PDFs come out the same on every computer. Tauri uses each system's own web view, which puts that consistency at risk. Confirm the details in the Electron docs when building.

## Install and updates

Version 1 installs the way [Useful Bot does](https://github.com/wasimjalali/useful-bot-releases), with one Terminal command that downloads the app from a release:

```sh
curl -fsSL <release URL>/install.sh | sh
```

Follow `scripts/install.sh` in the `useful-bot` repo. It needs Apple silicon and macOS 14 or later, and it installs to `/Applications`, or to another folder set by an environment variable. It downloads the zip, checks its SHA-256 against the value published with that release, verifies the code signature, quits any running copy, clears the quarantine flag and opens the app. No Apple Developer ID is needed, but the app must still carry a local ad-hoc signature, or `codesign --verify --strict` fails.

**Updates need their own updater.** Useful Bot uses Sparkle, a native updater for Mac apps, and this is an Electron app. [Electron's docs](https://www.electronjs.org/docs/latest/api/auto-updater) say "Your application must be signed for automatic updates on macOS". So build a small updater that checks each download against a key we hold, then shows the "An update is ready" state in T4. The fallback is running the install command again. Read the current docs before building this.

## Order of work

Implementation is planned for a weekend, when there's time. The riskiest piece comes first: proving that an installed CLI can work through our tools from inside the app.

| Step | Work | Done when |
|---|---|---|
| 1 | Create the new repo and copy the parts listed under Backend | The new repo type-checks. This repo has no changes |
| 2 | Agree the `window.ua` types | Types are committed |
| 3 | Electron shell, local database, the bridge and the 5 tools over local MCP | The bridge works from a test page |
| 4 | Connect Claude Code and Codex | Each CLI, from the app, reads a CV and saves a tailored one that appears on screen |
| 5 | Job engine with the German company list. Can start at step 2 | The job engine's done-when passes |
| 6 | Build the interface from the canvas, on fake data until step 3 lands | All five screens and the Ask panel work, with every state above |
| 7 | Write the skills and run the evals | The skills' done-when passes |
| 8 | Connect everything and test end to end | A German job goes from scan to score, CV, letter, PDF and tracker on both CLIs |
| 9 | Ad-hoc signing, install script, updater and release | A clean Mac installs with one command, finishes the step 8 flow and receives an update |

## Risks

| Risk | What we do |
|---|---|
| Anthropic can change or enforce its rules without notice. Its legal page lets an end user sign in to the unmodified Claude Code binary with their own plan, including inside another product, under set conditions. Its limits assume ordinary, individual use | Follow the conditions: run the unmodified CLI, leave every login method on, never pay for or resell usage, login only through the vendor's own flow, never touch tokens, name the CLI in plain text with no logo, and accept Anthropic's Commercial Terms. Supporting two CLIs means no single vendor can stop the product |
| Quality now depends on the user's model. In our eval, gpt-oss invented a claim in 24 of 80 screening answers, against 1 of 80 on Haiku | The fact check always runs, and the interface shows the agent's model |
| CLI updates can break our connection | One settings entry and a minimum version per CLI. Check versions on launch, and tell the user when one is out of date |
| career-ops is already free, popular and has its own interface | Compete on the visual editor, PDF quality, German documents and a simple install |
| Installing a CLI and paying for a plan is too much for many job seekers | Guided setup, and jobs, tracker and editing work with no agent. Test it with one non-technical person before launch |
| The install command clears Apple's quarantine flag, which some people won't trust | Publish the script and each release's checksum. Revisit Apple signing if adoption needs it |
| German coverage depends mostly on the Arbeitsagentur and our company list | Maintain the list, and make pasting an ad or link easy |
| The scanners change quickly upstream, and Arbeitsagentur API versions change | Pin a commit, update on purpose, and report broken sources in the scan result |
