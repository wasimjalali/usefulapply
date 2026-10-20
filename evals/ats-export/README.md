# ATS and export eval

Checks the CV and cover letter export against the source data and against what an ATS reads. Write-up: `evals/results/2026-10-20-ats-export.md`. Raw output: `evals/results/2026-10-20-ats-export/raw/`.

Its own `package.json` (Playwright, pdf.js, `pdf-lib`, tsx), so the app's lockfile is untouched. It is excluded from the root `tsc`; type check it with `npx tsc --noEmit -p evals/ats-export/tsconfig.json`.

## Setup, once

```bash
npm install --prefix evals/ats-export
npx --prefix evals/ats-export playwright install chromium
bash evals/ats-export/fetch-open-resume.sh     # OpenResume parser at a pinned commit, gitignored (AGPL-3.0)
brew install poppler                           # pdftotext, pdfinfo, pdffonts, pdfimages, pdftoppm
brew install --cask libreoffice                # DOCX round trip
```

You also need to be logged in to wrangler: the renders go through real Browser Run.

## Run

```bash
# 1. The html2canvas baseline (today's export, rebuilt from git history)
npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/baseline.ts

# 2. The eval. Starts the Browser Run eval Worker on port 8793 by itself if it is not up.
npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/run.ts

# 3. Before and after numbers, the markup renderer against react-dom/server, canvas vs PDF images
npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/summarize.ts
npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/markup-parity.ts
npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/parity.ts
```

`run.ts` exits non-zero on any failure. One file: `check-file.ts <pdf> <fixture> <template>`. Debugging: `debug-pdfjs.ts`, `debug-openresume.ts`.

## Web download E2E

Needs the dev server on 8793 with the local D1 migrated and a remote Browser Run binding. Local only, never remote:

```bash
npx wrangler d1 migrations apply usefulapply-db --local
# in wrangler.jsonc set "remote": true on the browser binding, locally, and do not commit it
BETTER_AUTH_SECRET=<any test value> EXPORT_SIGNING_SECRET=<any test value> \
  NEXT_PUBLIC_SITE_URL=http://localhost:8793 BETTER_AUTH_URL=http://localhost:8793 npx next dev -p 8793
npx --prefix evals/ats-export playwright test --config evals/ats-export/playwright.config.ts
```

The spec signs up two throwaway accounts on the local server, seeds one application with a full kit into the local D1, then clicks the buttons. Trace, video and the HTML report land in `verify/feature-mcp-renderer-ats/`. The eval Worker and the dev server share port 8793, so stop one before starting the other.

## Files

| Path | What |
|---|---|
| `fixtures/` | The CV and letter fixtures, and a synthetic portrait |
| `render-worker/` | A Worker that exposes `env.BROWSER.quickAction("pdf")` over local HTTP |
| `lib/cv-checks.ts`, `docx-checks.ts`, `letter-checks.ts`, `expect.ts` | The checks |
| `lib/openresume.ts` | The ATS proxy driver |
| `service-checks.ts` | Cache key, signing, sanitizing, layout choice, names, dates |
| `e2e/` | The Playwright spec and its local seed |
