# ATS and export eval

Checks the CV and cover letter export against the source data and against what an ATS reads. Write-up: `evals/results/2026-10-20-ats-export.md`. Committed results: `evals/results/2026-10-20-ats-export/raw/`.

Its own `package.json`, so the app's lockfile is untouched. It is excluded from the root `tsc`; type check it with `npm run typecheck --prefix evals/ats-export`. No path in it is machine specific: output goes under `verify/` (gitignored) or the folder named by an environment variable.

## Setup, once

```bash
npm install --prefix evals/ats-export
npx --prefix evals/ats-export playwright install chromium
bash evals/ats-export/fetch-open-resume.sh     # OpenResume parser at a pinned commit, gitignored
bash evals/ats-export/ats/setup.sh             # Python venv (PyMuPDF, pdfminer.six), Tika jar with a checked SHA-512
brew install poppler                           # pdftotext, pdfinfo, pdffonts, pdfimages, pdftoppm
brew install --cask libreoffice                # DOCX round trip (SOFFICE env var overrides the path)
brew install openjdk@21                        # Tika needs a JDK 17+ (JAVA_BIN env var overrides)
```

You also need to be logged in to wrangler: the renders go through real Browser Run and the AI parser stand-in uses the account's Workers AI binding (about 15 cents per full run). **No CV data goes to a third-party ATS.** Every extractor runs on this machine; the fixtures are invented.

## Run

```bash
# 1. The baseline: today's html2canvas CV export and jsPDF letter, rebuilt from git history
npm run baseline --prefix evals/ats-export

# 2. The eval. Starts the Browser Run eval Worker on port 8793 by itself if it is not up.
#    Writes to verify/ats-export-run (or ATS_EVAL_OUT). It never touches the committed results.
npm run eval --prefix evals/ats-export
#    --write replaces evals/results/2026-10-20-ats-export/raw/ (the one deliberate way to do it)
npm run eval:write --prefix evals/ats-export

# 3. Before and after tables, the markup renderer against react-dom/server, canvas vs PDF images
npm run summarize --prefix evals/ats-export [-- --write]
npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/markup-parity.ts
npm run parity --prefix evals/ats-export       # PARITY_OUT or verify/parity
```

`run.ts` exits non-zero on any failure. Re-check PDFs you already rendered, without Browser Run or the AI parser: `check-dir.ts <dir> [fixture]`. One file: `check-file.ts <pdf> <fixture> <template>`.

## The ATS proxies

All local. A CV that extracts cleanly from all of them reads cleanly to the parsers they stand for.

| Proxy | What it is | Gate |
|---|---|---|
| pdftotext (reading order and raw) | poppler | every template |
| pdf.js | the engine in browsers and many Node parsers | every template |
| Apache Tika 3.3.3 | the extractor inside many ATS and search products (stream order) | every template |
| PyMuPDF `get_text()` | default block order | every template |
| pdfminer.six | layout analysis | single-column templates; two-column templates report, because it merges a sidebar into the main column |
| OpenResume parser | a real open-source CV parser (single-column English only), pinned commit | `us-one-page` |
| AI parser stand-in | Tika text into Workers AI `@cf/openai/gpt-oss-120b`, scored field by field | at least 90% of jobs, bullets and skills on the English one-page CVs |

Per extractor and per template and fixture: every skill (as one `Label: a, b, c` line for stream readers, as a whole token otherwise), every bullet (one-to-one, no substring hits), title, employer and dates together, headings and their order, umlauts, clean link text, no date of birth or nationality on US templates.

OpenResume is AGPL-3.0. Its source is not in this repository: `fetch-open-resume.sh` downloads it at the pinned commit into `vendor/` (gitignored) and `lib/openresume.ts`, which is our own code, calls it unmodified.

## Web download E2E

Needs the dev server on 8793 with the local D1 migrated and a remote Browser Run binding. Local only, never remote:

```bash
npx wrangler d1 migrations apply usefulapply-db --local
# in wrangler.jsonc set "remote": true on the browser binding, locally, and do not commit it
BETTER_AUTH_SECRET=<any test value> EXPORT_SIGNING_SECRET=<any test value> \
  NEXT_PUBLIC_SITE_URL=http://localhost:8793 BETTER_AUTH_URL=http://localhost:8793 npx next dev -p 8793
npm run e2e --prefix evals/ats-export
```

The spec signs up two throwaway accounts on the local server, seeds one application with a full kit into the local D1, then clicks the buttons. Trace, video and the HTML report land in `verify/e2e-report` and `verify/e2e-output` (`E2E_REPORT_DIR`, `E2E_OUTPUT_DIR`). The eval Worker and the dev server share port 8793, so stop one before starting the other.

## Files

| Path | What |
|---|---|
| `fixtures/` | The CV and letter fixtures (US, German, French, over-cap, long entry, personal data and links, hostile text, a nine-line sender) and a synthetic portrait |
| `render-worker/` | A Worker that exposes `env.BROWSER.quickAction("pdf")` and the AI binding over local HTTP |
| `lib/cv-checks.ts`, `docx-checks.ts`, `letter-checks.ts`, `expect.ts` | The checks |
| `lib/ats-proxies.ts`, `ats/` | Tika, PyMuPDF and pdfminer.six drivers and their setup |
| `lib/openresume.ts`, `lib/ai-parser.ts` | The OpenResume driver and the AI parser stand-in |
| `service-checks.ts` | Cache key, signing, sanitizing, layout choice, names, dates, hidden state |
| `e2e/` | The Playwright spec and its local seed |
